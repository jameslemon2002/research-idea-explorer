"""Similarity helpers shared across ranking, retrieval, and memory."""

from __future__ import annotations

from .schema import idea_to_similarity_text, tokenize, unique


def jaccard_similarity(left_tokens: list[str], right_tokens: list[str]) -> float:
    left = set(left_tokens)
    right = set(right_tokens)
    union = left | right
    if not union:
        return 0.0
    return len(left & right) / len(union)


def idea_similarity(left_idea: dict, right_idea: dict) -> float:
    return jaccard_similarity(
        unique(tokenize(idea_to_similarity_text(left_idea))),
        unique(tokenize(idea_to_similarity_text(right_idea))),
    )
