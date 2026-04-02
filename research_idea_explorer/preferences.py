"""Preference parsing, normalization, and merging."""

from __future__ import annotations

import re
from typing import Any

from .domain import CLAIMS, EVIDENCE_LIBRARY, PERSONAS, PUZZLES
from .schema import normalize_text, unique


POSITIVE_FIELDS = ["preferredPuzzles", "preferredClaims", "evidenceKinds", "personaIds", "keywords", "stakes"]
NEGATIVE_FIELDS = ["avoidPuzzles", "avoidClaims", "avoidEvidenceKinds", "avoidPersonaIds", "avoidKeywords"]
PROFILE_FIELDS = [*POSITIVE_FIELDS, *NEGATIVE_FIELDS, "notes"]

FIELD_PAIRS = [
    ("preferredPuzzles", "avoidPuzzles"),
    ("preferredClaims", "avoidClaims"),
    ("evidenceKinds", "avoidEvidenceKinds"),
    ("personaIds", "avoidPersonaIds"),
    ("keywords", "avoidKeywords"),
]


def create_preference_profile(input_data: dict[str, Any] | None = None) -> dict[str, Any]:
    input_data = input_data or {}
    profile = {field: unique(list(input_data.get(field, []))) for field in PROFILE_FIELDS}
    if input_data.get("topicProfile"):
        profile["topicProfile"] = input_data["topicProfile"]
    if input_data.get("updatedAt"):
        profile["updatedAt"] = input_data["updatedAt"]
    return _resolve_conflicts(profile)


def has_preference_signal(profile: dict[str, Any] | None) -> bool:
    profile = profile or {}
    return any(profile.get(field) for field in PROFILE_FIELDS)


def merge_preference_profiles(*profiles: dict[str, Any] | None) -> dict[str, Any]:
    merged = create_preference_profile()
    for profile in profiles:
        if not profile:
            continue
        for field in PROFILE_FIELDS:
            merged[field] = unique([*merged.get(field, []), *list(profile.get(field, []))])
        if profile.get("topicProfile"):
            merged["topicProfile"] = profile["topicProfile"]
        if profile.get("updatedAt"):
            merged["updatedAt"] = profile["updatedAt"]
        merged = _resolve_conflicts(merged, latest=profile)
    return merged


def summarize_preference_profile(profile: dict[str, Any] | None) -> list[str]:
    profile = profile or {}
    lines = []
    mapping = {
        "preferredClaims": "Preferred claims",
        "preferredPuzzles": "Preferred puzzles",
        "evidenceKinds": "Preferred evidence",
        "personaIds": "Preferred moves",
        "keywords": "Preferred keywords",
        "stakes": "Preferred stakes",
        "avoidClaims": "Avoid claims",
        "avoidPuzzles": "Avoid puzzles",
        "avoidEvidenceKinds": "Avoid evidence",
        "avoidPersonaIds": "Avoid moves",
        "avoidKeywords": "Avoid keywords",
    }
    for field in [
        "preferredClaims",
        "preferredPuzzles",
        "evidenceKinds",
        "personaIds",
        "keywords",
        "stakes",
        "avoidClaims",
        "avoidPuzzles",
        "avoidEvidenceKinds",
        "avoidPersonaIds",
        "avoidKeywords",
    ]:
        if profile.get(field):
            lines.append(f"{mapping[field]}: {', '.join(profile[field])}")
    if profile.get("notes"):
        lines.append(f"Notes: {' | '.join(profile['notes'][:3])}")
    return lines


def extract_preferences_from_notes(notes: list[str] | None = None) -> dict[str, Any]:
    notes = [str(note).strip() for note in notes or [] if str(note or "").strip()]
    profile = create_preference_profile({"notes": notes})
    for note in notes:
        clauses = [chunk.strip() for chunk in re.split(r"[，,;；。.!?\n]+", note) if chunk.strip()]
        for clause in clauses:
            raw = clause.lower()
            normalized = normalize_text(clause)
            _apply_term_matches(profile, raw, normalized)
            _apply_stake_matches(profile, raw, normalized)
        _apply_keyword_hints(profile, note, note.lower())
    return _resolve_conflicts(profile)


def _resolve_conflicts(profile: dict[str, Any], latest: dict[str, Any] | None = None) -> dict[str, Any]:
    profile = {**profile}
    latest = latest or {}
    for positive, negative in FIELD_PAIRS:
        positive_values = list(profile.get(positive, []))
        negative_values = list(profile.get(negative, []))
        latest_positive = set(latest.get(positive, []))
        latest_negative = set(latest.get(negative, []))
        if latest_positive:
            negative_values = [value for value in negative_values if value not in latest_positive]
        if latest_negative:
            positive_values = [value for value in positive_values if value not in latest_negative]
        overlap = set(positive_values) & set(negative_values)
        if overlap:
            negative_values = [value for value in negative_values if value not in overlap]
        profile[positive] = unique(positive_values)
        profile[negative] = unique(negative_values)
    return profile


NEGATIVE_CUES = [
    "avoid",
    "dont",
    "don't",
    "do not",
    "without",
    "no ",
    "less ",
    "not ",
    "不要",
    "别",
    "避免",
    "不想",
    "不需要",
    "别用",
]

POSITIVE_CUES = [
    "prefer",
    "want",
    "focus on",
    "prioritize",
    "lean",
    "more ",
    "偏",
    "更偏",
    "优先",
    "希望",
    "最好",
    "想要",
    "想做",
]

TERM_GROUPS = {
    "preferredClaims": [
        ("identify", ["causal", "causal identification", "identification", "identify", "因果", "识别", "因果识别"]),
        ("explain", ["mechanism", "explain", "解释", "机制"]),
        ("measure", ["measurement", "measure", "measurement validity", "测量", "指标"]),
        ("compare", ["compare", "comparison", "heterogeneity", "比较", "异质性"]),
        ("predict", ["predict", "forecast", "prediction", "预测"]),
        ("intervene", ["intervention", "intervene", "policy trial", "干预", "试点"]),
        ("design", ["design", "tooling", "prototype", "设计", "原型"]),
        ("critique", ["critique", "critical", "power", "批判"]),
        ("describe", ["describe", "mapping", "descriptive", "描述"]),
    ],
    "preferredPuzzles": [
        ("conflict", ["conflict", "tension", "contradiction", "冲突", "张力", "矛盾"]),
        ("distortion", ["distortion", "mismeasure", "misrepresentation", "扭曲", "表征"]),
        ("mechanism_unknown", ["mechanism", "process", "why", "机制", "过程"]),
        ("boundary_unknown", ["boundary", "for whom", "where", "when", "边界", "适用条件"]),
        ("leverage_unknown", ["intervention point", "leverage", "policy lever", "杠杆", "干预点"]),
        ("blind_spot", ["blind spot", "overlooked", "遗漏", "盲点"]),
    ],
    "evidenceKinds": [
        ("survey", ["survey", "questionnaire", "问卷"]),
        ("administrative_data", ["administrative", "registry", "institutional records", "行政数据", "管理数据"]),
        ("text_corpus", ["text", "corpus", "discourse", "文本", "语料"]),
        ("simulation", ["simulation", "scenario", "模拟", "情景"]),
        ("interviews", ["interview", "ethnography", "访谈", "民族志"]),
        ("case_study", ["case study", "comparative case", "案例"]),
        ("experiment", ["experiment", "lab experiment", "实验"]),
        ("quasi_experiment", ["quasi experiment", "did", "iv", "rdd", "准实验", "双重差分"]),
        ("field_trial", ["field trial", "field experiment", "pilot", "现场实验", "试点"]),
        ("sensor_data", ["sensor", "mobility traces", "environmental measurement", "传感器"]),
        ("prototype", ["prototype", "artifact", "workflow prototype", "原型"]),
        ("archive", ["archive", "historical records", "档案"]),
        ("observational_data", ["observational", "panel", "registry data", "观察数据"]),
    ],
    "personaIds": [
        ("anomaly_hunter", ["anomaly", "surprising fact", "反常识", "异常"]),
        ("assumption_breaker", ["assumption", "take for granted", "假设", "默认前提"]),
        ("measurement_skeptic", ["measurement", "metric", "指标", "测量"]),
        ("failure_miner", ["failure", "backfire", "失败", "反噬"]),
        ("boundary_mapper", ["boundary", "scope condition", "边界", "适用范围"]),
        ("analogy_transfer", ["analogy", "borrow from another field", "类比", "迁移"]),
    ],
}


STAKE_PATTERNS = [
    ("policy relevance", ["policy relevance", "policy relevant", "policy impact", "政策相关", "政策意义", "治理意义"]),
    ("theoretical contribution", ["theory", "theoretical", "理论贡献"]),
    ("feasibility", ["feasible", "doable", "practical", "可做", "可行"]),
    ("novelty", ["novel", "original", "新颖", "原创"]),
]


def _apply_term_matches(profile: dict[str, Any], raw: str, normalized: str) -> None:
    for field, groups in TERM_GROUPS.items():
        negative_field = {
            "preferredClaims": "avoidClaims",
            "preferredPuzzles": "avoidPuzzles",
            "evidenceKinds": "avoidEvidenceKinds",
            "personaIds": "avoidPersonaIds",
        }[field]
        for canonical, aliases in groups:
            if _has_negative_signal(raw, normalized, aliases):
                profile[negative_field] = unique([*profile.get(negative_field, []), canonical])
            elif _has_positive_signal(raw, normalized, aliases):
                profile[field] = unique([*profile.get(field, []), canonical])


def _apply_stake_matches(profile: dict[str, Any], raw: str, normalized: str) -> None:
    for canonical, aliases in STAKE_PATTERNS:
        if _has_positive_signal(raw, normalized, aliases) or any(_contains_phrase(raw, normalized, alias) for alias in aliases):
            profile["stakes"] = unique([*profile.get("stakes", []), canonical])


def _apply_keyword_hints(profile: dict[str, Any], note: str, raw: str) -> None:
    explicit_positive = re.findall(r"(?:keyword|keywords|关键词)\s*[:：]\s*([A-Za-z0-9_\-\s,\/]+)", note, flags=re.IGNORECASE)
    explicit_negative = re.findall(r"(?:avoid keyword|avoid keywords|排除关键词|不要关键词)\s*[:：]\s*([A-Za-z0-9_\-\s,\/]+)", note, flags=re.IGNORECASE)
    for chunk in explicit_positive:
        for token in _split_keywords(chunk):
            profile["keywords"] = unique([*profile.get("keywords", []), token])
    for chunk in explicit_negative:
        for token in _split_keywords(chunk):
            profile["avoidKeywords"] = unique([*profile.get("avoidKeywords", []), token])
    for phrase in ["llm", "large language model", "chatgpt", "gpt", "agentic", "benchmark"]:
        if _has_negative_signal(raw, normalize_text(note), [phrase]):
            profile["avoidKeywords"] = unique([*profile.get("avoidKeywords", []), normalize_text(phrase)])


def _split_keywords(chunk: str) -> list[str]:
    return unique([normalize_text(item) for item in re.split(r"[,/]", chunk) if normalize_text(item)])


def _contains_phrase(raw: str, normalized: str, phrase: str) -> bool:
    phrase_raw = phrase.lower()
    phrase_normalized = normalize_text(phrase)
    return phrase_raw in raw or (phrase_normalized and phrase_normalized in normalized)


def _has_positive_signal(raw: str, normalized: str, aliases: list[str]) -> bool:
    if not any(_contains_phrase(raw, normalized, alias) for alias in aliases):
        return False
    if _has_negative_signal(raw, normalized, aliases):
        return False
    if any(cue in raw for cue in POSITIVE_CUES):
        return True
    return len(raw.split()) <= 5


def _has_negative_signal(raw: str, normalized: str, aliases: list[str]) -> bool:
    return any(_cue_matches_alias(raw, normalized, cue, alias) for cue in NEGATIVE_CUES for alias in aliases)


def _cue_matches_alias(raw: str, normalized: str, cue: str, alias: str) -> bool:
    raw_pattern = re.escape(cue.lower()) + r".{0,18}" + re.escape(alias.lower())
    cue_normalized = normalize_text(cue)
    alias_normalized = normalize_text(alias)
    normalized_pattern = re.escape(cue_normalized) + r".{0,18}" + re.escape(alias_normalized)
    return bool(re.search(raw_pattern, raw)) or bool(cue_normalized and alias_normalized and re.search(normalized_pattern, normalized))
