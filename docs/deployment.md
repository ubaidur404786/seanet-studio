# Deploy for free (GitHub Pages + Render)

[← back to the README](../README.md)

The product is split over two free hosts:

| Part | Host | What runs there | Set up by |
|---|---|---|---|
| Frontend | GitHub Pages | the built React files (plain static files) | `.github/workflows/deploy.yml` |
| Backend | Render, free web service (Docker, 512 MB) | FastAPI + ONNX Runtime + the 4 models (~170 MB of RAM). It also serves the app itself, as a backup | `render.yaml` |

The two are on different hosts, so two settings connect them: the frontend is built with
`VITE_API_URL` = the Render address, and the backend gets `ALLOWED_ORIGINS` = the Pages address
(CORS, otherwise the browser blocks the calls). The LLM key is a Render **secret**, it never reaches
the browser.

## One-time setup

1. [render.com](https://render.com) → sign in with GitHub → **New → Blueprint** → pick this repo.
   Render reads `render.yaml`, asks for `LLM_API_KEY` (your free Groq key; leave it empty for the
   template text) and builds the Docker image (a few minutes).
2. In this GitHub repo: Settings → Secrets and variables → Actions → variable `API_URL` =
   the Render address, e.g. `https://seanet-studio.onrender.com`.
3. Settings → Pages → Source: **GitHub Actions**, then run `gh workflow run deploy.yml`.

After that both parts update by themselves: Render rebuilds the backend when CI passes on `main`,
and the Pages workflow republishes the frontend when a commit changes `frontend/`.
If you do not use Groq, add `LLM_BASE_URL` / `LLM_MODEL` in the Render dashboard (Environment).

## Sleeping

A free Render service sleeps after 15 minutes without visitors and needs about a minute to wake up.
The app then shows "Waking up the free server…" and keeps trying by itself, so the first visitor
only has to wait.

## Why not Hugging Face Spaces?

It was the first plan, but since 2026 a Docker Space on the free CPU needs a PRO subscription
(creating one fails with `402 Payment Required`); only static Spaces stay free.
