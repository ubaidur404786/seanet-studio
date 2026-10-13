# How it works

[← back to the README](../README.md)

![Architecture](images/architecture.svg)

The project has three parts:

1. **Train & export (once, offline).** SEA-Net is trained in the research repo with PyTorch, then
   exported to ONNX and checked again on the full test set (see [models.md](models.md)).
2. **Use the app (every request).** The browser sends a series to the API; the backend prepares
   it, runs the ONNX model, finds the evidence and asks a free LLM to put the facts into words.
3. **Ship (every push).** CI tests everything; Render and GitHub Pages then publish the new
   version (see [deployment.md](deployment.md)).

## The model: SEA-Net

SEA-Net is a multiple-instance-learning classifier: a series is a "bag" and each time step is an
"instance". The explanation is part of the forward pass, not a separate tool added afterwards.

| | SEA-Net (this app) | MILLET (ICLR 2024 baseline) |
|---|---|---|
| Test accuracy, WebTraffic | **94.2 %** | 91.6 % |
| Evidence quality, NDCG@n | **0.786** | 0.624 |
| Parameters | **41 K** | 424 K |
| Inference here | ~10 ms on CPU (ONNX Runtime) | - |

Architecture: a multi-scale separable temporal-convolution encoder (`sea_mstcn_sep_bottleneck`,
kernels 5/11/23, dilations up to 16) + a **Top-k Conjunctive** pooling head: every time step gets a
gated score per class, and the class score is the mean of the strongest 10 %.
Numbers are seed 0 from the research repo; see [the limits](models.md#limits) before reading too
much into them.

## One request, step by step

| Step | Where | What happens |
|---|---|---|
| 1. Prepare | `backend/app/inference.py` | the series is fitted to the model's length (see below) and z-normalised, the same way as in training |
| 2. Run SEA-Net | ONNX Runtime | one call gives the class probabilities **and** a score for every time step |
| 3. Evidence | `inference.py` | the strongest stretches become "evidence regions", each with a few facts: where, how much of the evidence, what the signal does there (higher / lower / rougher than the rest) |
| 4. Explain | `backend/app/explain.py` | only those facts go to the LLM, with strict rules; the answer is cached, and each visitor gets 20 explanations per 10 minutes |

`/api/predict` runs steps 1–3, `/api/explain` runs 1–4. `/explain` runs the model again on the
server instead of trusting a result sent by the browser, so the LLM can only ever explain what the
model really said.

### SEA-Net decides, the LLM only writes

The LLM receives a small JSON of facts computed by the model (class, confidence, evidence regions,
what the signal does there) and rules to use nothing else. In the app, "What the language model got"
shows that exact JSON. If no LLM is configured, or the free quota runs out, a template writes the
text from the same facts and the app keeps working.

Two choices keep the text honest:

- The overall test accuracy is **not** sent to the LLM: it once turned 93.9 % into a made-up
  "94 of 100 days".
- When the answer is a class the model is weak on (it found less than 70 % of that class in the
  test set), the facts say so and the text warns the reader.

## Long and short series

The ONNX model takes a fixed number of values (1,008 for WebTraffic, 140 for ECG5000...).

- **Exactly that length** - used as it is.
- **Shorter** - stretched to that length; the evidence is mapped back onto your own points.
- **Longer** - cut into windows of that length, and each window is predicted on its own (all
  windows in one ONNX call). If the last piece is too short, the last window is taken from the
  end, so it overlaps the one before. The UI shows one block per window; click one to see its
  chart, evidence and explanation. The limit is 20,000 values and 50 windows.

## Why ONNX, why a manifest

**ONNX:** the backend needs only `onnxruntime` + `numpy`, no PyTorch and no research code. The
Docker image stays small, it starts fast on free hosting, and the export script proves the ONNX
file gives the same answers as PyTorch (max difference ~1e-5).

**Manifest:** each model folder has a `manifest.json` with its domain (title, signal name, unit,
sampling interval, accent colour), its classes (labels, colours, normal vs anomaly, descriptions)
and the kinds of output it gives. The frontend builds its screens from that file, so a model for
another domain is a new folder, not new frontend code.

## The pipeline bar

The backend times every step and describes its input and output in a few words
(`read → prepare → load model → run → read the answer → write the explanation`). A horizontal
progress bar above the charts shows these real numbers one step at a time; click a finished step to
see what went in and out, or open "Show all steps". The model itself takes a few ms, so the bar is
played at a pace a person can follow - only the pace is slowed, the numbers are the measured ones.

Below the results, "How it works" keeps three kinds of numbers apart: the **model card** (facts
about the file), **test results** (measured once on the test split) and **this session** (timed live
on your last run).

## Domain templates

Each domain picks one of four templates in its manifest. A template changes the **look**, never the
numbers: the same blocks (answer, chart, explanation, evidence) are arranged and drawn differently.

| Template | Used by | Layout | Answer card | Chart |
|---|---|---|---|---|
| `monitoring` | Website traffic | stat tiles, then a wide chart | 4 tiles: answer, confidence, next best, main evidence | thin line, dashed grid |
| `clinical` | Heartbeats | chart and a readout column side by side | big "% sure" readout | straight-line trace on ECG paper |
| `industrial` | Chip factory | pass / fail strip first, evidence before text | mono strip + 20-block gauge | step line, blueprint grid |
| `energy` | Home electricity | the day's curve first | big season icon + warm / cold split bar | filled area |

The layout and chart part is in `frontend/src/lib/templates.ts`; the CSS part (card corners, title
style, hero background: dot grid, ECG paper, blueprint, sunrise) is keyed on `data-template` in
`frontend/src/index.css`.
