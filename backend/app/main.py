"""
app/main.py - the web API (FastAPI).

FastAPI:
    FastAPI turns normal python functions into HTTP endpoints. With pydantic it checks the request
    body for us (wrong type -> automatic 422 error) and it writes interactive docs at /docs for free.

Endpoints (all under /api):
    GET  /health                          is the server up, which models are loaded
    GET  /models                          every model's public card (domain, classes, stats)
    GET  /models/{id}/samples             the demo series list (id, true class, a small preview)
    GET  /models/{id}/samples/{sid}       one demo series with its values (+ true anomaly location)
    GET  /models/{id}/examples/{name}     a real example csv file (download it or load it)
    POST /models/{id}/predict             series -> class probabilities + evidence + the steps
    POST /models/{id}/explain             series (+ which window) -> the same + a plain-English
                                          explanation (LLM)

/explain runs the model again instead of trusting a prediction sent by the browser. It costs a few
milliseconds and it means nobody can make the LLM "explain" a result the model never gave.

When STATIC_DIR is set (in Docker), the built React app is served from "/" by the same server, so
the whole product is ONE container and ONE url.
"""
from contextlib import asynccontextmanager

import numpy as np

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.config import Settings, load_settings
from app.explain import Explainer
import time

from app.inference import MAX_POINTS, InputError, predict, resample
from app.registry import LoadedModel, load_registry


class SeriesIn(BaseModel):
    values: list[float] = Field(..., min_length=1, max_length=MAX_POINTS,
                                description="the time series, oldest value first")


class ExplainIn(SeriesIn):
    window: int = Field(0, ge=0, description="which window to explain, when the series was cut into windows")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # load every model ONCE at start-up, not on every request
        app.state.models = load_registry(settings.models_dir)
        app.state.explainer = Explainer(settings)
        await app.state.explainer.check()      # is the LLM model still offered? (only logs, never stops)
        yield

    app = FastAPI(title="SEA-Net Studio API", version="1.0.0", lifespan=lifespan,
                  docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins,
                       allow_methods=["GET", "POST"], allow_headers=["*"])
    app.add_middleware(GZipMiddleware, minimum_size=1000)   # the series json shrinks ~4x

    def get_model(request: Request, model_id: str) -> LoadedModel:
        model = request.app.state.models.get(model_id)
        if model is None:
            raise HTTPException(404, f"unknown model '{model_id}'")
        return model

    def run(model: LoadedModel, values: list[float]) -> dict:
        try:
            return predict(model, values)
        except InputError as e:
            raise HTTPException(422, str(e))

    @app.get("/api/health")
    def health(request: Request):
        return {"status": "ok", "models": list(request.app.state.models),
                "llm": {"enabled": settings.llm_enabled,
                        "model": settings.llm_model if settings.llm_enabled else None,
                        "check": request.app.state.explainer.status}}

    @app.get("/api/models")
    def list_models(request: Request):
        return [m.public_card() for m in request.app.state.models.values()]

    @app.get("/api/models/{model_id}/samples")
    def list_samples(request: Request, model_id: str):
        model = get_model(request, model_id)
        # a 60-point preview is enough to draw a small sparkline in the picker
        return [{"id": s["id"], "true_class": s["true_class"],
                 "preview": [round(float(v), 3) for v in resample(np.asarray(s["values"]), 60)]}
                for s in model.samples]

    @app.get("/api/models/{model_id}/examples/{name}")
    def get_example(request: Request, model_id: str, name: str):
        model = get_model(request, model_id)
        # only names listed in examples.json, so nobody can ask for some other file on the server
        for e in model.examples:
            if e["name"] == name:
                return FileResponse(model.folder / e["file"], media_type="text/csv", filename=e["name"])
        raise HTTPException(404, f"unknown example '{name}'")

    @app.get("/api/models/{model_id}/samples/{sample_id}")
    def get_sample(request: Request, model_id: str, sample_id: str):
        model = get_model(request, model_id)
        for s in model.samples:
            if s["id"] == sample_id:
                return s
        raise HTTPException(404, f"unknown sample '{sample_id}'")

    @app.post("/api/models/{model_id}/predict")
    def predict_route(request: Request, model_id: str, body: SeriesIn):
        return run(get_model(request, model_id), body.values)

    @app.post("/api/models/{model_id}/explain")
    async def explain_route(request: Request, model_id: str, body: ExplainIn):
        model = get_model(request, model_id)
        result = run(model, body.values)
        if body.window >= len(result["windows"]):
            raise HTTPException(422, f"there is no window {body.window}")
        # behind the host's proxy (Render) the real visitor ip is the first one in X-Forwarded-For
        visitor = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or \
            (request.client.host if request.client else "unknown")
        t0 = time.perf_counter()
        explanation = await request.app.state.explainer.explain(model, result, visitor, body.window)
        writer = explanation["llm_model"] if explanation["source"] == "llm" else "template (no LLM)"
        step = {"key": "explain", "title": "Write the explanation",
                "input": f"{len(explanation['facts'])} facts from the model",
                "output": f"plain-English text · by {writer}" + (" · from cache" if explanation["cached"] else ""),
                "ms": round((time.perf_counter() - t0) * 1000, 1)}
        return {"result": result, "explanation": explanation, "step": step}

    # the built frontend, if there is one. mounted LAST so /api/... always wins
    if settings.static_dir and settings.static_dir.exists():
        app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="web")

    return app


app = create_app()
