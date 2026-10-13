# one image = the whole product: the React app (built in stage 1) served by the FastAPI backend.
# runs on any Docker host. it listens on $PORT: 7860 by default, Render sets its own (10000).
# online, the main frontend is on GitHub Pages; the copy inside this image is a backup.

# ---- stage 1: build the frontend into static files ------------------------------------------
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- stage 2: the python api + the built files -----------------------------------------------
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860 \
    STATIC_DIR=/app/static \
    MODELS_DIR=/app/backend/models

# run as a normal user, not root - safer if someone ever breaks into the app
RUN useradd -m -u 1000 user
WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/app backend/app
COPY backend/models backend/models
COPY --from=web /web/dist static

USER user
EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://localhost:{os.environ[\"PORT\"]}/api/health')"
CMD ["sh", "-c", "uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
