"""Static domain taxonomy and brainstorming personas."""

from __future__ import annotations

import re
from typing import Any


PUZZLES = [
    {
        "id": "blind_spot",
        "label": "Blind spot",
        "question": "What population, setting, or material is being systematically overlooked?",
        "preferredClaims": ["describe", "measure", "compare"],
    },
    {
        "id": "conflict",
        "label": "Conflict",
        "question": "Which theories, observations, or findings are in tension?",
        "preferredClaims": ["compare", "explain", "identify", "critique"],
    },
    {
        "id": "distortion",
        "label": "Distortion",
        "question": "Where do current concepts, indicators, or narratives misrepresent reality?",
        "preferredClaims": ["measure", "compare", "critique", "design"],
    },
    {
        "id": "mechanism_unknown",
        "label": "Mechanism unknown",
        "question": "What process is generating the observed pattern?",
        "preferredClaims": ["explain", "identify", "intervene"],
    },
    {
        "id": "boundary_unknown",
        "label": "Boundary unknown",
        "question": "For whom, where, or when does an existing pattern hold or fail?",
        "preferredClaims": ["compare", "measure", "predict", "identify"],
    },
    {
        "id": "leverage_unknown",
        "label": "Leverage unknown",
        "question": "What intervention or design change could move the outcome?",
        "preferredClaims": ["identify", "intervene", "design", "predict"],
    },
]


CLAIMS = [
    {
        "id": "describe",
        "label": "Describe",
        "outcome": "map the shape, distribution, or experience of a phenomenon",
        "defaultEvidence": ["observational_data", "survey", "archive"],
    },
    {
        "id": "measure",
        "label": "Measure",
        "outcome": "turn a hard-to-observe construct into a usable variable",
        "defaultEvidence": ["survey", "text_corpus", "sensor_data"],
    },
    {
        "id": "compare",
        "label": "Compare",
        "outcome": "show how outcomes vary across groups, settings, or periods",
        "defaultEvidence": ["observational_data", "survey", "administrative_data"],
    },
    {
        "id": "explain",
        "label": "Explain",
        "outcome": "identify the process that links conditions to outcomes",
        "defaultEvidence": ["interviews", "case_study", "administrative_data"],
    },
    {
        "id": "identify",
        "label": "Identify",
        "outcome": "estimate a causal effect under explicit assumptions",
        "defaultEvidence": ["administrative_data", "experiment", "quasi_experiment"],
    },
    {
        "id": "predict",
        "label": "Predict",
        "outcome": "forecast risk, change, or future states",
        "defaultEvidence": ["observational_data", "sensor_data", "administrative_data"],
    },
    {
        "id": "intervene",
        "label": "Intervene",
        "outcome": "change a system and measure the downstream effect",
        "defaultEvidence": ["experiment", "quasi_experiment", "field_trial"],
    },
    {
        "id": "design",
        "label": "Design",
        "outcome": "propose and test a better procedure, institution, or tool",
        "defaultEvidence": ["prototype", "simulation", "field_trial"],
    },
    {
        "id": "critique",
        "label": "Critique",
        "outcome": "surface hidden assumptions, exclusions, or power effects",
        "defaultEvidence": ["archive", "text_corpus", "interviews"],
    },
]


EVIDENCE_LIBRARY = {
    "observational_data": "observational datasets or field records",
    "survey": "survey responses or structured questionnaires",
    "archive": "archival material, policy records, or historical documents",
    "text_corpus": "text corpora, transcripts, or discourse data",
    "administrative_data": "administrative or institutional records",
    "interviews": "interviews, ethnographic notes, or process tracing material",
    "case_study": "comparative case study material",
    "experiment": "lab or online experiments",
    "quasi_experiment": "quasi-experimental variation",
    "field_trial": "field intervention or policy trial",
    "sensor_data": "sensor, mobility, or environmental measurements",
    "prototype": "prototypes, workflow artifacts, or design outputs",
    "simulation": "simulation or scenario outputs",
}


def _normalize(value: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


ANALOGY_PATTERNS = [
    "a queueing bottleneck rather than a simple capacity shortfall",
    "a feedback control problem rather than a static allocation problem",
    "a triage protocol rather than a universal service problem",
    "a signal detection problem rather than a pure information deficit",
    "a threshold effect rather than a smooth linear response",
]


def _pick_analogy_pattern(obj: str) -> str:
    clean = _normalize(obj)
    score = sum(ord(char) for char in clean)
    return ANALOGY_PATTERNS[score % len(ANALOGY_PATTERNS)]


PERSONAS = [
    {
        "id": "anomaly_hunter",
        "label": "Anomaly Hunter",
        "principle": "Start from a stubborn fact that the dominant story does not explain.",
        "preferredPuzzles": ["conflict", "mechanism_unknown"],
        "preferredClaims": ["explain", "identify", "compare"],
        "evidenceBias": ["administrative_data", "experiment", "case_study"],
    },
    {
        "id": "assumption_breaker",
        "label": "Assumption Breaker",
        "principle": "Replace a quiet background assumption with a deliberately hostile alternative.",
        "preferredPuzzles": ["conflict", "leverage_unknown", "boundary_unknown"],
        "preferredClaims": ["critique", "design", "compare"],
        "evidenceBias": ["archive", "text_corpus", "case_study"],
    },
    {
        "id": "measurement_skeptic",
        "label": "Measurement Skeptic",
        "principle": "Assume the key variable is being measured in a misleading way.",
        "preferredPuzzles": ["distortion", "boundary_unknown"],
        "preferredClaims": ["measure", "compare", "critique"],
        "evidenceBias": ["sensor_data", "survey", "text_corpus"],
    },
    {
        "id": "failure_miner",
        "label": "Failure Miner",
        "principle": "Start from breakdowns, reversals, and negative outcomes instead of successes.",
        "preferredPuzzles": ["leverage_unknown", "mechanism_unknown", "conflict"],
        "preferredClaims": ["identify", "intervene", "explain"],
        "evidenceBias": ["field_trial", "administrative_data", "interviews"],
    },
    {
        "id": "boundary_mapper",
        "label": "Boundary Mapper",
        "principle": "Find where a known claim stops traveling across people, places, times, or scales.",
        "preferredPuzzles": ["boundary_unknown", "conflict"],
        "preferredClaims": ["compare", "predict", "identify"],
        "evidenceBias": ["administrative_data", "survey", "observational_data"],
    },
    {
        "id": "analogy_transfer",
        "label": "Analogy Transfer",
        "principle": "Import a problem structure from a distant field without copying its surface vocabulary.",
        "preferredPuzzles": ["mechanism_unknown", "distortion", "leverage_unknown"],
        "preferredClaims": ["design", "explain", "measure"],
        "evidenceBias": ["simulation", "prototype", "text_corpus"],
    },
]


def get_puzzle(puzzle_id: str) -> dict[str, Any] | None:
    return next((item for item in PUZZLES if item["id"] == puzzle_id), None)


def get_claim(claim_id: str) -> dict[str, Any] | None:
    return next((item for item in CLAIMS if item["id"] == claim_id), None)


def get_persona(persona_id: str) -> dict[str, Any] | None:
    return next((item for item in PERSONAS if item["id"] == persona_id), None)


def resolve_personas(ids: list[str] | None = None) -> list[dict[str, Any]]:
    if not ids:
        return PERSONAS
    return [persona for persona_id in ids if (persona := get_persona(persona_id))]


def build_persona_seed(persona: dict[str, Any], *, obj: str, contrast: dict[str, Any], anchor_title: str | None = None) -> dict[str, str]:
    if persona["id"] == "anomaly_hunter":
        return {
            "hook": f"Widely repeated claims about {obj} may break once {contrast['comparison']} is examined closely.",
            "pivot": f"look for a mismatch between the dominant account and what {contrast['comparison']} reveals",
            "questionStem": f"Which accepted story about {obj} stops making sense when {contrast['comparison']} is compared?",
            "noveltyAngle": f"Treat {obj} as a contradiction to explain rather than a settled success story.",
            "anchorNote": f"Nearest literature anchor: {anchor_title}." if anchor_title else "",
        }

    if persona["id"] == "assumption_breaker":
        return {
            "hook": f"Most work on {obj} assumes the main constraint is obvious, but {contrast['comparison']} suggests otherwise.",
            "pivot": f"replace the default assumption about {obj} with a harder alternative explanation",
            "questionStem": f"What if {obj} is constrained less by scarcity and more by hidden rules exposed by {contrast['comparison']}?",
            "noveltyAngle": "Break a default assumption and force the project to ask what everyone else is taking for granted.",
            "anchorNote": "",
        }

    if persona["id"] == "measurement_skeptic":
        return {
            "hook": f"The main metric used to study {obj} may hide the very difference that {contrast['comparison']} puts on the table.",
            "pivot": "treat the core variable as mismeasured rather than missing",
            "questionStem": f"When do official measures of {obj} diverge from what {contrast['comparison']} actually captures?",
            "noveltyAngle": f"Recast {obj} as a representation problem instead of a simple evidence problem.",
            "anchorNote": f"Nearest literature anchor: {anchor_title}." if anchor_title else "",
        }

    if persona["id"] == "failure_miner":
        return {
            "hook": f"The most interesting thing about {obj} may be where it fails, stalls, or backfires under {contrast['comparison']}.",
            "pivot": "elevate failures and reversals from edge cases to the main research target",
            "questionStem": f"Under what conditions does {obj} fail exactly where {contrast['comparison']} should have made it work best?",
            "noveltyAngle": "Mine failures and backfires rather than polishing a best-case account.",
            "anchorNote": "",
        }

    if persona["id"] == "boundary_mapper":
        return {
            "hook": f"Current findings about {obj} may look stable only because {contrast['comparison']} has not been used to map the edges.",
            "pivot": "shift the question from average effects to where claims stop holding",
            "questionStem": f"For whom, where, or when do standard explanations of {obj} fail once {contrast['comparison']} is traced?",
            "noveltyAngle": "Push the project toward boundary conditions instead of average-case claims.",
            "anchorNote": "",
        }

    analogy = _pick_analogy_pattern(obj)
    return {
        "hook": f"Try treating {obj} like {analogy}.",
        "pivot": f"translate {obj} into a distant problem structure revealed by {contrast['comparison']}",
        "questionStem": f"What changes if {obj} is approached like {analogy} when {contrast['comparison']} is the key contrast?",
        "noveltyAngle": "Import a distant causal structure so the project changes shape rather than just topic.",
        "anchorNote": "",
    }
