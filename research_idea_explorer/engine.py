"""Research generation pipeline."""

from __future__ import annotations

import math
import re
from typing import Any

from .domain import EVIDENCE_LIBRARY, get_claim, get_puzzle, resolve_personas, build_persona_seed
from .idea_language import build_idea_title
from .memory import (
    collect_accepted_ideas,
    collect_rejected_ideas,
    collect_visited_ideas,
    collect_visited_signatures,
    create_memory_graph,
    record_pipeline_run,
)
from .retrieval import build_literature_index, get_graph_neighbors, search_literature, trace_literature_queries
from .schema import build_topic_profile, create_brainstorm_seed, create_idea_card, create_research_state, idea_to_match_text, tokenize, unique
from .similarity import idea_similarity


def build_query_seed(query: str, literature_result: dict[str, Any], domain: str | None = None) -> dict[str, Any]:
    return {
        "focus": {"domain": domain or "live-search", "objects": [query]},
        "constraints": {
            "preferredPuzzles": ["conflict", "distortion", "mechanism_unknown", "boundary_unknown"],
            "preferredClaims": ["measure", "explain", "identify", "design"],
            "evidenceKinds": ["survey", "administrative_data", "text_corpus", "simulation"],
            "personaIds": [
                "anomaly_hunter",
                "assumption_breaker",
                "measurement_skeptic",
                "failure_miner",
                "boundary_mapper",
                "analogy_transfer",
            ],
            "keywords": [token for token in re.split(r"\s+", query) if token],
        },
        "contrasts": [
            {"axis": "population", "comparison": "core subgroups with unequal exposure"},
            {"axis": "institution", "comparison": "settings with and without formal intervention"},
            {"axis": "measurement", "comparison": "reported experience versus official metrics"},
        ],
        "scope": {
            "population": "relevant study populations",
            "place": "contexts surfaced by retrieved literature",
            "time": "recent literature window",
            "scale": "mixed",
        },
        "stakes": ["novelty", "feasibility", "literature awareness"],
        "history": [],
        "literature": {"providers": literature_result.get("providers", []), "paperCount": len(literature_result.get("papers", []))},
    }


def dedupe_ideas(ideas: list[dict[str, Any]], threshold: float = 0.74) -> list[dict[str, Any]]:
    seen_signatures = set()
    kept = []
    for idea in ideas:
        if idea["signature"] in seen_signatures:
            continue
        if any(idea_similarity(candidate, idea) >= threshold for candidate in kept):
            continue
        seen_signatures.add(idea["signature"])
        kept.append(idea)
    return kept


def _average(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _build_feedback_strategy(accepted_ideas: list[dict[str, Any]], rejected_ideas: list[dict[str, Any]]) -> dict[str, Any]:
    accepted_count = len(accepted_ideas)
    rejected_count = len(rejected_ideas)
    rejected_families = unique([idea.get("familyId") for idea in rejected_ideas if idea.get("familyId")])
    rejected_comparisons = unique([idea.get("contrast", {}).get("comparison") for idea in rejected_ideas if idea.get("contrast", {}).get("comparison")])
    rejected_evidence_kinds = unique([idea.get("evidence", {}).get("kind") for idea in rejected_ideas if idea.get("evidence", {}).get("kind")])
    rejected_paper_ids = unique(
        [
            idea.get("scores", {}).get("nearestPaperId")
            or idea.get("critique", {}).get("nearestPaperId")
            or idea.get("literatureTrace", {}).get("nearestPaperId")
            or (idea.get("origin", {}).get("sourcePaperIds") or [None])[0]
            for idea in rejected_ideas
        ]
    )
    hard_reset = rejected_count >= 2 and accepted_count == 0
    lateral_expand = hard_reset or (rejected_count >= 2 and rejected_count >= accepted_count)
    return {
        "mode": "lateral_reset" if hard_reset else "lateral_expand" if lateral_expand else "deepen" if accepted_count else "default",
        "acceptedCount": accepted_count,
        "rejectedCount": rejected_count,
        "expandLaterally": lateral_expand,
        "avoidOverNarrowing": lateral_expand,
        "forceExtraRound": hard_reset,
        "rejectedFamilies": rejected_families,
        "rejectedComparisons": rejected_comparisons,
        "rejectedEvidenceKinds": rejected_evidence_kinds,
        "rejectedPaperIds": rejected_paper_ids,
    }


def _pick_contrasts(state: dict[str, Any], feedback_strategy: dict[str, Any]) -> list[dict[str, Any]]:
    contrasts = state.get("contrasts") or []
    if not contrasts:
        return [{"axis": "default", "comparison": "core subgroups and time periods"}]
    rejected_comparisons = set(feedback_strategy.get("rejectedComparisons", []))
    rejected_axes = {idea.get("contrast", {}).get("axis") for idea in state.get("rejectedIdeas", []) if idea.get("contrast", {}).get("axis")}
    ordered = sorted(
        contrasts,
        key=lambda contrast: (2 if contrast.get("comparison") in rejected_comparisons else 0) + (1 if contrast.get("axis") in rejected_axes else 0),
    )
    return ordered[:3]


def _filter_evidence_bias(persona: dict[str, Any], state: dict[str, Any]) -> list[str]:
    preferred = state.get("constraints", {}).get("evidenceKinds", [])
    if not preferred:
        return persona["evidenceBias"]
    overlap = [kind for kind in persona["evidenceBias"] if kind in preferred]
    return overlap or preferred[:3]


def _select_anchor_paper(obj: str, state: dict[str, Any], papers: dict[str, Any]) -> dict[str, Any] | None:
    paper_list = papers.get("papers") if isinstance(papers, dict) else papers
    if not paper_list:
        return None
    query = f"{obj} {' '.join(state.get('constraints', {}).get('keywords', []))}".strip()
    hits = search_literature(papers, query, 1)
    return hits[0]["paper"] if hits else None


STOPWORDS = {
    "about",
    "across",
    "after",
    "among",
    "around",
    "between",
    "during",
    "from",
    "into",
    "over",
    "through",
    "under",
    "with",
    "without",
    "study",
    "studies",
    "effect",
    "effects",
    "using",
    "based",
    "toward",
}


def _extract_adjacent_terms(index: dict[str, Any], rejected_paper_ids: list[str]) -> list[str]:
    return unique(
        [
            term
            for paper_id in rejected_paper_ids
            for neighbor in get_graph_neighbors(index, paper_id, 3)
            for term in [*(neighbor["paper"].get("keywords", [])), *[token for token in tokenize(neighbor["paper"]["title"]) if len(token) > 3]]
        ]
    )[:4]


def _extract_focus_terms(paper: dict[str, Any], query_refs: list[dict[str, Any]]) -> list[str]:
    keyword_terms = [str(keyword).strip() for keyword in paper.get("keywords", []) if str(keyword).strip()]
    title_terms = [term for term in tokenize(paper["title"]) if len(term) > 3 and term not in STOPWORDS][:6]
    query_terms = [term for ref in query_refs for term in tokenize(ref["query"]) if len(term) > 3]
    return unique([*keyword_terms, *query_terms, *title_terms])[:4]


def build_literature_query_specs(state: dict[str, Any], index: dict[str, Any] | None = None, feedback_strategy: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    objects = state.get("focus", {}).get("objects") or [state.get("focus", {}).get("domain") or "research topic"]
    keywords = state.get("constraints", {}).get("keywords", [])
    stakes = state.get("stakes", [])
    contrasts = state.get("contrasts", [])
    feedback_strategy = feedback_strategy or state.get("feedbackStrategy", {})
    query_specs = []

    def push_query(query: str, label: str, weight: float) -> None:
        text = str(query or "").strip()
        if text:
            query_specs.append({"query": text, "label": label, "weight": weight})

    for obj in objects:
        push_query(obj, "core topic", 1.4)
        if keywords:
            push_query(f"{obj} {' '.join(keywords[:4])}", "keywords", 1.15)
        if stakes:
            push_query(f"{obj} {' '.join(stakes[:2])}", "stakes", 0.95)
        for contrast in contrasts[:3]:
            push_query(f"{obj} {contrast['comparison']}", f"contrast:{contrast['axis']}", 1.1)
        if feedback_strategy.get("expandLaterally"):
            rejected = set(feedback_strategy.get("rejectedComparisons", []))
            lateral_contrasts = [contrast for contrast in contrasts if contrast.get("comparison") not in rejected]
            for contrast in lateral_contrasts[:2]:
                push_query(f"{obj} {contrast['comparison']}", f"lateral:{contrast['axis']}", 1.2)
            if index:
                adjacent_terms = _extract_adjacent_terms(index, feedback_strategy.get("rejectedPaperIds", []))
                if adjacent_terms:
                    push_query(f"{obj} {' '.join(adjacent_terms)}", "adjacent neighborhood", 1.02)
            push_query(f"{obj} heterogeneity mechanism boundary", "lateral reset", 0.96)

    deduped = []
    seen = set()
    for spec in query_specs:
        key = " ".join(tokenize(spec["query"]))
        if key and key not in seen:
            seen.add(key)
            deduped.append(spec)
    return deduped


def build_literature_map(state: dict[str, Any], index_input: dict[str, Any], strategy: str = "hybrid", feedback_strategy: dict[str, Any] | None = None, limit: int = 8, anchor_limit: int = 4, per_query_limit: int = 4, neighbor_limit: int = 3) -> dict[str, Any]:
    index = index_input if index_input.get("paperMap") else build_literature_index(index_input or [])
    query_specs = build_literature_query_specs(state, index=index, feedback_strategy=feedback_strategy)
    trace = trace_literature_queries(index, query_specs, {"perQueryLimit": per_query_limit, "limit": limit, "strategy": strategy})
    rejected_paper_ids = set((feedback_strategy or {}).get("rejectedPaperIds", []))
    neighborhoods = []
    for hit in trace["mergedHits"]:
        query_refs = [
            {"label": query["label"], "query": query["query"], "weight": query["weight"]}
            for query in trace["queries"]
            if any(candidate["paper"]["id"] == hit["paper"]["id"] for candidate in query["hits"])
        ]
        neighbors = get_graph_neighbors(index, hit["paper"]["id"], neighbor_limit)
        paper_ids = unique([hit["paper"]["id"], *[neighbor["paper"]["id"] for neighbor in neighbors]])
        neighborhoods.append(
            {
                "id": f"literature-map:{hit['paper']['id']}",
                "anchorPaperId": hit["paper"]["id"],
                "anchorTitle": hit["paper"]["title"],
                "score": hit["score"],
                "breadth": hit["breadth"],
                "queryRefs": query_refs,
                "focusTerms": _extract_focus_terms(hit["paper"], query_refs),
                "paperIds": paper_ids,
                "papers": [index["paperMap"][paper_id] for paper_id in paper_ids if paper_id in index["paperMap"]],
            }
        )
    neighborhoods = sorted(neighborhoods, key=lambda item: ((1 if item["anchorPaperId"] in rejected_paper_ids else 0), -item["score"]))[:anchor_limit]
    return {
        "strategy": strategy,
        "queries": [{"label": query["label"], "query": query["query"], "weight": query["weight"], "topPaperIds": [hit["paper"]["id"] for hit in query["hits"][:3]]} for query in trace["queries"]],
        "mergedHits": trace["mergedHits"],
        "neighborhoods": neighborhoods,
        "uniquePaperCount": trace["uniquePaperCount"],
        "queryCount": len(trace["queries"]),
    }


def brainstorm_seeds(state: dict[str, Any], papers: dict[str, Any], feedback_strategy: dict[str, Any], literature_map: dict[str, Any], limit: int = 36) -> list[dict[str, Any]]:
    personas = resolve_personas(state.get("constraints", {}).get("personaIds"))
    contrasts = _pick_contrasts(state, feedback_strategy)
    neighborhoods = literature_map.get("neighborhoods", [])
    literature_contexts = neighborhoods or [
        {
            "id": f"anchor:{anchor['id']}",
            "anchorPaperId": anchor["id"],
            "anchorTitle": anchor["title"],
            "paperIds": [anchor["id"]],
            "focusTerms": anchor.get("keywords", []),
            "queryRefs": [{"label": "anchor", "query": f"{obj} {' '.join(state.get('constraints', {}).get('keywords', []))}".strip(), "weight": 1}],
        }
        for obj in state.get("focus", {}).get("objects", [])
        if (anchor := _select_anchor_paper(obj, state, papers))
    ]
    seeds = []
    objects = state.get("focus", {}).get("objects", [])
    for obj in objects:
        for persona_index, persona in enumerate(personas):
            literature_context = literature_contexts[(len(seeds) + persona_index) % max(len(literature_contexts), 1)] if literature_contexts else None
            contrast = contrasts[len(seeds) % len(contrasts)]
            seeded = build_persona_seed(persona, obj=obj, contrast=contrast, anchor_title=literature_context.get("anchorTitle") if literature_context else None)
            seeds.append(
                create_brainstorm_seed(
                    {
                        "persona": persona,
                        "object": obj,
                        "hook": seeded["hook"],
                        "pivot": seeded["pivot"],
                        "questionStem": seeded["questionStem"],
                        "noveltyAngle": seeded["noveltyAngle"],
                        "suggestedPuzzles": persona["preferredPuzzles"],
                        "suggestedClaims": persona["preferredClaims"],
                        "contrastSuggestions": contrasts,
                        "evidenceHints": _filter_evidence_bias(persona, state),
                        "sourcePaperIds": (literature_context.get("paperIds", [])[:3] if literature_context else []),
                        "literatureQueries": literature_context.get("queryRefs", []) if literature_context else [],
                        "focusTerms": literature_context.get("focusTerms", []) if literature_context else [],
                        "round": "initial",
                        "stage": "diverge",
                        "tags": [state.get("focus", {}).get("domain"), obj, persona["id"], literature_context.get("id") if literature_context else None],
                    }
                )
            )
    return seeds[:limit]


def crystallize_seeds(brainstorm_seeds_list: list[dict[str, Any]], state: dict[str, Any], limit: int = 64) -> list[dict[str, Any]]:
    ideas = []
    preferred_claims = state.get("constraints", {}).get("preferredClaims", [])
    preferred_puzzles = state.get("constraints", {}).get("preferredPuzzles", [])
    preferred_evidence = state.get("constraints", {}).get("evidenceKinds", [])
    for seed in brainstorm_seeds_list:
        puzzle_ids = [puzzle_id for puzzle_id in seed.get("suggestedPuzzles", []) if not preferred_puzzles or puzzle_id in preferred_puzzles] or seed.get("suggestedPuzzles", [])
        claim_ids = [claim_id for claim_id in seed.get("suggestedClaims", []) if not preferred_claims or claim_id in preferred_claims] or seed.get("suggestedClaims", [])
        puzzles = [puzzle for puzzle_id in puzzle_ids[:2] if (puzzle := get_puzzle(puzzle_id))]
        claims = [claim for claim_id in claim_ids[:2] if (claim := get_claim(claim_id))]
        contrasts = (seed.get("contrastSuggestions") or state.get("contrasts") or [])[:2]
        for puzzle in puzzles:
            for claim in claims:
                overlap = [kind for kind in claim["defaultEvidence"] if kind in seed.get("evidenceHints", []) and (not preferred_evidence or kind in preferred_evidence)]
                selected_evidence = overlap or [kind for kind in claim["defaultEvidence"] if not preferred_evidence or kind in preferred_evidence] or claim["defaultEvidence"]
                for contrast in contrasts:
                    for evidence_kind in selected_evidence[:2]:
                        evidence = {"kind": evidence_kind, "detail": EVIDENCE_LIBRARY[evidence_kind]}
                        ideas.append(
                            create_idea_card(
                                {
                                    "object": seed["object"],
                                    "puzzle": puzzle,
                                    "claim": claim,
                                    "contrast": contrast,
                                    "evidence": evidence,
                                    "scope": state.get("scope"),
                                    "stakes": state.get("stakes"),
                                    "title": build_idea_title({"object": seed["object"], "puzzle": puzzle, "claim": claim, "contrast": contrast}),
                                    "rationale": " ".join(
                                        [
                                            seed["hook"],
                                            seed["noveltyAngle"],
                                            f"The structured move is to treat this as a {puzzle['label'].lower()} problem and {claim['outcome']}.",
                                            f"The key contrast is {contrast['comparison']}.",
                                            f"A practical starting point is {EVIDENCE_LIBRARY[evidence_kind]}.",
                                            f"The main stakes are {', '.join(state.get('stakes', []))}.",
                                        ]
                                    ),
                                    "tags": [state.get("focus", {}).get("domain"), seed["persona"]["id"], puzzle["id"], claim["id"], evidence_kind],
                                    "origin": {
                                        "seedId": seed["id"],
                                        "personaId": seed["persona"]["id"],
                                        "personaLabel": seed["persona"]["label"],
                                        "noveltyAngle": seed["noveltyAngle"],
                                        "sourcePaperIds": seed.get("sourcePaperIds", []),
                                        "literatureQueries": seed.get("literatureQueries", []),
                                        "focusTerms": seed.get("focusTerms", []),
                                        "parentIdeaId": seed.get("parentIdeaId"),
                                        "round": seed.get("round", "initial"),
                                    },
                                    "round": seed.get("round", "initial"),
                                }
                            )
                        )
    return ideas[:limit]


def build_idea_literature_queries(idea: dict[str, Any], state: dict[str, Any], papers: dict[str, Any]) -> list[dict[str, Any]]:
    keywords = state.get("constraints", {}).get("keywords", [])
    paper_map = papers.get("paperMap", {}) if isinstance(papers, dict) else {paper["id"]: paper for paper in papers}
    anchor_paper = paper_map.get((idea.get("origin", {}).get("sourcePaperIds") or [None])[0]) or paper_map.get(idea.get("scores", {}).get("nearestPaperId")) or paper_map.get(idea.get("critique", {}).get("nearestPaperId"))
    queries = [
        {"label": "title probe", "query": idea["title"], "weight": 1.3},
        {"label": "contrast probe", "query": f"{idea['object']} {idea['contrast']['comparison']}", "weight": 1.15},
        {"label": "problem probe", "query": f"{idea['object']} {idea['puzzle']['label']} {idea['claim']['label']}", "weight": 1.05},
    ]
    if keywords:
        queries.append({"label": "keyword probe", "query": f"{idea['object']} {' '.join(keywords[:3])}", "weight": 0.9})
    if anchor_paper and anchor_paper.get("keywords"):
        queries.append({"label": "anchor probe", "query": f"{idea['object']} {' '.join(anchor_paper['keywords'][:3])}", "weight": 0.85})
    return queries


def probe_idea_literature(idea: dict[str, Any], papers: dict[str, Any], state: dict[str, Any], per_query_limit: int = 4, limit: int = 6, strategy: str = "hybrid") -> dict[str, Any]:
    trace = trace_literature_queries(papers, build_idea_literature_queries(idea, state, papers), {"perQueryLimit": per_query_limit, "limit": limit, "strategy": strategy})
    top_hits = trace["mergedHits"][:3]
    direct_overlap = top_hits[0]["score"] if top_hits else 0
    crowdedness = _average([hit["score"] for hit in top_hits])
    breadth = _average([hit["breadth"] for hit in top_hits])
    distinct_paper_count = trace["uniquePaperCount"]
    linked_paper_ids = set(idea.get("origin", {}).get("sourcePaperIds") or [])
    anchor_alignment = 1 if any(hit["paper"]["id"] in linked_paper_ids for hit in top_hits) else 0
    grounding = min(1.0, 0.45 * breadth + 0.35 * min(1.0, distinct_paper_count / 4) + 0.2 * anchor_alignment)
    return {
        "queries": [{"label": query["label"], "query": query["query"], "topPaperIds": [hit["paper"]["id"] for hit in query["hits"][:3]]} for query in trace["queries"]],
        "mergedHits": trace["mergedHits"],
        "directOverlap": round(direct_overlap, 3),
        "crowdedness": round(crowdedness, 3),
        "breadth": round(breadth, 3),
        "distinctPaperCount": distinct_paper_count,
        "grounding": round(grounding, 3),
        "nearestPaper": top_hits[0]["paper"] if top_hits else None,
        "nearestPaperId": top_hits[0]["paper"]["id"] if top_hits else None,
    }


def critique_ideas(ideas: list[dict[str, Any]], state: dict[str, Any], papers: dict[str, Any], literature_map: dict[str, Any], reference_ideas: list[dict[str, Any]] | None = None, strategy: str = "hybrid") -> list[dict[str, Any]]:
    reference_ideas = reference_ideas or []
    critiqued = []
    for idea in ideas:
        flags = []
        penalty = 0.0
        if not idea.get("origin", {}).get("personaId"):
            flags.append("missing_persona_origin")
            penalty += 0.08
        if not idea.get("origin", {}).get("noveltyAngle"):
            flags.append("weak_brainstorm_signal")
            penalty += 0.08
        if not idea.get("contrast", {}).get("comparison") or "core subgroups" in idea.get("contrast", {}).get("comparison", ""):
            flags.append("weak_contrast")
            penalty += 0.12
        nearest_sibling_similarity = max([idea_similarity(candidate, idea) for candidate in ideas if candidate["id"] != idea["id"]], default=0)
        if nearest_sibling_similarity >= 0.84:
            flags.append("near_duplicate_cluster")
            penalty += 0.14
        literature_trace = idea.get("literatureTrace") or probe_idea_literature(idea, papers, state, strategy=strategy)
        if literature_trace["crowdedness"] >= 0.34:
            flags.append("crowded_literature")
            penalty += 0.16
        if literature_trace["grounding"] <= 0.34 or literature_trace["distinctPaperCount"] < 2:
            flags.append("thin_literature_bridge")
            penalty += 0.10
        if literature_trace["breadth"] <= 0.18:
            flags.append("single_anchor_dependence")
            penalty += 0.06
        parent_idea = next((candidate for candidate in reference_ideas if candidate["id"] == idea.get("origin", {}).get("parentIdeaId")), None)
        if parent_idea and idea_similarity(idea, parent_idea) >= 0.88:
            flags.append("mutation_too_close_to_parent")
            penalty += 0.10
        critiqued.append(
            {
                **idea,
                "literatureTrace": literature_trace,
                "critique": {
                    "flags": flags,
                    "penalty": round(min(0.5, penalty), 3),
                    "summary": "No major template warning detected." if not flags else f"Main critique: {', '.join(flags)}.",
                    "nearestPaperId": literature_trace.get("nearestPaperId"),
                    "literatureBreadth": literature_trace.get("breadth"),
                },
            }
        )
    return critiqued


EVIDENCE_FEASIBILITY = {
    "observational_data": 0.82,
    "survey": 0.78,
    "archive": 0.74,
    "text_corpus": 0.76,
    "administrative_data": 0.8,
    "interviews": 0.67,
    "case_study": 0.7,
    "experiment": 0.62,
    "quasi_experiment": 0.58,
    "field_trial": 0.55,
    "sensor_data": 0.68,
    "prototype": 0.6,
    "simulation": 0.72,
}


def score_idea(idea: dict[str, Any], state: dict[str, Any], papers: dict[str, Any], visited_ideas: list[dict[str, Any]], accepted_ideas: list[dict[str, Any]], rejected_ideas: list[dict[str, Any]], feedback_strategy: dict[str, Any]) -> dict[str, Any]:
    accepted_ids = {candidate["id"] for candidate in accepted_ideas if candidate.get("id")}
    rejected_families = set(feedback_strategy.get("rejectedFamilies", []))
    rejected_comparisons = set(feedback_strategy.get("rejectedComparisons", []))
    rejected_evidence = set(feedback_strategy.get("rejectedEvidenceKinds", []))
    diversity_pool = [candidate for candidate in visited_ideas if candidate.get("id") not in accepted_ids]
    prior_families = {candidate.get("familyId") for candidate in visited_ideas if candidate.get("familyId")}
    max_visited_similarity = max((idea_similarity(candidate, idea) for candidate in diversity_pool), default=0)
    accepted_alignment = max((idea_similarity(candidate, idea) for candidate in accepted_ideas), default=0)
    rejected_alignment = max((idea_similarity(candidate, idea) for candidate in rejected_ideas), default=0)
    literature_trace = idea.get("literatureTrace") or probe_idea_literature(idea, papers, state)
    keyword_tokens = set(tokenize(" ".join(state.get("constraints", {}).get("keywords", []))))
    idea_tokens = set(tokenize(idea_to_match_text(idea)))
    keyword_hits = len([token for token in keyword_tokens if token in idea_tokens])
    novelty = round(1 - literature_trace["crowdedness"], 3)
    diversity = round(1 - max_visited_similarity, 3)
    feasibility_base = EVIDENCE_FEASIBILITY.get(idea["evidence"]["kind"], 0.65)
    scope_bonus = _average([1 if value and not str(value).startswith("unspecified") else 0 for value in [idea["scope"]["population"], idea["scope"]["place"], idea["scope"]["time"], idea["scope"]["scale"]]])
    feasibility = round((0.85 * feasibility_base + 0.15 * scope_bonus) if feedback_strategy.get("avoidOverNarrowing") else (0.7 * feasibility_base + 0.3 * scope_bonus), 3)
    user_fit = round(0.75 if not keyword_tokens else min(1.0, keyword_hits / max(len(keyword_tokens), 1)), 3)
    creativity = round(
        min(
            1.0,
            (0.22 if idea.get("origin", {}).get("sourcePaperIds") else 0.1)
            + (0.18 if idea.get("origin", {}).get("noveltyAngle") else 0.05)
            + (0.16 if idea.get("familyId") not in prior_families else 0.06)
            + (0.16 if idea.get("round") == "mutation" else 0.08)
            + (0.16 if literature_trace["breadth"] >= 0.35 else 0.06)
            + (0.04 if "weak_contrast" in idea.get("critique", {}).get("flags", []) else 0.12),
        ),
        3,
    )
    grounding = literature_trace["grounding"]
    critique_penalty = idea.get("critique", {}).get("penalty", 0)
    lateral_escape = round(((1 - rejected_alignment) * (1 if idea.get("familyId") not in prior_families else 0.7)) if feedback_strategy.get("expandLaterally") else 0, 3)
    rejected_lane_penalty = round(((0.12 if idea.get("familyId") in rejected_families else 0) + (0.12 if idea.get("contrast", {}).get("comparison") in rejected_comparisons else 0) + (0.06 if idea.get("evidence", {}).get("kind") in rejected_evidence else 0)) if feedback_strategy.get("expandLaterally") else 0, 3)
    novelty_weight, diversity_weight = (0.24, 0.24) if feedback_strategy.get("expandLaterally") else (0.22, 0.18)
    feasibility_weight = 0.10 if feedback_strategy.get("avoidOverNarrowing") else 0.15
    user_fit_weight = 0.10 if feedback_strategy.get("expandLaterally") else 0.12
    creativity_weight = 0.18 if feedback_strategy.get("expandLaterally") else 0.15
    grounding_weight = 0.09 if feedback_strategy.get("expandLaterally") else 0.10
    accepted_alignment_weight = 0.04 if feedback_strategy.get("expandLaterally") else 0.11
    rejected_alignment_weight = 0.22 if feedback_strategy.get("expandLaterally") else 0.16
    lateral_escape_weight = 0.11 if feedback_strategy.get("expandLaterally") else 0
    total = round(
        novelty_weight * novelty
        + diversity_weight * diversity
        + feasibility_weight * feasibility
        + user_fit_weight * user_fit
        + creativity_weight * creativity
        + grounding_weight * grounding
        + accepted_alignment_weight * accepted_alignment
        + lateral_escape_weight * lateral_escape
        - rejected_alignment_weight * rejected_alignment
        - rejected_lane_penalty
        - critique_penalty,
        3,
    )
    return {
        "novelty": novelty,
        "diversity": diversity,
        "feasibility": feasibility,
        "userFit": user_fit,
        "creativity": creativity,
        "grounding": grounding,
        "acceptedAlignment": round(accepted_alignment, 3),
        "rejectedAlignment": round(rejected_alignment, 3),
        "lateralEscape": lateral_escape,
        "rejectedLanePenalty": rejected_lane_penalty,
        "critiquePenalty": critique_penalty,
        "total": total,
        "nearestPaperId": literature_trace.get("nearestPaperId"),
        "literatureBreadth": literature_trace.get("breadth"),
        "literatureCrowdedness": literature_trace.get("crowdedness"),
    }


def rank_ideas(ideas: list[dict[str, Any]], state: dict[str, Any], papers: dict[str, Any], visited_ideas: list[dict[str, Any]], accepted_ideas: list[dict[str, Any]], rejected_ideas: list[dict[str, Any]], feedback_strategy: dict[str, Any]) -> list[dict[str, Any]]:
    ranked = [{**idea, "scores": score_idea(idea, state, papers, visited_ideas, accepted_ideas, rejected_ideas, feedback_strategy)} for idea in ideas]
    return sorted(ranked, key=lambda item: item["scores"]["total"], reverse=True)


def select_frontier_ideas(ranked_ideas: list[dict[str, Any]], limit: int = 6) -> list[dict[str, Any]]:
    selected = []
    used_families = set()
    used_contrasts = set()
    used_titles = set()
    while len(selected) < limit:
        candidates = [
            lambda idea: idea["id"] not in {candidate["id"] for candidate in selected} and idea.get("familyId", idea["id"]) not in used_families and idea["contrast"]["comparison"] not in used_contrasts and idea["title"] not in used_titles,
            lambda idea: idea["id"] not in {candidate["id"] for candidate in selected} and idea.get("familyId", idea["id"]) not in used_families and idea["title"] not in used_titles,
            lambda idea: idea["id"] not in {candidate["id"] for candidate in selected} and idea["contrast"]["comparison"] not in used_contrasts and idea["title"] not in used_titles,
            lambda idea: idea["id"] not in {candidate["id"] for candidate in selected} and idea["title"] not in used_titles,
            lambda idea: idea["id"] not in {candidate["id"] for candidate in selected},
        ]
        next_idea = None
        for predicate in candidates:
            next_idea = next((idea for idea in ranked_ideas if predicate(idea)), None)
            if next_idea:
                break
        if not next_idea:
            break
        selected.append(next_idea)
        used_families.add(next_idea.get("familyId", next_idea["id"]))
        used_contrasts.add(next_idea["contrast"]["comparison"])
        used_titles.add(next_idea["title"])
    return selected


PUZZLE_MUTATIONS = {
    "blind_spot": ["distortion", "boundary_unknown"],
    "conflict": ["mechanism_unknown", "boundary_unknown"],
    "distortion": ["boundary_unknown", "conflict"],
    "mechanism_unknown": ["conflict", "leverage_unknown"],
    "boundary_unknown": ["distortion", "mechanism_unknown"],
    "leverage_unknown": ["mechanism_unknown", "boundary_unknown"],
}

CLAIM_MUTATIONS = {
    "describe": ["measure", "compare"],
    "measure": ["compare", "critique"],
    "compare": ["identify", "explain"],
    "explain": ["identify", "compare"],
    "identify": ["explain", "intervene"],
    "predict": ["compare", "identify"],
    "intervene": ["design", "identify"],
    "design": ["intervene", "compare"],
    "critique": ["measure", "compare"],
}

EVIDENCE_HINT_PATTERNS = [
    (re.compile(r"(survey|questionnaire|respondent)", flags=re.I), "survey"),
    (re.compile(r"(administrative|registry|record|claims data|institutional)", flags=re.I), "administrative_data"),
    (re.compile(r"(interview|ethnograph|fieldnote|process tracing)", flags=re.I), "interviews"),
    (re.compile(r"(archive|historical|policy document)", flags=re.I), "archive"),
    (re.compile(r"(sensor|satellite|remote sensing|mobility)", flags=re.I), "sensor_data"),
    (re.compile(r"(experiment|randomized|lab study)", flags=re.I), "experiment"),
    (re.compile(r"(trial|pilot|field test|rollout)", flags=re.I), "field_trial"),
    (re.compile(r"(simulation|agent based|scenario model)", flags=re.I), "simulation"),
    (re.compile(r"(prototype|tool|interface|workflow)", flags=re.I), "prototype"),
    (re.compile(r"(text|corpus|transcript|discourse|language)", flags=re.I), "text_corpus"),
]


def build_mutation_round(frontier: list[dict[str, Any]], state: dict[str, Any], papers: dict[str, Any], feedback_strategy: dict[str, Any], strategy: str = "hybrid", per_query_limit: int = 4, limit: int = 6, idea_limit: int = 4) -> dict[str, Any]:
    paper_list = papers.get("papers") if isinstance(papers, dict) else papers
    paper_map = {paper["id"]: paper for paper in paper_list}
    rejected_evidence_kinds = set(feedback_strategy.get("rejectedEvidenceKinds", []))
    target_ideas = sorted(frontier, key=lambda item: (item.get("scores", {}).get("rejectedAlignment", 0), -(item.get("scores", {}).get("diversity", 0))))[:idea_limit]
    seeds = []
    traces = []
    for idea_index, idea in enumerate(target_ideas):
        anchor_paper = paper_map.get(idea.get("scores", {}).get("nearestPaperId")) or paper_map.get(idea.get("critique", {}).get("nearestPaperId")) or paper_map.get((idea.get("origin", {}).get("sourcePaperIds") or [None])[0])
        rejected_comparisons = set(feedback_strategy.get("rejectedComparisons", []))
        lateral_contrast = next((contrast for contrast in state.get("contrasts", []) if contrast.get("comparison") and contrast["comparison"] != idea["contrast"]["comparison"] and contrast["comparison"] not in rejected_comparisons), None)
        queries = [
            {"label": "family contrast", "query": f"{idea['object']} {idea['contrast']['comparison']}", "weight": 1.3},
            {"label": "family puzzle", "query": f"{idea['object']} {idea['puzzle']['label']} {idea['claim']['label']}", "weight": 1.15},
        ]
        if feedback_strategy.get("expandLaterally") and lateral_contrast:
            queries.insert(0, {"label": "lateral contrast", "query": f"{idea['object']} {lateral_contrast['comparison']}", "weight": 1.34})
        keywords = state.get("constraints", {}).get("keywords", [])
        if keywords:
            queries.append({"label": "family keywords", "query": f"{idea['object']} {' '.join(keywords[:3])}", "weight": 0.95})
        if anchor_paper and anchor_paper.get("keywords"):
            queries.append({"label": "adjacent literature", "query": f"{idea['object']} {' '.join(anchor_paper['keywords'][:3])}", "weight": 0.9})
        queries.append({"label": "evidence probe", "query": f"{idea['object']} {idea['evidence']['kind'].replace('_', ' ')}", "weight": 0.8})
        if feedback_strategy.get("expandLaterally"):
            queries.append({"label": "lateral reset", "query": f"{idea['object']} heterogeneity mechanism alternative explanation", "weight": 0.98})
        trace = trace_literature_queries(papers, queries, {"perQueryLimit": per_query_limit, "limit": limit, "strategy": strategy})
        source_paper_ids = [hit["paper"]["id"] for hit in trace["mergedHits"][:3]]
        focus_terms = unique(
            [
                term
                for hit in trace["mergedHits"]
                for term in [*(hit["paper"].get("keywords", [])), *tokenize(hit["paper"]["title"])]
                if len(str(term or "")) > 3
            ]
        )[:4]
        evidence_hints = unique(
            [
                idea["evidence"]["kind"],
                *(state.get("constraints", {}).get("evidenceKinds", [])),
                *[
                    kind
                    for hit in trace["mergedHits"]
                    for pattern, kind in EVIDENCE_HINT_PATTERNS
                    if pattern.search(" ".join([hit["paper"]["title"], hit["paper"].get("abstract", ""), *hit["paper"].get("keywords", [])]))
                ],
            ]
        )[:4]
        ordered_evidence_hints = unique([*[kind for kind in evidence_hints if kind not in rejected_evidence_kinds], *[kind for kind in evidence_hints if kind in rejected_evidence_kinds]])[:4] if feedback_strategy.get("expandLaterally") else evidence_hints
        alternatives = sorted([contrast for contrast in state.get("contrasts", []) if contrast["comparison"] != idea["contrast"]["comparison"]], key=lambda contrast: 1 if contrast["comparison"] in rejected_comparisons else 0)
        mutation_contrast = alternatives[idea_index % max(len(alternatives), 1)] if alternatives else idea["contrast"]
        anchor_title = trace["mergedHits"][0]["paper"]["title"] if trace["mergedHits"] else idea["title"]
        persona = {"id": idea.get("origin", {}).get("personaId") or "literature_mutation", "label": idea.get("origin", {}).get("personaLabel") or "Literature Mutation"}
        suggested_puzzles = unique([idea["puzzle"]["id"], *(PUZZLE_MUTATIONS.get(idea["puzzle"]["id"], []))])
        suggested_claims = unique([idea["claim"]["id"], *(CLAIM_MUTATIONS.get(idea["claim"]["id"], []))])
        traces.append({"ideaId": idea["id"], "familyId": idea.get("familyId"), "queries": [{"label": query["label"], "query": query["query"], "topPaperIds": [hit["paper"]["id"] for hit in query["hits"][:3]]} for query in trace["queries"]], "topPaperIds": source_paper_ids})

        def dedupe_contrasts(contrasts: list[dict[str, Any]]) -> list[dict[str, Any]]:
            seen = set()
            output = []
            for contrast in contrasts:
                key = f"{contrast.get('axis', 'comparison')}|{contrast.get('comparison', '')}"
                if key in seen:
                    continue
                seen.add(key)
                output.append(contrast)
            return output

        seeds.append(
            create_brainstorm_seed(
                {
                    "persona": persona,
                    "object": idea["object"],
                    "hook": f'A second-pass search around "{anchor_title}" suggests the live disagreement may sit in {mutation_contrast["comparison"]}, not only {idea["contrast"]["comparison"]}.',
                    "pivot": "branch the first-pass family by following adjacent literature rather than polishing the original framing",
                    "questionStem": f'What changes if {idea["object"]} is reopened through {mutation_contrast["comparison"]} rather than {idea["contrast"]["comparison"]}?',
                    "noveltyAngle": "Use a second literature pass to shift the project toward a neighboring contrast that the first round did not foreground.",
                    "suggestedPuzzles": suggested_puzzles,
                    "suggestedClaims": suggested_claims,
                    "contrastSuggestions": dedupe_contrasts([mutation_contrast, idea["contrast"], *(state.get("contrasts", []))]),
                    "evidenceHints": ordered_evidence_hints,
                    "sourcePaperIds": source_paper_ids,
                    "literatureQueries": queries,
                    "focusTerms": focus_terms,
                    "round": "mutation",
                    "stage": "mutate",
                    "parentIdeaId": idea["id"],
                    "tags": [state.get("focus", {}).get("domain"), idea.get("familyId"), "mutation_contrast"],
                }
            )
        )
        seeds.append(
            create_brainstorm_seed(
                {
                    "persona": persona,
                    "object": idea["object"],
                    "hook": f'The papers adjacent to "{anchor_title}" point to {", ".join(focus_terms) or "a different evidence base"} as the sharper way to reopen the {idea["puzzle"]["label"].lower()} question.',
                    "pivot": "change the evidence bridge and mechanism target instead of staying inside the same empirical template",
                    "questionStem": f'Which {idea["puzzle"]["label"].lower()} question about {idea["object"]} becomes newly testable once the literature around {", ".join(focus_terms) or anchor_title} is taken seriously?',
                    "noveltyAngle": "Follow the adjacent literature to mutate the evidence bridge and empirical mechanism, not just the wording of the idea.",
                    "suggestedPuzzles": unique([idea["puzzle"]["id"], "mechanism_unknown", "distortion"]),
                    "suggestedClaims": unique([idea["claim"]["id"], "explain", "measure"]),
                    "contrastSuggestions": dedupe_contrasts([idea["contrast"], mutation_contrast, *(state.get("contrasts", []))]),
                    "evidenceHints": ordered_evidence_hints,
                    "sourcePaperIds": source_paper_ids,
                    "literatureQueries": queries,
                    "focusTerms": focus_terms,
                    "round": "mutation",
                    "stage": "mutate",
                    "parentIdeaId": idea["id"],
                    "tags": [state.get("focus", {}).get("domain"), idea.get("familyId"), idea["id"], "mutation_evidence"],
                }
            )
        )
        if feedback_strategy.get("expandLaterally"):
            seeds.append(
                create_brainstorm_seed(
                    {
                        "persona": persona,
                        "object": idea["object"],
                        "hook": f'Repeated pushback suggests {idea["object"]} needs a neighboring literature pocket rather than a tighter version of the same framing.',
                        "pivot": "leave the criticized lane and reopen the topic through a different comparison, mechanism, or evidence bridge",
                        "questionStem": f'What if {idea["object"]} becomes more original only after moving away from {idea["contrast"]["comparison"]} and reopening the problem through {mutation_contrast["comparison"]}?',
                        "noveltyAngle": "Use repeated rejection as a cue to side-step into a different research family instead of shrinking the same scope.",
                        "suggestedPuzzles": unique([*(PUZZLE_MUTATIONS.get(idea["puzzle"]["id"], [])), "boundary_unknown", "distortion"]),
                        "suggestedClaims": unique([*(CLAIM_MUTATIONS.get(idea["claim"]["id"], [])), "compare", "measure"]),
                        "contrastSuggestions": dedupe_contrasts([mutation_contrast, *(state.get("contrasts", [])), idea["contrast"]]),
                        "evidenceHints": ordered_evidence_hints,
                        "sourcePaperIds": source_paper_ids,
                        "literatureQueries": queries,
                        "focusTerms": focus_terms,
                        "round": "mutation",
                        "stage": "mutate",
                        "parentIdeaId": idea["id"],
                        "tags": [state.get("focus", {}).get("domain"), idea.get("familyId"), idea["id"], "mutation_escape"],
                    }
                )
            )
    return {"seeds": seeds, "traces": traces}


def run_idea_pipeline(input_data: dict[str, Any], papers: dict[str, Any], query: str | None = None, memory_graph: dict[str, Any] | None = None, memory_scope: str = "topic", memory_topic_threshold: float | None = None, rounds: int | None = None, search_strategy: str = "hybrid", frontier_limit: int = 6) -> dict[str, Any]:
    state = create_research_state(input_data)
    memory_graph = memory_graph or create_memory_graph()
    topic_profile = build_topic_profile({**input_data, "query": query or input_data.get("query") or " ".join(input_data.get("focus", {}).get("objects", []))})
    memory_kwargs = {"scope": memory_scope, "topic_profile": topic_profile, "threshold": memory_topic_threshold}
    memory_visited_ideas = collect_visited_ideas(memory_graph, **memory_kwargs)
    memory_accepted_ideas = collect_accepted_ideas(memory_graph, **memory_kwargs)
    memory_rejected_ideas = collect_rejected_ideas(memory_graph, **memory_kwargs)
    feedback_strategy = _build_feedback_strategy(memory_accepted_ideas, memory_rejected_ideas)
    requested_rounds = int(rounds or 0)
    effective_rounds = min(2, requested_rounds) if requested_rounds >= 1 else 2 if memory_accepted_ideas or feedback_strategy["forceExtraRound"] else 1
    state["topicProfile"] = topic_profile
    state["feedbackStrategy"] = feedback_strategy
    state["visitedSignatures"] = unique([*state.get("visitedSignatures", []), *collect_visited_signatures(memory_graph, **memory_kwargs)])
    state["acceptedIdeas"] = [*state.get("acceptedIdeas", []), *memory_accepted_ideas]
    state["rejectedIdeas"] = [*state.get("rejectedIdeas", []), *memory_rejected_ideas]
    state["history"] = [*state.get("history", []), *memory_visited_ideas]

    literature_map = build_literature_map(
        state,
        papers,
        strategy=search_strategy,
        feedback_strategy=feedback_strategy,
        limit=10 if feedback_strategy["expandLaterally"] else 8,
        anchor_limit=5 if feedback_strategy["expandLaterally"] else 4,
        per_query_limit=5 if feedback_strategy["expandLaterally"] else 4,
    )
    initial_seeds = brainstorm_seeds(state, papers, feedback_strategy, literature_map, limit=42 if feedback_strategy["expandLaterally"] else 36)
    initial_raw_ideas = crystallize_seeds(initial_seeds, state, limit=96)
    initial_deduped_ideas = dedupe_ideas(initial_raw_ideas, threshold=0.72)
    initial_critiqued_ideas = critique_ideas(initial_deduped_ideas, state, papers, literature_map, strategy=search_strategy)
    initial_ranked_ideas = rank_ideas(initial_critiqued_ideas, state, papers, memory_visited_ideas, memory_accepted_ideas, memory_rejected_ideas, feedback_strategy)
    first_focus = select_frontier_ideas(initial_ranked_ideas, limit=(5 if feedback_strategy["expandLaterally"] else 4) if effective_rounds >= 2 else frontier_limit)

    mutation_round = build_mutation_round(first_focus, state, papers, feedback_strategy, strategy=search_strategy, per_query_limit=5 if feedback_strategy["expandLaterally"] else 4, limit=8 if feedback_strategy["expandLaterally"] else 6, idea_limit=len(first_focus)) if effective_rounds >= 2 else {"seeds": [], "traces": []}
    mutation_raw_ideas = crystallize_seeds(mutation_round["seeds"], state, limit=96) if effective_rounds >= 2 else []
    combined_raw_ideas = [*first_focus, *mutation_raw_ideas] if effective_rounds >= 2 else initial_raw_ideas
    deduped_ideas = dedupe_ideas(combined_raw_ideas, threshold=0.74) if effective_rounds >= 2 else initial_deduped_ideas
    critiqued_ideas = critique_ideas(deduped_ideas, state, papers, literature_map, reference_ideas=first_focus, strategy=search_strategy) if effective_rounds >= 2 else initial_critiqued_ideas
    ranked_ideas = rank_ideas(critiqued_ideas, state, papers, memory_visited_ideas, memory_accepted_ideas, memory_rejected_ideas, feedback_strategy) if effective_rounds >= 2 else initial_ranked_ideas
    frontier = select_frontier_ideas(ranked_ideas, limit=frontier_limit) if effective_rounds >= 2 else first_focus
    state["frontier"] = [idea["id"] for idea in frontier]
    all_brainstorm_seeds = [*initial_seeds, *mutation_round["seeds"]]
    record_pipeline_run(
        memory_graph,
        {
            "query": query,
            "state": state,
            "feedbackStrategy": feedback_strategy,
            "topicProfile": topic_profile,
            "rankedIdeas": ranked_ideas,
            "frontier": frontier,
            "paperIndex": papers,
            "literatureMap": literature_map,
            "stages": {
                "initial": {"queryCount": literature_map["queryCount"], "seedCount": len(initial_seeds), "rankedCount": len(initial_ranked_ideas)},
                "firstFocus": {"ideaIds": [idea["id"] for idea in first_focus]},
                "mutation": {"seedCount": len(mutation_round["seeds"]), "traceCount": len(mutation_round["traces"])} if effective_rounds >= 2 else None,
                "final": {"rankedCount": len(ranked_ideas)},
                "rounds": effective_rounds,
            },
        },
    )
    return {
        "state": state,
        "feedbackStrategy": feedback_strategy,
        "topicProfile": topic_profile,
        "memoryScope": memory_scope,
        "literatureMap": literature_map,
        "effectiveRounds": effective_rounds,
        "rounds": {
            "initial": {"brainstormSeeds": initial_seeds, "rawIdeas": initial_raw_ideas, "dedupedIdeas": initial_deduped_ideas, "rankedIdeas": initial_ranked_ideas},
            "firstFocus": {"frontier": first_focus},
            "mutation": mutation_round,
            "final": {"rankedIdeas": ranked_ideas},
        },
        "brainstormSeeds": all_brainstorm_seeds,
        "rawIdeas": combined_raw_ideas,
        "dedupedIdeas": deduped_ideas,
        "rankedIdeas": ranked_ideas,
        "frontier": frontier,
        "memoryGraph": memory_graph,
    }
