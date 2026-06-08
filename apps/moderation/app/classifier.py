"""Loads the trained sequence-classification model and scores text segments.

The model is loaded once at process start (singleton) and kept in memory.
Each request carries a list of text segments (already sampled by the backend);
this module classifies every segment and aggregates them into a single verdict.
"""
import logging
from typing import Optional

import torch
import torch.nn.functional as F
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from .config import ALLOWED_LABEL, CANONICAL_LABELS, Settings

logger = logging.getLogger("moderation.classifier")


class Classifier:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.device = torch.device(
            "cuda" if settings.use_cuda and torch.cuda.is_available() else "cpu"
        )
        logger.info("Loading model from %s on %s", settings.model_path, self.device)
        self.tokenizer = AutoTokenizer.from_pretrained(settings.model_path)
        self.model = AutoModelForSequenceClassification.from_pretrained(settings.model_path)
        self.model.to(self.device)
        self.model.eval()

        # Resolve index -> canonical label. Prefer an explicit LABEL_MAP env override,
        # otherwise fall back to the model's own id2label (lower-cased / normalised).
        id2label = self.model.config.id2label
        self.index_to_label: dict[int, str] = {}
        for idx, raw in id2label.items():
            idx = int(idx)
            canonical = self._canonicalize(raw)
            self.index_to_label[idx] = canonical
        logger.info("Label mapping resolved: %s", self.index_to_label)

    def _canonicalize(self, raw_label: str) -> str:
        if raw_label in self.settings.label_map:
            return self.settings.label_map[raw_label]
        normalized = raw_label.strip().lower().replace("-", "_").replace(" ", "_")
        if normalized in CANONICAL_LABELS:
            return normalized
        # Heuristic fallbacks for common naming variants.
        if any(k in normalized for k in ("toxic", "spam", "offensive", "hate")):
            return "spam_toxic"
        if normalized in ("it", "tech", "technology", "cntt", "information_technology"):
            return "it"
        return "others"

    @torch.inference_mode()
    def _score_segment(self, text: str) -> dict[str, float]:
        enc = self.tokenizer(
            text,
            truncation=True,
            max_length=self.settings.max_length,
            return_tensors="pt",
        ).to(self.device)
        logits = self.model(**enc).logits[0]
        probs = F.softmax(logits, dim=-1).tolist()
        scores = {label: 0.0 for label in CANONICAL_LABELS}
        for idx, prob in enumerate(probs):
            label = self.index_to_label.get(idx, "others")
            scores[label] += float(prob)
        return scores

    def classify(self, segments: list[str]) -> dict:
        clean = [s.strip() for s in segments if s and s.strip()]
        if not clean:
            return {
                "label": "others",
                "allowed": False,
                "scores": {label: 0.0 for label in CANONICAL_LABELS},
                "perSegment": [],
            }

        per_segment = []
        for text in clean:
            scores = self._score_segment(text)
            top = max(scores, key=scores.get)
            per_segment.append({"label": top, "scores": scores})

        verdict = self._aggregate(per_segment)
        return verdict

    @staticmethod
    def _aggregate(per_segment: list[dict]) -> dict:
        """Combine per-segment results.

        Rule: if ANY segment is spam_toxic -> overall spam_toxic.
        Otherwise pick the majority label between `it`/`others`,
        breaking ties by the higher averaged score.
        """
        n = len(per_segment)
        avg_scores = {label: 0.0 for label in CANONICAL_LABELS}
        for seg in per_segment:
            for label, value in seg["scores"].items():
                avg_scores[label] += value / n

        if any(seg["label"] == "spam_toxic" for seg in per_segment):
            label = "spam_toxic"
        else:
            it_votes = sum(1 for seg in per_segment if seg["label"] == "it")
            other_votes = sum(1 for seg in per_segment if seg["label"] == "others")
            if it_votes > other_votes:
                label = "it"
            elif other_votes > it_votes:
                label = "others"
            else:
                label = "it" if avg_scores["it"] >= avg_scores["others"] else "others"

        return {
            "label": label,
            "allowed": label == ALLOWED_LABEL,
            "scores": avg_scores,
            "perSegment": per_segment,
        }


_classifier: Optional[Classifier] = None


def load_classifier(settings: Settings) -> Classifier:
    global _classifier
    if _classifier is None:
        _classifier = Classifier(settings)
    return _classifier


def get_classifier() -> Optional[Classifier]:
    return _classifier
