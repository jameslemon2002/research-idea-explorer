"""User-facing language shaping for research cards."""

from __future__ import annotations

import re


def _clean_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _strip_trailing_punctuation(value: str | None) -> str:
    return re.sub(r"[.?!]+$", "", _clean_text(value))


def _sentence_start(value: str | None) -> str:
    text = _clean_text(value)
    return f"{text[:1].upper()}{text[1:]}" if text else ""


def _is_specified(value: str | None) -> bool:
    text = _clean_text(value)
    return bool(text) and not text.startswith("unspecified")


def _parse_comparison(comparison: str | None) -> dict[str, str]:
    text = _clean_text(comparison)
    versus_match = re.match(r"^(.*?)\s+versus\s+(.*?)$", text, flags=re.I)
    if versus_match:
        return {
            "kind": "versus",
            "left": _clean_text(versus_match.group(1)),
            "right": _clean_text(versus_match.group(2)),
        }

    with_without_match = re.match(r"^(.*?)\s+with and without\s+(.*?)$", text, flags=re.I)
    if with_without_match:
        return {
            "kind": "with_without",
            "base": _clean_text(with_without_match.group(1)),
            "modifier": _clean_text(with_without_match.group(2)),
        }

    return {"kind": "raw", "value": text}


def _looks_like_measurement_target(value: str | None) -> bool:
    text = _clean_text(value).lower()
    return bool(re.search(r"(metric|measure|indicator|record|records|narrative|narratives|experience|reported|official)", text))


def join_readable(values: list[str] | None = None, conjunction: str = "and") -> str:
    items = [_clean_text(value) for value in (values or []) if _clean_text(value)]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} {conjunction} {items[1]}"
    return f"{', '.join(items[:-1])}, {conjunction} {items[-1]}"


def summarize_comparison(comparison: str | None, mode: str = "across") -> str:
    parsed = _parse_comparison(comparison)
    if parsed["kind"] == "versus":
        return parsed["right"] if mode == "beyond" else f"{parsed['left']} and {parsed['right']}"
    if parsed["kind"] == "with_without":
        return f"{parsed['base']} with and without {parsed['modifier']}"
    return parsed.get("value", "")


def build_problem_frame(idea: dict) -> str:
    frames = {
        "blind_spot": "asks what current work is systematically leaving out",
        "conflict": "asks why dominant accounts and observed patterns pull apart",
        "distortion": "treats current metrics or narratives as potentially misleading",
        "mechanism_unknown": "asks which process links conditions to outcomes",
        "boundary_unknown": "maps where an existing claim stops traveling",
        "leverage_unknown": "looks for the intervention or design change that could move the outcome",
    }
    return frames.get(idea.get("puzzle", {}).get("id")) or f"treats this as a {_clean_text(idea.get('puzzle', {}).get('label')).lower()} problem"


def build_claim_method_frame(idea: dict) -> str:
    frames = {
        "describe": "map the distribution of the phenomenon in a way the current literature does not",
        "measure": "build an operational measure and test whether it changes how cases are ranked",
        "compare": "compare outcomes across the focal contrast instead of relying on an average case",
        "explain": "trace the process linking conditions to outcomes",
        "identify": "estimate the effect under explicit assumptions",
        "predict": "test whether the signal improves forecasting",
        "intervene": "change the system and measure the downstream effect",
        "design": "prototype an alternative procedure and benchmark it against current practice",
        "critique": "read for exclusions, hidden assumptions, or power effects",
    }
    return frames.get(idea.get("claim", {}).get("id")) or _strip_trailing_punctuation(idea.get("claim", {}).get("outcome") or "produce a concrete empirical test")


def build_significance_frame(idea: dict) -> str:
    frames = {
        "blind_spot": "headline findings can change once overlooked groups or settings are brought back in",
        "conflict": "decision-makers need to know which competing story actually fits the evidence",
        "distortion": "current indicators may misstate where the problem is most acute",
        "mechanism_unknown": "without a mechanism, it is hard to know which intervention to trust",
        "boundary_unknown": "average effects can hide where a claimed pattern stops holding",
        "leverage_unknown": "current interventions may be targeting the wrong bottleneck",
    }
    return frames.get(idea.get("puzzle", {}).get("id")) or "the contribution depends on specifying a sharper empirical question"


def build_study_context(scope: dict | None = None) -> str:
    scope = scope or {}
    parts = []
    if _is_specified(scope.get("population")):
        parts.append(f"among {_clean_text(scope['population'])}")
    if _is_specified(scope.get("place")):
        parts.append(f"in {_clean_text(scope['place'])}")
    if _is_specified(scope.get("time")):
        parts.append(f"during {_clean_text(scope['time'])}")
    return " ".join(parts)


def build_scope_summary(scope: dict | None = None) -> str:
    scope = scope or {}
    parts = []
    if _is_specified(scope.get("population")):
        parts.append(_clean_text(scope["population"]))
    if _is_specified(scope.get("place")):
        parts.append(_clean_text(scope["place"]))
    if _is_specified(scope.get("time")):
        parts.append(_clean_text(scope["time"]))
    if _is_specified(scope.get("scale")):
        parts.append(f"{_clean_text(scope['scale'])} scale")
    return join_readable(parts)


def build_idea_title(idea: dict) -> str:
    obj = _clean_text(idea.get("object"))
    across = summarize_comparison(idea.get("contrast", {}).get("comparison"), "across")
    beyond = summarize_comparison(idea.get("contrast", {}).get("comparison"), "beyond")
    parsed = _parse_comparison(idea.get("contrast", {}).get("comparison"))
    puzzle_id = idea.get("puzzle", {}).get("id")
    claim_id = idea.get("claim", {}).get("id")

    if puzzle_id == "distortion" and claim_id == "measure" and parsed["kind"] == "versus" and _looks_like_measurement_target(parsed["right"]):
        return f"Measuring {obj} beyond {beyond}"
    if puzzle_id == "distortion" and claim_id == "measure":
        return f"Measuring {obj} across {across}"
    if puzzle_id == "boundary_unknown":
        return f"Where does {obj} stop holding across {across}?"
    if puzzle_id == "conflict" and claim_id in {"identify", "explain", "compare"}:
        return f"When does {obj} diverge across {across}?"
    if claim_id == "design":
        return f"Designing {obj} for {across}"
    if claim_id == "explain":
        return f"Explaining {obj} through {across}"
    if claim_id == "identify":
        return f"Estimating {obj} across {across}"
    if claim_id == "compare":
        return f"Comparing {obj} across {across}"
    if claim_id == "predict":
        return f"Predicting {obj} across {across}"
    if claim_id == "intervene":
        return f"Testing interventions for {obj} across {across}"
    if claim_id == "critique":
        return f"Rethinking {obj} through {across}"
    if claim_id == "measure":
        return f"Measuring {obj} across {across}"
    if claim_id == "describe":
        return f"Mapping {obj} across {across}"
    return _sentence_start(f"{_clean_text(idea.get('claim', {}).get('label'))} {obj} across {across}")


def strip_terminal_punctuation(value: str | None) -> str:
    return _strip_trailing_punctuation(value)


def capitalize_sentence(value: str | None) -> str:
    return _sentence_start(value)
