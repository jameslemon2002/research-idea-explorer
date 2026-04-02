"""Markdown and JSON presentation helpers."""

from __future__ import annotations

import json
from typing import Any

from .idea_language import (
    build_claim_method_frame,
    build_idea_title,
    build_problem_frame,
    build_scope_summary,
    build_significance_frame,
    build_study_context,
    capitalize_sentence,
    join_readable,
    strip_terminal_punctuation,
)
from .preferences import summarize_preference_profile


def _compact_sentences(parts: list[str]) -> str:
    return " ".join(part.strip() for part in parts if str(part or "").strip())


def _lower_phrase(value: str | None) -> str:
    text = strip_terminal_punctuation(value)
    return f"{text[:1].lower()}{text[1:]}" if text else ""


def _resolve_paper(context: dict[str, Any], paper_id: str | None) -> dict[str, Any] | None:
    if not paper_id:
        return None
    paper_map = context.get("paperMap")
    if isinstance(paper_map, dict):
        return paper_map.get(paper_id)
    papers = context.get("papers") or []
    return next((paper for paper in papers if paper.get("id") == paper_id), None)


def _build_risk_note(idea: dict[str, Any]) -> str:
    notes_by_flag = {
        "crowded_literature": "the surrounding literature is already crowded, so the contribution depends on a sharper contrast or data advantage",
        "weak_contrast": "the comparison may still be too broad and should be narrowed before execution",
        "near_duplicate_cluster": "nearby ideas are close enough that this direction needs a clearer empirical edge",
        "weak_brainstorm_signal": "the motivating research move is still under-specified",
    }
    notes = [notes_by_flag[flag] for flag in idea.get("critique", {}).get("flags", []) if flag in notes_by_flag]
    return f"Main risk: {join_readable(notes)}." if notes else ""


def build_idea_card_view(idea: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = context or {}
    literature_anchor = _resolve_paper(context, idea.get("scores", {}).get("nearestPaperId") or idea.get("critique", {}).get("nearestPaperId"))
    study_context = build_study_context(idea.get("scope"))
    scope_summary = build_scope_summary(idea.get("scope"))
    title = build_idea_title(idea)
    abstract = _compact_sentences(
        [
            f"This project treats {idea['object']} as a {idea['puzzle']['label'].lower()} problem and {build_problem_frame(idea)}.",
            f"Using {_lower_phrase(idea['evidence']['detail'])}, it studies {idea['contrast']['comparison']}{f' {study_context}' if study_context else ''}, aiming to {strip_terminal_punctuation(idea['claim']['outcome'])}.",
        ]
    )
    design = _compact_sentences(
        [
            f"Collect {_lower_phrase(idea['evidence']['detail'])}{f' {study_context}' if study_context else ''}.",
            f"{capitalize_sentence(build_claim_method_frame(idea))}.",
            f"Compare {idea['contrast']['comparison']}.",
            f'Use "{literature_anchor["title"]}" as the nearest literature anchor, then push it toward the sharper comparison.' if literature_anchor else "",
        ]
    )
    distinctiveness = _compact_sentences(
        [
            f"The differentiating move is to {_lower_phrase(idea.get('origin', {}).get('noveltyAngle'))}." if idea.get("origin", {}).get("noveltyAngle") else "",
            f'It sits close to "{literature_anchor["title"]}" in the retrieved literature but shifts attention toward {idea["contrast"]["comparison"]}.' if literature_anchor else f'It foregrounds {idea["contrast"]["comparison"]} instead of another average-case account of {idea["object"]}.',
            _build_risk_note(idea),
        ]
    )
    significance = _compact_sentences(
        [
            f"This matters for {join_readable(idea.get('stakes') or [])} because {build_significance_frame(idea)}." if idea.get("stakes") else f"{capitalize_sentence(build_significance_frame(idea))}.",
            f"The most concrete setting here is {scope_summary}." if scope_summary else "",
        ]
    )
    return {
        "title": title,
        "abstract": abstract,
        "design": design,
        "distinctiveness": distinctiveness,
        "significance": significance,
        "literatureAnchor": literature_anchor["title"] if literature_anchor else None,
    }


def format_idea_markdown(idea: dict[str, Any], context: dict[str, Any] | None = None) -> str:
    card = build_idea_card_view(idea, context)
    return "\n".join(
        [
            f"### {card['title']}",
            f"- Abstract: {card['abstract']}",
            f"- Design: {card['design']}",
            f"- Distinctiveness: {card['distinctiveness']}",
            f"- Significance: {card['significance']}",
        ]
    )


def _build_paper_context(result: dict[str, Any]) -> dict[str, Any]:
    return {"paperMap": result.get("index", {}).get("paperMap"), "papers": result.get("papers", [])}


def _format_seed(seed: dict[str, Any]) -> str:
    return f"- {seed['questionStem']}\n  Research move: {seed['noveltyAngle']}"


def _format_literature_loop(pipeline: dict[str, Any]) -> list[str]:
    mutation = pipeline.get("rounds", {}).get("mutation", {})
    first_focus = pipeline.get("rounds", {}).get("firstFocus", {}).get("frontier", [])
    neighborhoods = pipeline.get("literatureMap", {}).get("neighborhoods", [])
    effective_rounds = pipeline.get("effectiveRounds") or (2 if mutation.get("seeds") else 1)
    feedback_strategy = pipeline.get("feedbackStrategy", {})
    lines = ["## Literature Loop", ""]
    lines.append(f"- Search depth: {effective_rounds} round{'s' if effective_rounds > 1 else ''}")
    lines.append(f"- Initial map: {pipeline.get('literatureMap', {}).get('queryCount', 0)} queries -> {len(neighborhoods)} literature neighborhoods")
    if feedback_strategy.get("mode") == "lateral_reset":
        lines.append("- Feedback pressure: repeated rejection triggered a lateral reset instead of a narrower continuation")
    elif feedback_strategy.get("mode") == "lateral_expand":
        lines.append("- Feedback pressure: the system widened the search away from previously rejected directions")
    if effective_rounds >= 2:
        lines.append(f"- First focus: {len(first_focus)} idea families retained for the second pass")
        lines.append(f"- Mutation pass: {len(mutation.get('traces', []))} targeted literature probes -> {len(mutation.get('seeds', []))} second-pass branches")
        lines.append(f"- Final search pool: {len(pipeline.get('rankedIdeas', []))} ranked ideas after two rounds")
    else:
        lines.append(f"- First focus: {len(first_focus)} idea families retained in the single-pass frontier")
        lines.append(f"- Final search pool: {len(pipeline.get('rankedIdeas', []))} ranked ideas after one round")
    lines.append("")
    return lines


def format_ideas_markdown(result: dict[str, Any], memory_path: str) -> str:
    pipeline = result["pipeline"]
    initial_seeds = pipeline.get("rounds", {}).get("initial", {}).get("brainstormSeeds", []) or pipeline.get("brainstormSeeds", [])
    mutation_seeds = pipeline.get("rounds", {}).get("mutation", {}).get("seeds", [])
    effective_rounds = pipeline.get("effectiveRounds") or (2 if mutation_seeds else 1)
    lines = [
        "# Research Idea Explorer",
        "",
        f"Query: {result['query']}",
        f"Providers: {', '.join(result.get('providers', []))}",
        f"Memory: {memory_path}",
        "",
    ]
    active_preferences = pipeline.get("activePreferences") or {}
    preference_lines = summarize_preference_profile(active_preferences)
    if preference_lines:
        lines.extend(["## Active Preferences", ""])
        lines.extend([f"- {line}" for line in preference_lines])
        lines.append("")
    if result.get("errors"):
        lines.extend(["## Provider Errors", ""])
        for item in result["errors"]:
            lines.append(f"- {item['provider']}: {item['error']}")
        lines.append("")
    lines.extend(["## Top Papers", ""])
    for hit in result.get("rankedHits", [])[:5]:
        provider_label = "+".join(hit["paper"].get("providers", [])) if hit["paper"].get("providers") else hit["paper"].get("provider")
        lines.append(f"- {hit['paper']['title']} [{provider_label}] ({hit['paper'].get('year') or 'n.d.'}) score={hit['score']:.3f}")
    lines.append("")
    lines.extend(_format_literature_loop(pipeline))
    lines.extend(["## First-Pass Research Moves" if effective_rounds >= 2 else "## Research Moves", ""])
    for seed in initial_seeds:
        lines.append(_format_seed(seed))
    lines.append("")
    if mutation_seeds:
        lines.extend(["## Second-Pass Literature Branches", ""])
        for seed in mutation_seeds:
            lines.append(_format_seed(seed))
        lines.append("")
    lines.extend(["## Frontier Ideas", ""])
    paper_context = _build_paper_context(result)
    for idea in pipeline.get("frontier", []):
        lines.append(format_idea_markdown(idea, paper_context))
        lines.append("")
    return "\n".join(lines).strip()


def build_json_result(result: dict[str, Any], memory_path: str) -> str:
    paper_context = _build_paper_context(result)
    payload = {
        "query": result["query"],
        "providers": result.get("providers", []),
        "effectiveRounds": result["pipeline"].get("effectiveRounds"),
        "memoryScope": result["pipeline"].get("memoryScope"),
        "topicProfile": result["pipeline"].get("topicProfile"),
        "activePreferences": result["pipeline"].get("activePreferences"),
        "feedbackStrategy": result["pipeline"].get("feedbackStrategy"),
        "errors": [{"provider": item["provider"], "message": str(item["error"])} for item in result.get("errors", [])],
        "topPapers": [hit["paper"] for hit in result.get("rankedHits", [])[:5]],
        "literatureMap": result["pipeline"].get("literatureMap"),
        "brainstormSeeds": result["pipeline"].get("brainstormSeeds"),
        "rounds": result["pipeline"].get("rounds"),
        "frontier": [{**idea, "cardView": build_idea_card_view(idea, paper_context)} for idea in result["pipeline"].get("frontier", [])],
        "memoryPath": memory_path,
    }
    return json.dumps(payload, indent=2)
