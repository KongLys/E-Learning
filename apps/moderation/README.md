# Content Moderation Service

A small Python/FastAPI microservice wrapping the pre-trained text-classification
model. It classifies content into **`it`** (Công nghệ thông tin), **`spam_toxic`**,
or **`others`**. Only `it` is considered *allowed* by the platform.

The NestJS backend calls this service over the internal Docker network; it is not
exposed publicly.

## API

### `GET /health`
```json
{ "status": "ok", "model_loaded": true }
```

### `POST /v1/classify`
Header (optional, required when `MODERATION_API_KEY` is set): `X-Api-Key: <key>`

Request:
```json
{ "segments": ["đoạn 1", "đoạn 2"], "source": "material" }
```

Response:
```json
{
  "label": "it",
  "allowed": true,
  "scores": { "it": 0.91, "spam_toxic": 0.03, "others": 0.06 },
  "perSegment": [{ "label": "it", "scores": { "it": 0.91, "spam_toxic": 0.03, "others": 0.06 } }]
}
```

**Aggregation:** the backend samples representative segments (2 first + 5 random
middle + 2 last). This service scores each segment, then: if *any* segment is
`spam_toxic` → overall `spam_toxic`; otherwise the majority label between
`it`/`others` wins (ties broken by average score).

## Model files

Put the trained HuggingFace model (a directory with `config.json`, the weights,
and tokenizer files) into `./models/`. It is mounted at `/app/models` and is
**not** baked into the image (the repo only ships a `.gitkeep` placeholder). If
the model's `config.id2label` does not already use canonical names, set
`LABEL_MAP` (see `.env.example`).

> **Deploy prerequisite.** Provide the model **before** `docker compose up`.
> Without it, `/health` reports `model_loaded: false`, so the container's
> healthcheck never turns healthy. The `api` service depends on moderation with
> `condition: service_started` (not `service_healthy`), so the backend still
> boots, but every classify call fails and — with `MODERATION_FAIL_OPEN=true` —
> all content is left in `pending` for manual admin review instead of being
> auto-moderated.

## Run locally

```bash
pip install -r requirements.txt
MODEL_PATH=./models uvicorn app.main:app --reload --port 8000
```

## Run with Docker

Built and orchestrated from the repo-root `docker-compose.prod.yml` as the
`moderation` service (the dev `docker-compose.yml` only provisions redis + minio).
