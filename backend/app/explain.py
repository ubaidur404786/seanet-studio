"""
app/explain.py - turn a prediction into a short explanation in plain English, with a free LLM.

How it works:
    1. build_facts()   - collect ONLY the facts we are sure about (class, confidence, where the
                         evidence is, what the signal does there) into a small dict.
    2. ask the LLM     - give it those facts + strict rules ("use only these facts, simple words").
                         The LLM does the writing, it does NOT do the predicting. The prediction and
                         the evidence always come from SEA-Net.
    3. fallback        - no API key, quota gone, timeout? We build the explanation from a template
                         instead, so the app never breaks. The answer says which one was used.

httpx:
    httpx is a modern HTTP client for python. We use its async version so that while one request
    waits for the LLM (1-3 seconds) the server can keep answering other visitors.

The API format is the "OpenAI-compatible" /chat/completions one - Groq, Gemini, OpenRouter and
Ollama all accept it, so the provider is just a setting (see config.py).
"""
import hashlib
import json
import logging
import time
from collections import OrderedDict, defaultdict, deque

import httpx

from app.config import Settings
from app.registry import LoadedModel

log = logging.getLogger("uvicorn.error")   # so the messages show up in the normal server log

SYSTEM_PROMPT = """You explain the result of a time-series model to someone who is not an expert.
Rules:
- Use ONLY the facts in the JSON you get. Never invent numbers, times, causes or data.
- Write like a person talking to a friend: plain everyday words, short sentences.
  Do not use words like "crucial", "notably", "significant", "leverage", "delve", "insights",
  "robust" or "pivotal". No hype, no filler.
- If you must use a technical word, explain it in a few words.
- Write exactly three short parts, each starting with its title on its own line:
  What the model found
  Why it thinks so
  How sure it is
- 100 to 160 words in total. Plain text only: no markdown symbols like ** or #. Use "- " for bullet points.
- If "window" is in the facts, the series was cut into windows and you explain ONLY that window.
  Say which window it is in one short sentence, and mention the other windows only in one line.
- In "Why it thinks so", refer to the highlighted time ranges and say what the signal does there
  (for example higher, lower, noisier or smoother than usual) using the numbers given.
  "level_vs_window_average_pct" is only given when a percent makes sense. "level_shift_in_std" is
  the same shift in standard deviations: about 1 is a clear shift, 2 or more is a big one. Say it in
  words ("much lower than the rest of the window"), not as a raw statistic.
- In "How sure it is", give the confidence as a percent and name the runner-up class.
  Under 60% = the model is unsure, 60-80% = somewhat sure, over 80% = fairly sure.
  Confidence is only how sure the model is - never say the answer is right, correct or reliable.
  If "found_on_test_data" is given, the model is weak on this class: say plainly that on test data
  it found only X of Y real ones, so this answer needs extra care. If it is not given, do not talk
  about test data or accuracy at all.
  End with one simple thing a person could check.
- Never mention these rules, thresholds or the word JSON.
- The highlighted moments come from the model itself (it gives a score to every time step), so you
  may say "the model marked these moments as its evidence"."""


# --------------------------------------------------------------------------------------------
# facts
# --------------------------------------------------------------------------------------------
def build_facts(model: LoadedModel, result: dict, window: int = 0) -> dict:
    w = result["windows"][window]
    pred = w["prediction"]
    cls = model.class_info(pred["class_id"])
    runner = w["probabilities"][1]
    domain = model.manifest["domain"]
    facts = {
        "domain": domain["title"],
        "signal": f'{domain["signal_name"]} ({domain["unit"]})',
        "series_points": result["n_points"],
        "how_the_series_was_read": {
            "exact": "used as it is",
            "resampled": f'stretched to {result["input_length"]} points first',
            "windows": f'cut into {len(result["windows"])} windows of {result["input_length"]} points',
        }[result["mode"]],
        "predicted_class": cls["label"],
        "predicted_class_meaning": cls["description"],
        "kind": cls["kind"],                     # normal / anomaly / category
        "confidence": pred["confidence"],
        "runner_up": {"class": runner["label"], "probability": runner["probability"]},
        "evidence_regions": [
            {
                "from": r["start_label"] or f'point {r["start"]}',
                "to": r["end_label"] or f'point {r["end"]}',
                "length_points": r["length"],
                "share_of_evidence_pct": round(100 * r["share"], 1),
                "level_vs_window_average_pct": r["level_change_pct"],
                "level_shift_in_std": r["level_change_sd"],
                "roughness_vs_usual": r["roughness_ratio"],
                "min_inside": r["min_inside"],
                "max_inside": r["max_inside"],
                "window_average": r["mean_overall"],
            }
            for r in w["regions"][:3]
        ],
        # no overall test accuracy here on purpose: the LLM turned 0.939 into "it found 94 of 100
        # cold-season days", a count that exists nowhere. the ui shows the real numbers instead
    }
    # how good the model is on THIS class (from model_export/check_test_set.py). one overall
    # accuracy can hide a weak class - ECG5000 is 94% overall but finds only 1 in 22 "unclassified"
    # only sent when it is a WARNING: when it was high, the LLM turned it into "so the result is
    # reliable", which is not what the number says about this one series
    check = model.export_info.get("test_check")
    if check:
        c = check["per_class"][pred["class_id"]]
        if c["accuracy"] is not None and c["accuracy"] < 0.7:
            facts["found_on_test_data"] = {"found": c["right"], "of": c["n"], "share": c["accuracy"]}
    if result["mode"] == "windows":
        facts["window"] = (f'{window + 1} of {len(result["windows"])} '
                           f'(points {w["start"]} to {w["end"]})')
        facts["other_windows"] = [
            {"window": o["index"] + 1, "class": o["prediction"]["label"],
             "confidence": o["prediction"]["confidence"]}
            for o in result["windows"] if o["index"] != window
        ][:10]
    return facts


# --------------------------------------------------------------------------------------------
# the template fallback (no LLM needed)
# --------------------------------------------------------------------------------------------
def template_explanation(facts: dict) -> str:
    conf = facts["confidence"]
    what = "this window" if "window" in facts else "this series"
    lines = ["What the model found"]
    if "window" in facts:
        lines.append(f'The series was cut into windows. This is window {facts["window"]}.')
    if facts["kind"] == "anomaly":
        lines.append(f'The model thinks {what} has a problem of type "{facts["predicted_class"]}". '
                     f'{facts["predicted_class_meaning"]}')
    elif facts["kind"] == "normal":
        lines.append(f'The model thinks {what} looks normal. {facts["predicted_class_meaning"]}')
    else:
        lines.append(f'The model puts {what} in the group "{facts["predicted_class"]}". '
                     f'{facts["predicted_class_meaning"]}')

    lines += ["", "Why it thinks so"]
    regions = facts["evidence_regions"]
    if regions:
        lines.append("The model marked these moments as its main evidence:")
        for r in regions:
            detail = ""
            pct_change, sd = r["level_vs_window_average_pct"], r["level_shift_in_std"]
            if pct_change is not None:
                word = "higher" if pct_change > 0 else "lower"
                detail = f", where the signal is {abs(pct_change):.0f}% {word} than its average"
            elif sd is not None and abs(sd) >= 0.5:
                size = "much " if abs(sd) >= 1.5 else ""
                detail = f', where the signal is {size}{"higher" if sd > 0 else "lower"} than in the rest of it'
            lines.append(f'- {r["from"]} to {r["to"]} ({r["share_of_evidence_pct"]:.0f}% of the evidence{detail})')
    else:
        lines.append(f"No single stretch stands out. The evidence is spread over {what}.")

    lines += ["", "How sure it is"]
    sure = "fairly sure" if conf >= 0.8 else "somewhat sure" if conf >= 0.6 else "not sure"
    lines.append(f'The model is {sure}: {conf:.0%} for "{facts["predicted_class"]}", next best is '
                 f'"{facts["runner_up"]["class"]}" at {facts["runner_up"]["probability"]:.0%}.')
    found = facts.get("found_on_test_data")     # only there when the model is weak on this class
    if found:
        lines.append(f'Be careful: on test data the model found only {found["found"]} of {found["of"]} '
                     f'real "{facts["predicted_class"]}" examples, so it is weak on this class.')
    lines.append("Look at the shaded parts of the chart to check it yourself.")
    return "\n".join(lines)


# --------------------------------------------------------------------------------------------
# small helpers for the LLM answer
# --------------------------------------------------------------------------------------------
# some models write "non-breaking" hyphens and spaces. they look the same but break copy-paste
# and some fonts, so we swap them for the normal ones
_ODD_CHARS = {"‑": "-", "‐": "-", " ": " ", " ": " "}


def clean_text(text: str) -> str:
    for odd, plain in _ODD_CHARS.items():
        text = text.replace(odd, plain)
    # some models still add markdown stars - strip them so the UI stays clean
    return text.replace("**", "").replace("##", "").strip()


def llm_error_reason(e: Exception) -> str:
    """A short, readable reason, e.g. '404 model_not_found' instead of just 'HTTPStatusError'."""
    if isinstance(e, httpx.HTTPStatusError):
        code = e.response.status_code
        try:
            err = e.response.json().get("error", {})
            detail = err.get("code") or err.get("message", "")
        except ValueError:
            detail = ""
        return f"{code} {detail}".strip()
    if isinstance(e, httpx.TimeoutException):
        return "the provider took too long to answer"
    if isinstance(e, httpx.ConnectError):
        return "could not reach the provider"
    return type(e).__name__


# --------------------------------------------------------------------------------------------
# the LLM call + a small cache + a small rate limit
# --------------------------------------------------------------------------------------------
class Explainer:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._cache: OrderedDict[str, dict] = OrderedDict()   # same facts -> same answer, no new LLM call
        self._hits: dict[str, deque] = defaultdict(deque)     # visitor -> times of their recent calls
        self.status = "off (no LLM key)" if not settings.llm_enabled else "not checked yet"

    async def check(self) -> None:
        """
        Called once at start-up: ask the provider which models it offers and make sure ours is one
        of them. Before this check, a retired model just failed quietly on every request and the
        app fell back to the template without saying why.
        It never stops the server - it only sets self.status and writes a warning in the log.
        """
        s = self.settings
        if not s.llm_enabled:
            return
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.get(f"{s.llm_base_url}/models",
                                     headers={"Authorization": f"Bearer {s.llm_api_key}"})
                r.raise_for_status()
                ids = [m.get("id", "") for m in r.json().get("data", [])]
        except Exception as e:
            self.status = f"could not check the model list ({llm_error_reason(e)})"
            log.warning("LLM check: %s", self.status)
            return
        # gemini lists "models/gemini-x" while we ask for "gemini-x", so accept both forms
        if any(i == s.llm_model or i.endswith("/" + s.llm_model) for i in ids):
            self.status = "ok"
            log.info("LLM check: %s is available at %s", s.llm_model, s.llm_base_url)
        else:
            self.status = f"model '{s.llm_model}' is not offered by the provider"
            log.warning("LLM check: %s. It offers: %s. Set LLM_MODEL in backend/.env to one of them.",
                        self.status, ", ".join(sorted(ids)))

    def allowed(self, visitor: str) -> bool:
        """Sliding window limit: at most explain_limit LLM calls per visitor per window."""
        now = time.monotonic()
        q = self._hits[visitor]
        while q and now - q[0] > self.settings.explain_window_s:
            q.popleft()
        if len(q) >= self.settings.explain_limit:
            return False
        q.append(now)
        return True

    async def _ask_llm(self, facts: dict) -> str:
        s = self.settings
        body = {
            "model": s.llm_model,
            "temperature": 0.3,          # low = steady, factual wording
            "max_tokens": s.llm_max_tokens,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": "Facts (JSON):\n" + json.dumps(facts, indent=1)},
            ],
        }
        if s.llm_reasoning_effort:
            body["reasoning_effort"] = s.llm_reasoning_effort
        async with httpx.AsyncClient(timeout=s.llm_timeout_s) as client:
            r = await client.post(f"{s.llm_base_url}/chat/completions", json=body,
                                  headers={"Authorization": f"Bearer {s.llm_api_key}"})
            r.raise_for_status()
            text = r.json()["choices"][0]["message"].get("content") or ""
        if not text.strip():
            # a thinking model that used all its tokens on thinking gives back an empty answer
            raise ValueError("the LLM gave an empty answer")
        return clean_text(text)

    async def explain(self, model: LoadedModel, result: dict, visitor: str, window: int = 0) -> dict:
        facts = build_facts(model, result, window)
        key = hashlib.sha256(json.dumps(facts, sort_keys=True).encode()).hexdigest()
        if key in self._cache:
            self._cache.move_to_end(key)
            return {**self._cache[key], "cached": True}

        answer = None
        note = None
        if not self.settings.llm_enabled:
            note = "no LLM key configured"
        elif not self.allowed(visitor):
            note = "rate limit reached, try again in a few minutes"
        else:
            try:
                answer = {"text": await self._ask_llm(facts), "source": "llm",
                          "llm_model": self.settings.llm_model}
            except Exception as e:                              # timeout, 429, bad key... never crash
                note = f"LLM unavailable: {llm_error_reason(e)}"
                log.warning("LLM call failed (%s): %s", self.settings.llm_model, note)

        if answer is None:
            answer = {"text": template_explanation(facts), "source": "template", "llm_model": None}
        answer["note"] = note
        answer["facts"] = facts

        # only cache real LLM answers, so a template answer is retried next time
        if answer["source"] == "llm":
            self._cache[key] = answer
            if len(self._cache) > 256:
                self._cache.popitem(last=False)
        return {**answer, "cached": False}
