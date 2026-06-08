"""FastAPI entrypoint for the content-moderation classifier service.

Exposes:
  GET  /health        -> liveness + model-loaded probe
  POST /v1/classify   -> classify a list of text segments into it/spam_toxic/others
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .classifier import get_classifier, load_classifier
from .config import get_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("moderation")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    try:
        load_classifier(settings)
        logger.info("Model loaded, service ready")
    except Exception:  # noqa: BLE001 - log and keep serving /health as not-ready
        logger.exception("Failed to load model on startup")
    yield


app = FastAPI(title="Content Moderation Service", version="1.0.0", lifespan=lifespan)


class ClassifyRequest(BaseModel):
    segments: list[str] = Field(..., min_length=1)
    source: str = "material"  # "course" | "material" — informational only


class SegmentResult(BaseModel):
    label: str
    scores: dict[str, float]


class ClassifyResponse(BaseModel):
    label: str
    allowed: bool
    scores: dict[str, float]
    perSegment: list[SegmentResult]


def _check_api_key(provided: str | None) -> None:
    expected = get_settings().api_key
    if expected and provided != expected:
        raise HTTPException(status_code=401, detail="Invalid API key")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model_loaded": get_classifier() is not None}


@app.post("/v1/classify", response_model=ClassifyResponse)
def classify(
    req: ClassifyRequest,
    x_api_key: str | None = Header(default=None, alias="X-Api-Key"),
) -> ClassifyResponse:
    _check_api_key(x_api_key)
    clf = get_classifier()
    if clf is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    result = clf.classify(req.segments)
    if get_settings().log_requests:
        logger.info(
            "classify source=%s segments=%d -> label=%s allowed=%s scores=%s",
            req.source,
            len(req.segments),
            result["label"],
            result["allowed"],
            {k: round(v, 4) for k, v in result["scores"].items()},
        )
    return ClassifyResponse(**result)
