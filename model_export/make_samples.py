"""
model_export/make_samples.py - pick real TEST series so people can try the app with one click,
and write a few real example CSV files they can download or load.

Why:
    Most visitors do not have a matching CSV lying around. So we ship a small set of series from
    the TEST split (never seen in training) with the TRUE class. For WebTraffic we also know WHERE
    the anomaly really is (the dataset generator saved its location), so the UI can show "model's
    evidence" next to "real location". UCR datasets do not have that, so there the UI only shows
    the model's evidence.

What it writes into --out-dir:
    samples.json          [{id, true_class, values, true_regions}]   (true_regions = [] for UCR)
    examples/*.csv        real files: one plain series, and one LONG series made of several test
                          series one after the other (to show how long inputs get cut into windows)
    examples.json         the list of those files, with a short title and note for the UI

Run it (from the seanet-studio folder):
    python model_export/make_samples.py webtraffic --data-dir ../SEA_NET/data/WebTraffic \
        --out-dir backend/models/webtraffic-seanet
    python model_export/make_samples.py ucr --dataset ECG5000 --data-dir ../SEA_NET/data/UCR/ECG5000 \
        --out-dir backend/models/ecg5000-seanet
"""
import argparse
import json
import os

import numpy as np
import pandas as pd


def parse_args():
    p = argparse.ArgumentParser(description="Pick demo series + example files from a test split.")
    p.add_argument("kind", choices=["webtraffic", "ucr"])
    p.add_argument("--data-dir", required=True)
    p.add_argument("--out-dir", required=True)
    p.add_argument("--dataset", help="UCR dataset name, e.g. ECG5000 (only for kind=ucr)")
    p.add_argument("--per-class", type=int, default=3)
    p.add_argument("--long-parts", type=int, default=4,
                   help="how many test series go one after the other in the long example file")
    p.add_argument("--long-classes", type=int, nargs="+",
                   help="which classes go into the long file, in order (default: spread over all)")
    p.add_argument("--one-class", type=int, default=None,
                   help="which class goes into the one-series file (default: the last class)")
    p.add_argument("--interval-min", type=float, default=None,
                   help="minutes between two points, if known (adds a time column to the csv)")
    p.add_argument("--signal", default="value", help="name of the value column in the csv files")
    p.add_argument("--item", nargs=2, default=["series", "series"], metavar=("ONE", "MANY"),
                   help='what one series is called in the titles, e.g. --item beat beats')
    p.add_argument("--seed", type=int, default=0)
    return p.parse_args()


# --------------------------------------------------------------------------------------------
# loading the test split -> (X: (N, T) array, y: (N,) labels 0..C-1, regions: list per row)
# --------------------------------------------------------------------------------------------
def load_webtraffic(data_dir):
    df = pd.read_csv(os.path.join(data_dir, "WebTraffic_TEST.csv"))
    with open(os.path.join(data_dir, "WebTraffic_TEST_metadata.json"), encoding="utf-8") as f:
        meta = json.load(f)
    X = df.iloc[:, 1:].to_numpy(dtype=float)
    y = df["Class"].to_numpy(dtype=int)
    # the generator stores [start, end] pairs. for spikes start == end (a single point)
    regions = [[[int(s), int(e)] for s, e in m["signature_locations"]] for m in meta]
    names = [m["signature"] for m in meta]
    return X, y, regions, names


def load_ucr(data_dir, dataset):
    raw = np.loadtxt(os.path.join(data_dir, f"{dataset}_TEST.tsv"), delimiter="\t")
    X, labels = raw[:, 1:], raw[:, 0].astype(int)
    # SAME label mapping as the training code (millet/data/ucr_2018_dataset.py):
    # {-1, 1} -> {0, 1}, otherwise shift so the smallest label is 0
    if -1 in labels:
        y = np.where(labels == -1, 0, labels)
    else:
        y = labels - labels.min()
    if np.isnan(X).any():
        raise SystemExit(f"{dataset} has missing values / unequal lengths - pick another dataset")
    return X, y, [[] for _ in range(len(y))], [f"class{c}" for c in y]


# --------------------------------------------------------------------------------------------
def write_csv(path, values, interval_min, signal):
    """A normal-looking csv: a time column (if we know the timing) and the value column."""
    with open(path, "w", encoding="utf-8", newline="") as f:
        if interval_min:
            f.write(f"minute,{signal}\n")
            for i, v in enumerate(values):
                f.write(f"{int(round(i * interval_min))},{v:.4f}\n")
        else:
            f.write(f"step,{signal}\n")
            for i, v in enumerate(values):
                f.write(f"{i},{v:.4f}\n")


def main():
    args = parse_args()
    if args.kind == "webtraffic":
        X, y, regions, names = load_webtraffic(args.data_dir)
    else:
        if not args.dataset:
            raise SystemExit("--dataset is needed for kind=ucr")
        X, y, regions, names = load_ucr(args.data_dir, args.dataset)

    rng = np.random.default_rng(args.seed)
    samples = []
    first_of_class = {}
    for clz in sorted(np.unique(y)):
        rows = np.flatnonzero(y == clz)
        picked = rng.choice(rows, size=min(args.per_class, len(rows)), replace=False)
        for i in sorted(picked):
            first_of_class.setdefault(int(clz), int(i))
            samples.append({
                "id": f"{names[i]}-{i}" if args.kind == "webtraffic" else f"test-{i}",
                "true_class": int(clz),
                "values": [round(float(v), 4) for v in X[i]],   # 4 decimals is plenty, keeps it small
                "true_regions": regions[i],
            })

    os.makedirs(os.path.join(args.out_dir, "examples"), exist_ok=True)
    with open(os.path.join(args.out_dir, "samples.json"), "w", encoding="utf-8") as f:
        json.dump(samples, f, separators=(",", ":"))

    # ---- example files ---------------------------------------------------------------------
    T = X.shape[1]
    classes = sorted(first_of_class)
    examples = []

    # 1) one plain series - the last class is usually a "problem" one, so it is more interesting.
    #    but for some datasets the last class is a rare one, so it can be picked by hand
    one = first_of_class[classes[-1] if args.one_class is None else args.one_class]
    write_csv(os.path.join(args.out_dir, "examples", "one_series.csv"), X[one], args.interval_min, args.signal)
    one_word, many_word = args.item
    examples.append({"name": "one_series.csv", "file": "examples/one_series.csv",
                     "title": f"One {one_word}", "points": int(T),
                     "note": f"{T:,} points - exactly what the model takes in one go."})

    # 2) a long series: several test series one after the other, from different classes.
    #    the app will cut it into windows of T points and predict each one
    if args.long_classes:
        chosen = args.long_classes
    else:   # spread evenly over the classes, e.g. 10 classes, 4 parts -> 0, 3, 6, 9
        chosen = sorted({classes[int(round(k))] for k in np.linspace(0, len(classes) - 1, args.long_parts)})
    parts = [first_of_class[c] for c in chosen]
    long_values = np.concatenate([X[i] for i in parts])
    write_csv(os.path.join(args.out_dir, "examples", "long_series.csv"), long_values, args.interval_min, args.signal)
    examples.append({"name": "long_series.csv", "file": "examples/long_series.csv",
                     "title": f"{len(parts)} {many_word} in a row", "points": int(len(long_values)),
                     "note": f"{len(long_values):,} points - the app cuts it into {len(parts)} windows "
                             f"of {T:,} and predicts each one."})

    with open(os.path.join(args.out_dir, "examples.json"), "w", encoding="utf-8") as f:
        json.dump(examples, f, indent=2)
    print(f"saved {len(samples)} samples + {len(examples)} example files to {args.out_dir}")


if __name__ == "__main__":
    main()
