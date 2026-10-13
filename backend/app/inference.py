"""
app/inference.py - one series in, a prediction + its evidence out.

The model only accepts series of ONE fixed length T (1008 for WebTraffic, 140 for ECG5000...),
because that length is frozen inside the ONNX file. So first we decide how to read the series:

    shorter than T  -> "resampled": stretch it to T points (and map the evidence back after)
    exactly T       -> "exact":     use it as it is
    longer than T   -> "windows":   cut it into windows of T points and predict each window.
                                    if the last piece is shorter than T, the last window is taken
                                    from the END of the series, so it overlaps the one before a bit
                                    (better than throwing the end away)

Then, for every window, the same steps as in training:
    z-normalise (mean 0, std 1) -> run the ONNX model -> softmax -> evidence regions

We also time each step and describe its input and output in a few words. The frontend shows that
list as the pipeline progress, so the user can see what really happened to their series.

Everything here is plain numpy, so it is easy to test without a server.
"""
import math
import time

import numpy as np

from app.registry import LoadedModel

MIN_POINTS = 16
MAX_POINTS = 20_000
MAX_WINDOWS = 50          # keeps one request small (50 windows = one quick onnx call)


class InputError(ValueError):
    """The series itself is bad (too short, has NaN...). The API turns this into a 422 answer."""


# --------------------------------------------------------------------------------------------
# small numpy helpers
# --------------------------------------------------------------------------------------------
def clean_series(values) -> np.ndarray:
    x = np.asarray(values, dtype=np.float64)
    if x.ndim != 1:
        raise InputError("the series must be a flat list of numbers")
    if len(x) < MIN_POINTS:
        raise InputError(f"the series is too short: {len(x)} points, need at least {MIN_POINTS}")
    if len(x) > MAX_POINTS:
        raise InputError(f"the series is too long: {len(x)} points, the limit is {MAX_POINTS}")
    if not np.isfinite(x).all():
        raise InputError("the series contains empty, NaN or infinite values")
    return x


def resample(x: np.ndarray, n: int) -> np.ndarray:
    """Stretch or squeeze x to exactly n points with straight-line interpolation."""
    if len(x) == n:
        return x.copy()
    old = np.linspace(0.0, 1.0, len(x))
    new = np.linspace(0.0, 1.0, n)
    return np.interp(new, old, x)


def z_normalise(x: np.ndarray) -> np.ndarray:
    # same as the training code: torch.std is the sample std (ddof=1), and a flat line keeps std=1
    std = x.std(ddof=1)
    if std == 0:
        std = 1.0
    return (x - x.mean()) / std


def softmax(z: np.ndarray) -> np.ndarray:
    z = z - z.max()                     # subtract the max so exp() never overflows
    e = np.exp(z)
    return e / e.sum()


def time_label(i: int, interval_min: float | None) -> str | None:
    """Point index -> 'Day 3, 14:20' (counted from the start of the series)."""
    if not interval_min:
        return None
    minutes = int(round(i * interval_min))
    day, rest = divmod(minutes, 24 * 60)
    return f"Day {day + 1}, {rest // 60:02d}:{rest % 60:02d}"


def window_starts(n: int, T: int) -> list[int]:
    """
    Where each window of length T starts, for a series of n >= T points.
    e.g. n=2500, T=1008 -> [0, 1008, 1492]  (the last one ends exactly at the end)
    """
    starts = list(range(0, n - T + 1, T))
    if starts[-1] + T < n:
        starts.append(n - T)
    return starts


# --------------------------------------------------------------------------------------------
# turning per-step scores into a few readable "evidence regions"
# --------------------------------------------------------------------------------------------
def find_regions(score: np.ndarray, top_frac: float = 0.1, max_regions: int = 5,
                 min_share: float = 0.02) -> list[dict]:
    """
    Group the strongest supporting time steps into stretches.

    score : one number per time step, > 0 means "this step supports the predicted class".
    top_frac : the share of steps we look at (the strongest 10%).
    min_share : stretches with less than this share of the evidence are dropped.
    returns : up to max_regions dicts {start, end, share}, biggest share first.
              share = how much of the total positive evidence sits inside that stretch.
    """
    n = len(score)
    pos = np.clip(score, 0.0, None)
    total = pos.sum()
    if total <= 0:
        return []

    k = max(1, math.ceil(top_frac * n))
    threshold = np.sort(score)[-k]                # the k-th biggest score
    idx = np.flatnonzero((score >= threshold) & (score > 0))
    if len(idx) == 0:
        return []

    # walk through the strong points and cut a new stretch when the gap gets too big.
    # small gaps are bridged so one event does not turn into 10 tiny pieces
    gap = max(2, n // 100)
    runs = []
    start = prev = int(idx[0])
    for i in idx[1:]:
        i = int(i)
        if i - prev > gap + 1:
            runs.append((start, prev))
            start = i
        prev = i
    runs.append((start, prev))

    regions = [{"start": s, "end": e, "share": float(pos[s:e + 1].sum() / total)} for s, e in runs]
    # drop crumbs that hold almost none of the evidence, they only clutter the chart
    regions = [r for r in regions if r["share"] >= min_share]
    regions.sort(key=lambda r: r["share"], reverse=True)
    return regions[:max_regions]


def describe_region(x: np.ndarray, start: int, end: int) -> dict:
    """
    A few plain numbers about what the raw signal does inside a region, compared to the whole
    window. The LLM gets these so it can say "traffic dropped by 80%" instead of guessing.
    """
    inside = x[start:end + 1]
    series_mean = float(x.mean())
    shift = float(inside.mean()) - series_mean

    # "30% lower than average" only makes sense for a signal that never goes below 0 (visits, kW).
    # ECG or sensor data is often already centred on 0, so the average is ~0 and a percent blows
    # up (we once got "-190 million %"). for those we only give the shift in standard deviations
    level_change = None
    if x.min() >= 0 and series_mean > 1e-9:
        level_change = round(100.0 * shift / series_mean, 1)

    # the same shift measured in standard deviations of the window: works for any signal.
    # about 1 = a clear shift, 2 or more = a big one
    std = float(x.std())
    level_change_sd = round(shift / std, 2) if std > 0 else None

    # "roughness" = how jumpy the signal is from one step to the next. >1 = noisier than usual,
    # <1 = smoother than usual. needs a few points to mean anything
    roughness = None
    if len(inside) >= 4:
        overall = np.diff(x).std()
        if overall > 0:
            roughness = round(float(np.diff(inside).std() / overall), 2)

    return {
        "length": int(end - start + 1),
        "mean_inside": round(float(inside.mean()), 3),
        "mean_overall": round(series_mean, 3),
        "level_change_pct": level_change,
        "level_change_sd": level_change_sd,
        "min_inside": round(float(inside.min()), 3),
        "max_inside": round(float(inside.max()), 3),
        "roughness_ratio": roughness,
    }


# --------------------------------------------------------------------------------------------
# the main entry point
# --------------------------------------------------------------------------------------------
def _num(v: float) -> str:
    return f"{v:,.2f}"


def predict(model: LoadedModel, values) -> dict:
    t_all = time.perf_counter()
    steps = []

    def add_step(key, title, given, got, t0):
        steps.append({"key": key, "title": title, "input": given, "output": got,
                      "ms": round((time.perf_counter() - t0) * 1000, 2)})

    # ---- step 1: read and check the numbers ---------------------------------------------
    t0 = time.perf_counter()
    x = clean_series(values)
    n = len(x)
    T = model.input_length
    add_step("read", "Read the numbers", f"{n:,} values",
             f"all valid · min {_num(x.min())} · max {_num(x.max())}", t0)

    # ---- step 2: prepare = choose how to read it + normalise each window -----------------
    t0 = time.perf_counter()
    if n < T:
        mode, starts = "resampled", [0]
        pieces = [resample(x, T)]
        how = f"stretched from {n:,} to {T:,} points"
    elif n == T:
        mode, starts = "exact", [0]
        pieces = [x]
        how = f"already {T:,} points, used as it is"
    else:
        mode, starts = "windows", window_starts(n, T)
        if len(starts) > MAX_WINDOWS:
            raise InputError(f"that is {len(starts)} windows of {T} points - the limit is "
                             f"{MAX_WINDOWS}. Please send a shorter series.")
        pieces = [x[s:s + T] for s in starts]
        how = f"cut into {len(starts)} windows of {T:,} points"
    batch = np.stack([z_normalise(p) for p in pieces]).astype(np.float32)[:, None, :]  # (B, 1, T)
    add_step("prepare", "Prepare the data", f"{n:,} values",
             f"{how} · each scaled to mean 0, spread 1", t0)

    # ---- step 3: the model (loaded once when the server started) -------------------------
    t0 = time.perf_counter()
    info = model.export_info
    size = info.get("onnx", {}).get("size_kb")
    params = info.get("params")
    add_step("model", "Load the model", "model.onnx" + (f" ({size / 1024:.1f} MB)" if size else ""),
             "already in memory" + (f" · {params:,} weights" if params else ""), t0)

    # ---- step 4: run it ------------------------------------------------------------------
    t0 = time.perf_counter()
    logits, interp = model.session.run(None, {"series": batch})   # (B, C), (B, C, T)
    C = logits.shape[1]
    add_step("run", "Run the model", f"{len(starts)} × {T:,} numbers",
             f"{C} class scores + {C} × {T:,} evidence scores per window", t0)

    # ---- step 5: turn raw scores into answers -------------------------------------------
    t0 = time.perf_counter()
    # time labels only make sense when the timing of the points is kept (not when stretched)
    interval = model.manifest["domain"].get("sampling_interval_minutes") if mode != "resampled" else None

    windows = []
    for w, s in enumerate(starts):
        probs = softmax(logits[w].astype(np.float64))
        order = np.argsort(-probs)
        pred = int(order[0])

        if mode == "resampled":
            # map the evidence back onto the user's own points
            raw, offset = x, 0
            attr = resample(interp[w, pred].astype(np.float64), n)
        else:
            raw, offset = pieces[w], s
            attr = interp[w, pred].astype(np.float64)
        scale = np.abs(attr).max()
        attr_norm = attr / scale if scale > 0 else attr

        regions = []
        for r in find_regions(attr):
            a, b = r["start"] + offset, r["end"] + offset          # positions in the FULL series
            regions.append({
                **r, "start": a, "end": b,
                "start_label": time_label(a, interval),
                "end_label": time_label(b, interval),
                **describe_region(raw, r["start"], r["end"]),
            })

        cls = model.class_info(pred)
        windows.append({
            "index": w,
            "start": offset,
            "end": offset + len(raw) - 1,
            "start_label": time_label(offset, interval),
            "end_label": time_label(offset + len(raw) - 1, interval),
            "prediction": {
                "class_id": pred, "key": cls["key"], "label": cls["label"], "kind": cls["kind"],
                "confidence": round(float(probs[pred]), 4),
                # gap to the runner-up: a small gap = the model is torn between two answers
                "margin": round(float(probs[pred] - probs[order[1]]), 4),
            },
            "probabilities": [
                {"class_id": int(i), "key": model.class_info(int(i))["key"],
                 "label": model.class_info(int(i))["label"], "probability": round(float(probs[i]), 4)}
                for i in order
            ],
            "attribution": {"class_id": pred, "values": [round(float(v), 4) for v in attr_norm]},
            "regions": regions,
        })

    if len(windows) == 1:
        p = windows[0]["prediction"]
        answer = f"{p['label']} · {p['confidence']:.0%} sure"
    else:
        counts: dict[str, int] = {}
        for w in windows:
            counts[w["prediction"]["label"]] = counts.get(w["prediction"]["label"], 0) + 1
        answer = " · ".join(f"{k} ×{v}" for k, v in sorted(counts.items(), key=lambda kv: -kv[1]))
    n_regions = sum(len(w["regions"]) for w in windows)
    add_step("results", "Read the answer", f"{C} raw scores per window",
             f"{answer} · {n_regions} evidence region{'s' if n_regions != 1 else ''}", t0)

    return {
        "model_id": model.id,
        "n_points": n,
        "input_length": T,
        "mode": mode,
        "windows": windows,
        "steps": steps,
        "latency_ms": round((time.perf_counter() - t_all) * 1000, 1),
    }
