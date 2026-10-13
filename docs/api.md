# API

[← back to the README](../README.md)

Interactive docs: [seanet-studio.onrender.com/api/docs](https://seanet-studio.onrender.com/api/docs)
(or `/api/docs` on a local server).

| Method | Path | What |
|---|---|---|
| GET | `/api/health` | status, loaded models, LLM on/off + the start-up model check |
| GET | `/api/models` | each model's public card (domain, classes, stats) |
| GET | `/api/models/{id}/samples[/{sid}]` | test examples with a small preview (+ true anomaly location) |
| GET | `/api/models/{id}/examples/{name}` | a real example CSV file |
| POST | `/api/models/{id}/predict` | `{"values": [...]}` → one result per window + the pipeline steps |
| POST | `/api/models/{id}/explain` | `{"values": [...], "window": 0}` → the result + a plain-English explanation |

`/explain` re-runs the model on the server instead of trusting a result sent by the browser, so the
LLM can only ever explain what the model really said.

Example: one day of home electricity, one value per hour (24 values). The model wants 144, so the
series is stretched to fit (`"mode": "resampled"`). A series needs at least 16 values.

```bash
curl -X POST https://seanet-studio.onrender.com/api/models/powercons-seanet/predict \
  -H "Content-Type: application/json" \
  -d '{"values": [0.6, 0.5, 0.4, 0.4, 0.4, 0.5, 0.9, 1.4, 1.2, 0.9, 0.8, 0.8,
                  1.0, 0.9, 0.8, 0.8, 1.0, 1.6, 2.4, 2.6, 2.2, 1.7, 1.1, 0.8]}'
```
