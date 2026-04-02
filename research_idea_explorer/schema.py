"""Normalization helpers and core data constructors."""

from __future__ import annotations

import hashlib
import re
from typing import Any

from .domain import get_claim, get_puzzle


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", str(value or "").lower())).strip()


def tokenize(*values: Any) -> list[str]:
    text = normalize_text(" ".join(str(value or "") for value in values))
    return [token for token in text.split(" ") if token]


def unique(values: list[Any]) -> list[Any]:
    result = []
    seen = set()
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


TOPIC_STOPWORDS = {
    "a",
    "an",
    "and",
    "for",
    "from",
    "in",
    "into",
    "of",
    "on",
    "or",
    "the",
    "to",
    "with",
    "without",
    "study",
    "studies",
    "research",
    "topic",
    "topics",
    "query",
    "queries",
    "live",
    "search",
    "novelty",
    "feasibility",
    "literature",
    "awareness",
    "relevant",
    "recent",
    "contexts",
    "surfaced",
    "retrieved",
    "unspecified",
}


def _stable_id(prefix: str, values: list[Any]) -> str:
    digest = hashlib.sha1("|".join(normalize_text(value) for value in values).encode("utf-8")).hexdigest()[:12]
    return f"{prefix}-{digest}"


def _topic_jaccard(left_tokens: list[str], right_tokens: list[str]) -> float:
    left = set(left_tokens)
    right = set(right_tokens)
    union = left | right
    if not union:
        return 0.0
    return len(left & right) / len(union)


def _topic_keywords(input_data: dict[str, Any]) -> list[str]:
    if isinstance(input_data.get("constraints", {}).get("keywords"), list):
        return input_data["constraints"]["keywords"]
    if isinstance(input_data.get("keywords"), list):
        return input_data["keywords"]
    return []


def _topic_objects(input_data: dict[str, Any]) -> list[str]:
    if isinstance(input_data.get("focus", {}).get("objects"), list):
        return input_data["focus"]["objects"]
    if isinstance(input_data.get("objects"), list):
        return input_data["objects"]
    if input_data.get("object"):
        return [input_data["object"]]
    if input_data.get("query"):
        return [input_data["query"]]
    return []


def _topic_domain(input_data: dict[str, Any]) -> str:
    raw = (
        input_data.get("focus", {}).get("domain")
        or input_data.get("domain")
        or input_data.get("topicProfile", {}).get("domain")
        or ""
    )
    domain = normalize_text(raw)
    return domain if domain and domain not in {"live search", "unspecified domain"} else ""


def _topic_focus_terms(input_data: dict[str, Any]) -> list[str]:
    if isinstance(input_data.get("focusTerms"), list):
        return input_data["focusTerms"]
    if isinstance(input_data.get("origin", {}).get("focusTerms"), list):
        return input_data["origin"]["focusTerms"]
    return []


def build_topic_profile(input_data: dict[str, Any] | None = None) -> dict[str, Any]:
    input_data = input_data or {}
    topic_profile = input_data.get("topicProfile")
    if topic_profile and topic_profile.get("id") and isinstance(topic_profile.get("tokens"), list):
        return {
            "id": topic_profile["id"],
            "text": topic_profile.get("text") or " ".join(topic_profile["tokens"]),
            "tokens": unique([normalize_text(token) for token in topic_profile["tokens"] if normalize_text(token)]),
            "domain": topic_profile.get("domain") or None,
        }

    if input_data.get("id") and isinstance(input_data.get("tokens"), list):
        return {
            "id": input_data["id"],
            "text": input_data.get("text") or " ".join(input_data["tokens"]),
            "tokens": unique([normalize_text(token) for token in input_data["tokens"] if normalize_text(token)]),
            "domain": input_data.get("domain") or None,
        }

    objects = _topic_objects(input_data)
    keywords = _topic_keywords(input_data)
    focus_terms = _topic_focus_terms(input_data)
    domain = _topic_domain(input_data)
    text = " ".join(unique([*objects, *keywords, *focus_terms, domain])).strip()
    tokens = unique(
        [
            token
            for token in tokenize(text)
            if len(token) > 1 and token not in TOPIC_STOPWORDS
        ]
    )
    return {
        "id": _stable_id("topic", tokens or [text or "topic"]),
        "text": text or " ".join(objects) or domain or "topic",
        "tokens": tokens,
        "domain": domain or None,
    }


def topic_similarity(left: dict[str, Any], right: dict[str, Any]) -> float:
    left_profile = build_topic_profile(left)
    right_profile = build_topic_profile(right)
    return _topic_jaccard(left_profile["tokens"], right_profile["tokens"])


def same_topic(left: dict[str, Any], right: dict[str, Any], threshold: float = 0.26) -> bool:
    left_profile = build_topic_profile(left)
    right_profile = build_topic_profile(right)
    return left_profile["id"] == right_profile["id"] or topic_similarity(left_profile, right_profile) >= threshold


def build_idea_signature(idea: dict[str, Any]) -> str:
    return "|".join(
        [
            normalize_text(idea.get("object")),
            idea["puzzle"]["id"],
            idea["claim"]["id"],
            normalize_text(idea.get("contrast", {}).get("axis")),
            normalize_text(idea.get("contrast", {}).get("comparison")),
            normalize_text(idea.get("evidence", {}).get("kind")),
            normalize_text(idea.get("scope", {}).get("population")),
            normalize_text(idea.get("scope", {}).get("place")),
            normalize_text(idea.get("scope", {}).get("time")),
            normalize_text(idea.get("scope", {}).get("scale")),
        ]
    )


def build_idea_family_id(idea: dict[str, Any]) -> str:
    return _stable_id(
        "family",
        [
            idea.get("object"),
            idea.get("puzzle", {}).get("id"),
            idea.get("claim", {}).get("id"),
            idea.get("contrast", {}).get("axis"),
            idea.get("scope", {}).get("scale"),
        ],
    )


def idea_to_match_text(idea: dict[str, Any]) -> str:
    return " ".join(
        [
            idea.get("title", ""),
            idea.get("object", ""),
            idea.get("puzzle", {}).get("label", ""),
            idea.get("claim", {}).get("label", ""),
            idea.get("contrast", {}).get("axis", ""),
            idea.get("contrast", {}).get("comparison", ""),
            idea.get("evidence", {}).get("kind", ""),
            idea.get("evidence", {}).get("detail", ""),
            idea.get("scope", {}).get("population", ""),
            idea.get("scope", {}).get("place", ""),
            idea.get("scope", {}).get("time", ""),
            idea.get("scope", {}).get("scale", ""),
            *idea.get("stakes", []),
        ]
    )


def idea_to_similarity_text(idea: dict[str, Any]) -> str:
    return " ".join(
        [
            idea_to_match_text(idea),
            idea.get("rationale", ""),
            idea.get("origin", {}).get("personaLabel", "") or "",
            idea.get("origin", {}).get("noveltyAngle", "") or "",
        ]
    )


def idea_to_text(idea: dict[str, Any]) -> str:
    return " ".join([idea_to_similarity_text(idea), idea.get("critique", {}).get("summary", "") or ""])


def create_brainstorm_seed(input_data: dict[str, Any]) -> dict[str, Any]:
    persona = input_data.get("persona") or {
        "id": input_data.get("moveId", "literature_move"),
        "label": input_data.get("moveLabel", "Literature Move"),
    }
    seed_id = input_data.get("id") or _stable_id(
        "seed",
        [
            persona["id"],
            input_data.get("object"),
            input_data.get("hook"),
            input_data.get("pivot"),
            input_data.get("questionStem"),
            input_data.get("noveltyAngle"),
            *(input_data.get("sourcePaperIds") or []),
        ],
    )
    return {
        "id": seed_id,
        "persona": {"id": persona["id"], "label": persona["label"]},
        "object": input_data.get("object"),
        "hook": input_data.get("hook", ""),
        "pivot": input_data.get("pivot", ""),
        "questionStem": input_data.get("questionStem", ""),
        "noveltyAngle": input_data.get("noveltyAngle", ""),
        "suggestedPuzzles": input_data.get("suggestedPuzzles", []),
        "suggestedClaims": input_data.get("suggestedClaims", []),
        "contrastSuggestions": input_data.get("contrastSuggestions", []),
        "evidenceHints": input_data.get("evidenceHints", []),
        "sourcePaperIds": input_data.get("sourcePaperIds", []),
        "literatureQueries": [
            {
                "label": query.get("label") or query.get("query") or "query",
                "query": query.get("query", ""),
                "weight": query.get("weight", 1),
            }
            for query in input_data.get("literatureQueries", [])
        ],
        "focusTerms": unique(list(input_data.get("focusTerms", []))),
        "round": input_data.get("round", "initial"),
        "stage": input_data.get("stage", "diverge"),
        "parentIdeaId": input_data.get("parentIdeaId"),
        "tags": unique(list(input_data.get("tags", []))),
    }


def create_idea_card(input_data: dict[str, Any]) -> dict[str, Any]:
    puzzle = get_puzzle(input_data["puzzle"]) if isinstance(input_data.get("puzzle"), str) else input_data.get("puzzle")
    claim = get_claim(input_data["claim"]) if isinstance(input_data.get("claim"), str) else input_data.get("claim")
    if not puzzle:
        raise ValueError(f"Unknown puzzle: {input_data.get('puzzle')}")
    if not claim:
        raise ValueError(f"Unknown claim: {input_data.get('claim')}")

    idea = {
        "title": input_data.get("title"),
        "object": input_data.get("object"),
        "puzzle": puzzle,
        "claim": claim,
        "contrast": {
            "axis": input_data.get("contrast", {}).get("axis", "comparison"),
            "comparison": input_data.get("contrast", {}).get("comparison", "unspecified contrast"),
        },
        "evidence": {
            "kind": input_data.get("evidence", {}).get("kind", "observational_data"),
            "detail": input_data.get("evidence", {}).get("detail", "unspecified evidence source"),
        },
        "scope": {
            "population": input_data.get("scope", {}).get("population", "unspecified population"),
            "place": input_data.get("scope", {}).get("place", "unspecified place"),
            "time": input_data.get("scope", {}).get("time", "unspecified period"),
            "scale": input_data.get("scope", {}).get("scale", "unspecified scale"),
        },
        "stakes": input_data.get("stakes", []),
        "rationale": input_data.get("rationale", ""),
        "tags": unique(list(input_data.get("tags", []))),
        "scores": input_data.get("scores", {}),
        "origin": input_data.get("origin")
        or {
            "seedId": None,
            "personaId": None,
            "personaLabel": None,
            "noveltyAngle": None,
            "sourcePaperIds": [],
        },
        "critique": input_data.get("critique")
        or {
            "flags": [],
            "penalty": 0,
            "summary": "",
        },
        "literatureTrace": input_data.get("literatureTrace"),
        "round": input_data.get("round") or input_data.get("origin", {}).get("round") or "initial",
        "topicProfile": build_topic_profile(
            input_data.get("topicProfile")
            or {
                "object": input_data.get("object"),
                "keywords": input_data.get("origin", {}).get("focusTerms") or [],
            }
        ),
    }
    signature = build_idea_signature(idea)
    family_id = input_data.get("familyId") or build_idea_family_id(idea)
    idea_id = input_data.get("id") or _stable_id(
        "idea",
        [signature, idea.get("origin", {}).get("personaId"), idea.get("title")],
    )
    return {"id": idea_id, "familyId": family_id, **idea, "signature": signature}


def create_research_state(input_data: dict[str, Any] | None = None) -> dict[str, Any]:
    input_data = input_data or {}
    return {
        "focus": {
            "domain": input_data.get("focus", {}).get("domain", "unspecified domain"),
            "objects": input_data.get("focus", {}).get("objects", []),
        },
        "constraints": {
            "preferredPuzzles": input_data.get("constraints", {}).get("preferredPuzzles", []),
            "preferredClaims": input_data.get("constraints", {}).get("preferredClaims", []),
            "evidenceKinds": input_data.get("constraints", {}).get("evidenceKinds", []),
            "keywords": input_data.get("constraints", {}).get("keywords", []),
            "personaIds": input_data.get("constraints", {}).get("personaIds", []),
            "avoidPuzzles": input_data.get("constraints", {}).get("avoidPuzzles", []),
            "avoidClaims": input_data.get("constraints", {}).get("avoidClaims", []),
            "avoidEvidenceKinds": input_data.get("constraints", {}).get("avoidEvidenceKinds", []),
            "avoidKeywords": input_data.get("constraints", {}).get("avoidKeywords", []),
            "avoidPersonaIds": input_data.get("constraints", {}).get("avoidPersonaIds", []),
        },
        "contrasts": input_data.get("contrasts", []),
        "scope": input_data.get("scope", {}),
        "stakes": input_data.get("stakes", []),
        "activePreferences": input_data.get("activePreferences", {}),
        "topicProfile": build_topic_profile(input_data),
        "feedbackStrategy": input_data.get("feedbackStrategy")
        or {
            "mode": "default",
            "expandLaterally": False,
            "avoidOverNarrowing": False,
            "forceExtraRound": False,
        },
        "visitedSignatures": input_data.get("visitedSignatures", []),
        "acceptedIdeas": input_data.get("acceptedIdeas", []),
        "rejectedIdeas": input_data.get("rejectedIdeas", []),
        "frontier": input_data.get("frontier", []),
        "history": input_data.get("history", []),
    }
