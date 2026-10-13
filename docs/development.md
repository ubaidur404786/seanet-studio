# Run it locally

[← back to the README](../README.md)

You need Python 3.11+ and Node 20+.

```bash
# 1. backend
cd backend
pip install -r requirements-dev.txt
python -m pytest -q                         # 24 tests, uses the real models
cp ../.env.example .env                     # then paste a free key into .env (optional)
uvicorn app.main:app --reload --port 8000 --env-file .env
# note: --reload picks up code changes, NOT .env changes. after editing .env, stop and start again

# 2. frontend (second terminal)
cd frontend
npm install
npm run dev                                 # open http://localhost:5173
```

Without a key everything works, the explanation just comes from the template.
Free keys: [Groq](https://console.groq.com/keys) or [Google AI Studio](https://aistudio.google.com/apikey).
Any OpenAI-compatible provider works (Groq, Gemini, a local Ollama): switching is 3 variables in
`.env`, see `.env.example`.

Or everything in one container:

```bash
docker build -t seanet-studio .
docker run -p 7860:7860 -e LLM_API_KEY=your_key seanet-studio   # open http://localhost:7860
```

## When the LLM does not work

Free providers retire models (Groq dropped `llama-3.3-70b-versatile`; on 2026-10-13
`openai/gpt-oss-120b` worked). At start-up the server asks the provider for its model list and
writes one line in the log: `LLM check: ... is available`, or a warning with the models it does
offer. `GET /api/health` shows the same check. When a call fails, the explanation card says why
(e.g. `404 model_not_found`) and the template is used instead.

## Project structure

```text
model_export/
  export_onnx.py     .pt bundle -> model.onnx, checked against PyTorch
  check_test_set.py  the whole test split through model.onnx -> accuracy + per-class numbers
  make_samples.py    picks real test series + writes example CSV files
  manifests/         the domain cards (one per model)
backend/
  app/
    config.py        every setting from env variables (provider = 3 variables)
    registry.py      loads models/*/manifest.json + model.onnx once at start-up
    inference.py     resample, z-normalise, run ONNX, softmax, evidence regions
    explain.py       facts -> LLM prompt, start-up model check, template fallback, cache, rate limit
    main.py          FastAPI routes, serves the built frontend
  models/            webtraffic-seanet, ecg5000-seanet, wafer-seanet, powercons-seanet
  tests/             numpy helper tests, LLM helper tests, end-to-end API tests on the real models
frontend/src/
  App.tsx            state + page, picks the domain's template
  lib/templates.ts   the 4 domain templates (layout, answer style, chart style)
  components/        Header, Logo, Hero, InputPanel, PipelineBar, ResultLayout, PredictionCard,
                     SeriesChart, EvidenceList, ExplanationCard, HowItWorks
docs/                these pages + images (architecture, demo, screenshots)
Dockerfile           node build stage + python runtime stage, one container
.github/workflows/   CI (tests, build, docker) and the frontend deploy to GitHub Pages
render.yaml          the backend on Render (free Docker web service)
```
