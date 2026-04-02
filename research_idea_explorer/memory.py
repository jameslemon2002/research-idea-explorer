"""Persistent memory graph, store, and views."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .preferences import create_preference_profile, has_preference_signal, merge_preference_profiles, summarize_preference_profile
from .presentation import build_idea_card_view
from .schema import build_idea_signature, build_topic_profile, same_topic, unique
from .similarity import idea_similarity


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _edge_id(source: str, target: str, relation: str) -> str:
    return f"{source}|{relation}|{target}"


def create_memory_graph(input_data: dict[str, Any] | None = None) -> dict[str, Any]:
    input_data = input_data or {}
    return {
        "version": 1,
        "createdAt": input_data.get("createdAt") or _now_iso(),
        "updatedAt": input_data.get("updatedAt") or _now_iso(),
        "nodes": input_data.get("nodes", {}),
        "edges": input_data.get("edges", []),
        "stats": input_data.get("stats", {"runs": 0}),
        "preferenceProfiles": _normalize_preference_store(input_data.get("preferenceProfiles")),
    }


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _payload_dict(node: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(node, dict):
        return {}
    return _as_dict(node.get("payload"))


def _normalize_preference_store(value: Any) -> dict[str, Any]:
    value = value if isinstance(value, dict) else {}
    topics = value.get("topics", [])
    return {
        "global": create_preference_profile(value.get("global")),
        "topics": [create_preference_profile(item) for item in topics if isinstance(item, dict)],
    }


def _preference_store(graph: dict[str, Any]) -> dict[str, Any]:
    store = graph.get("preferenceProfiles")
    if not isinstance(store, dict):
        store = _normalize_preference_store(None)
        graph["preferenceProfiles"] = store
    else:
        store = _normalize_preference_store(store)
        graph["preferenceProfiles"] = store
    return store


def _upsert_node(graph: dict[str, Any], node: dict[str, Any]) -> dict[str, Any]:
    existing = graph["nodes"].get(node["id"])
    graph["nodes"][node["id"]] = (
        {**existing, **node, "updatedAt": _now_iso()}
        if existing
        else {**node, "createdAt": _now_iso(), "updatedAt": _now_iso()}
    )
    graph["updatedAt"] = _now_iso()
    return graph["nodes"][node["id"]]


def _upsert_edge(graph: dict[str, Any], edge: dict[str, Any]) -> None:
    edge_id = _edge_id(edge["source"], edge["target"], edge["relation"])
    next_edge = {"id": edge_id, "weight": 1, "createdAt": _now_iso(), "updatedAt": _now_iso(), **edge}
    for index, existing in enumerate(graph["edges"]):
        if existing["id"] == edge_id:
            graph["edges"][index] = {**existing, **next_edge, "updatedAt": _now_iso()}
            break
    else:
        graph["edges"].append(next_edge)


def _query_node_id(query: str) -> str:
    return f"query:{str(query or '').lower().strip()}"


def _persona_node_id(persona_id: str) -> str:
    return f"persona:{persona_id}"


def _idea_node_id(idea_id: str) -> str:
    return f"idea:{idea_id}"


def _paper_node_id(paper_id: str) -> str:
    return f"paper:{paper_id}"


def add_paper_node(graph: dict[str, Any], paper: dict[str, Any]) -> dict[str, Any]:
    return _upsert_node(graph, {"id": _paper_node_id(paper["id"]), "kind": "paper", "label": paper["title"], "payload": paper, "signature": paper["id"]})


def add_idea_node(graph: dict[str, Any], idea: dict[str, Any], status: str = "candidate") -> dict[str, Any]:
    node_id = _idea_node_id(idea["id"])
    existing = graph["nodes"].get(node_id, {})
    payload = _payload_dict(existing)
    persisted_decision = _as_dict(payload.get("feedback")).get("decision")
    preserved_status = persisted_decision or (existing.get("status") if existing.get("status") in {"accepted", "rejected"} else None)
    next_status = preserved_status or status
    return _upsert_node(
        graph,
        {
            "id": node_id,
            "kind": "idea",
            "label": _as_dict(idea.get("cardView")).get("title") or idea["title"],
            "payload": {**payload, **idea, "topicProfile": build_topic_profile(idea.get("topicProfile") or idea), "feedback": _as_dict(idea.get("feedback")) or _as_dict(payload.get("feedback"))},
            "signature": idea.get("signature") or build_idea_signature(idea),
            "status": next_status,
        },
    )


def add_persona_node(graph: dict[str, Any], persona_id: str, persona_label: str | None = None) -> dict[str, Any]:
    return _upsert_node(
        graph,
        {
            "id": _persona_node_id(persona_id),
            "kind": "persona",
            "label": persona_label or persona_id,
            "payload": {"personaId": persona_id, "personaLabel": persona_label or persona_id},
            "signature": persona_id,
        },
    )


def add_query_node(graph: dict[str, Any], query: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = payload or {}
    return _upsert_node(
        graph,
        {
            "id": _query_node_id(query),
            "kind": "query",
            "label": query,
            "payload": {"query": query, **payload, "topicProfile": build_topic_profile(payload.get("topicProfile") or {"query": query})},
            "signature": query,
        },
    )


def _matches_topic_scope(node: dict[str, Any], scope: str = "global", topic_profile: dict[str, Any] | None = None, threshold: float | None = None) -> bool:
    if scope == "global" or not topic_profile:
        return True
    payload = _payload_dict(node)
    if node.get("kind") != "idea" or not payload:
        return False
    candidate_profile = build_topic_profile(
        payload.get("topicProfile") or {"object": payload.get("object"), "keywords": _as_dict(payload.get("origin")).get("focusTerms") or []}
    )
    return same_topic(candidate_profile, topic_profile, threshold=threshold or 0.26)


def collect_visited_ideas(graph: dict[str, Any], scope: str = "global", topic_profile: dict[str, Any] | None = None, threshold: float | None = None) -> list[dict[str, Any]]:
    return [_payload_dict(node) for node in graph.get("nodes", {}).values() if node.get("kind") == "idea" and _payload_dict(node) and _matches_topic_scope(node, scope=scope, topic_profile=topic_profile, threshold=threshold)]


def _collect_ideas_by_decision(graph: dict[str, Any], decision: str, scope: str = "global", topic_profile: dict[str, Any] | None = None, threshold: float | None = None) -> list[dict[str, Any]]:
    results = []
    for node in graph.get("nodes", {}).values():
        payload = _payload_dict(node)
        if node.get("kind") != "idea" or not payload:
            continue
        if not _matches_topic_scope(node, scope=scope, topic_profile=topic_profile, threshold=threshold):
            continue
        if _as_dict(payload.get("feedback")).get("decision") == decision or node.get("status") == decision:
            results.append(payload)
    return results


def collect_idea_nodes(graph: dict[str, Any]) -> list[dict[str, Any]]:
    return [node for node in graph.get("nodes", {}).values() if node.get("kind") == "idea"]


def collect_accepted_ideas(graph: dict[str, Any], scope: str = "global", topic_profile: dict[str, Any] | None = None, threshold: float | None = None) -> list[dict[str, Any]]:
    return _collect_ideas_by_decision(graph, "accepted", scope=scope, topic_profile=topic_profile, threshold=threshold)


def collect_rejected_ideas(graph: dict[str, Any], scope: str = "global", topic_profile: dict[str, Any] | None = None, threshold: float | None = None) -> list[dict[str, Any]]:
    return _collect_ideas_by_decision(graph, "rejected", scope=scope, topic_profile=topic_profile, threshold=threshold)


def collect_visited_signatures(graph: dict[str, Any], scope: str = "global", topic_profile: dict[str, Any] | None = None, threshold: float | None = None) -> list[str]:
    return unique(
        [
            node["signature"]
            for node in graph.get("nodes", {}).values()
            if node.get("kind") == "idea" and node.get("signature") and _matches_topic_scope(node, scope=scope, topic_profile=topic_profile, threshold=threshold)
        ]
    )


def record_idea_decision(graph: dict[str, Any], idea_id: str, decision: str, note: str = "", source: str = "user") -> dict[str, Any] | None:
    node = graph.get("nodes", {}).get(_idea_node_id(idea_id))
    if not node:
        return None
    decision_payload = {"decision": decision, "note": note, "source": source, "decidedAt": _now_iso()}
    node["status"] = decision
    node["payload"] = {**_payload_dict(node), "feedback": decision_payload}
    node["decisionHistory"] = [*(node.get("decisionHistory") or []), decision_payload]
    node["updatedAt"] = _now_iso()
    graph["updatedAt"] = _now_iso()
    return node


def get_preference_profile(graph: dict[str, Any], scope: str = "topic", topic_profile: dict[str, Any] | None = None, threshold: float | None = None) -> dict[str, Any]:
    store = _preference_store(graph)
    profiles = [store.get("global")]
    if scope != "global" and topic_profile:
        profiles.extend(
            [
                profile
                for profile in store.get("topics", [])
                if profile.get("topicProfile") and same_topic(profile["topicProfile"], topic_profile, threshold=threshold or 0.26)
            ]
        )
    return merge_preference_profiles(*profiles)


def remember_preference_profile(graph: dict[str, Any], profile: dict[str, Any], scope: str = "topic", topic_profile: dict[str, Any] | None = None, threshold: float | None = None) -> dict[str, Any]:
    if not has_preference_signal(profile):
        return get_preference_profile(graph, scope=scope, topic_profile=topic_profile, threshold=threshold)
    store = _preference_store(graph)
    stamped = create_preference_profile({**profile, "topicProfile": topic_profile, "updatedAt": _now_iso()})
    if scope == "global":
        store["global"] = merge_preference_profiles(store.get("global"), stamped)
    else:
        matched_index = next(
            (
                index
                for index, existing in enumerate(store.get("topics", []))
                if existing.get("topicProfile") and topic_profile and same_topic(existing["topicProfile"], topic_profile, threshold=threshold or 0.26)
            ),
            None,
        )
        if matched_index is None:
            store["topics"].append(stamped)
        else:
            store["topics"][matched_index] = merge_preference_profiles(store["topics"][matched_index], stamped)
    graph["preferenceProfiles"] = store
    graph["updatedAt"] = _now_iso()
    return get_preference_profile(graph, scope=scope, topic_profile=topic_profile, threshold=threshold)


def list_preference_profiles(graph: dict[str, Any]) -> dict[str, Any]:
    store = _preference_store(graph)
    return {
        "global": store.get("global"),
        "topics": store.get("topics", []),
    }


def record_pipeline_run(graph: dict[str, Any], payload: dict[str, Any], paper_limit: int = 20, idea_limit: int = 20, similarity_threshold: float = 0.76) -> dict[str, Any]:
    query = payload.get("query") or " ".join(payload.get("state", {}).get("focus", {}).get("objects", [])) or payload.get("state", {}).get("focus", {}).get("domain") or "query"
    query_node = add_query_node(
        graph,
        query,
        {
            "topicProfile": payload.get("topicProfile"),
            "feedbackStrategy": {
                "mode": payload.get("feedbackStrategy", {}).get("mode"),
                "acceptedCount": payload.get("feedbackStrategy", {}).get("acceptedCount"),
                "rejectedCount": payload.get("feedbackStrategy", {}).get("rejectedCount"),
            }
            if payload.get("feedbackStrategy")
            else None,
            "literatureMap": {
                "strategy": payload.get("literatureMap", {}).get("strategy"),
                "queryCount": payload.get("literatureMap", {}).get("queryCount"),
                "uniquePaperCount": payload.get("literatureMap", {}).get("uniquePaperCount"),
                "neighborhoods": [{"anchorPaperId": item.get("anchorPaperId"), "focusTerms": item.get("focusTerms")} for item in payload.get("literatureMap", {}).get("neighborhoods", [])],
            }
            if payload.get("literatureMap")
            else None,
            "stages": payload.get("stages"),
        },
    )
    papers = payload.get("paperIndex", {}).get("papers") if isinstance(payload.get("paperIndex"), dict) else payload.get("papers") or payload.get("paperIndex") or []
    paper_map = {paper["id"]: paper for paper in papers}
    ranked_ideas = payload.get("rankedIdeas", [])
    frontier_ids = {idea["id"] for idea in payload.get("frontier", [])}

    for paper in papers[:paper_limit]:
        paper_node = add_paper_node(graph, paper)
        _upsert_edge(graph, {"source": query_node["id"], "target": paper_node["id"], "relation": "retrieved"})

    for idea in ranked_ideas[:idea_limit]:
        idea_with_card_view = {**idea, "topicProfile": payload.get("topicProfile"), "cardView": build_idea_card_view(idea, {"paperMap": paper_map, "papers": papers})}
        idea_node = add_idea_node(graph, idea_with_card_view, "frontier" if idea["id"] in frontier_ids else "candidate")
        _upsert_edge(graph, {"source": query_node["id"], "target": idea_node["id"], "relation": "generated"})
        if idea.get("origin", {}).get("personaId"):
            persona_node = add_persona_node(graph, idea["origin"]["personaId"], idea["origin"].get("personaLabel"))
            _upsert_edge(graph, {"source": persona_node["id"], "target": idea_node["id"], "relation": "proposed"})
        linked_paper_ids = [paper_id for paper_id in unique([idea_with_card_view.get("scores", {}).get("nearestPaperId"), *(idea_with_card_view.get("origin", {}).get("sourcePaperIds") or [])]) if paper_id]
        for linked_paper_id in linked_paper_ids:
            paper = paper_map.get(linked_paper_id)
            if not paper:
                continue
            paper_node = add_paper_node(graph, paper)
            _upsert_edge(graph, {"source": idea_node["id"], "target": paper_node["id"], "relation": "nearest_literature"})

    ideas = ranked_ideas[:idea_limit]
    for left_index in range(len(ideas)):
        for right_index in range(left_index + 1, len(ideas)):
            similarity = idea_similarity(ideas[left_index], ideas[right_index])
            if similarity < similarity_threshold:
                continue
            _upsert_edge(
                graph,
                {
                    "source": _idea_node_id(ideas[left_index]["id"]),
                    "target": _idea_node_id(ideas[right_index]["id"]),
                    "relation": "similar_to",
                    "weight": round(similarity, 3),
                },
            )

    graph["stats"]["runs"] = int(graph.get("stats", {}).get("runs", 0)) + 1
    graph["updatedAt"] = _now_iso()
    return graph


def load_memory_graph(file_path: str) -> dict[str, Any]:
    path = Path(file_path)
    if not path.exists():
        return create_memory_graph()
    return create_memory_graph(json.loads(path.read_text(encoding="utf-8")))


def save_memory_graph(file_path: str, graph: dict[str, Any]) -> str:
    path = Path(file_path).expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(graph, indent=2), encoding="utf-8")
    return str(path)


def _by_updated_desc(left: dict[str, Any], right: dict[str, Any]) -> int:
    left_value = left.get("updatedAt", "")
    right_value = right.get("updatedAt", "")
    return -1 if right_value > left_value else 1 if right_value < left_value else 0


def _count_by(items: list[dict[str, Any]], selector) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in items:
        key = selector(item)
        counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items(), key=lambda item: item[0]))


def summarize_memory_graph(graph: dict[str, Any]) -> dict[str, Any]:
    nodes = list(graph.get("nodes", {}).values())
    ideas = [node for node in nodes if node.get("kind") == "idea"]
    latest_query = next(iter(sorted((node for node in nodes if node.get("kind") == "query"), key=lambda item: item.get("updatedAt", ""), reverse=True)), None)
    preference_profiles = list_preference_profiles(graph)
    return {
        "version": graph.get("version"),
        "runs": graph.get("stats", {}).get("runs", 0),
        "updatedAt": graph.get("updatedAt"),
        "latestQuery": latest_query.get("label") if latest_query else None,
        "nodeCount": len(nodes),
        "edgeCount": len(graph.get("edges", [])),
        "nodeKinds": _count_by(nodes, lambda node: node.get("kind", "unknown")),
        "edgeRelations": _count_by(graph.get("edges", []), lambda edge: edge.get("relation", "unknown")),
        "ideaStatuses": _count_by(ideas, lambda node: node.get("status", "candidate")),
        "feedbackDecisions": _count_by([node for node in ideas if _as_dict(_payload_dict(node).get("feedback")).get("decision")], lambda node: _as_dict(_payload_dict(node).get("feedback"))["decision"]),
        "preferenceProfiles": {"global": 1 if has_preference_signal(preference_profiles.get("global")) else 0, "topic": len([profile for profile in preference_profiles.get("topics", []) if has_preference_signal(profile)])},
    }


def list_graph_ideas(graph: dict[str, Any], limit: int = 12) -> list[dict[str, Any]]:
    ideas = sorted((node for node in graph.get("nodes", {}).values() if node.get("kind") == "idea"), key=lambda item: item.get("updatedAt", ""), reverse=True)
    return [
        {
            "id": _payload_dict(node).get("id") or node["id"].removeprefix("idea:"),
            "nodeId": node["id"],
            "title": _as_dict(_payload_dict(node).get("cardView")).get("title") or node.get("label"),
            "abstract": _as_dict(_payload_dict(node).get("cardView")).get("abstract"),
            "status": node.get("status", "candidate"),
            "nearestLiterature": _as_dict(_payload_dict(node).get("scores")).get("nearestPaperId") or _as_dict(_payload_dict(node).get("critique")).get("nearestPaperId"),
            "feedback": _as_dict(_payload_dict(node).get("feedback")),
            "updatedAt": node.get("updatedAt"),
        }
        for node in ideas[:limit]
    ]


def get_graph_neighborhood(graph: dict[str, Any], idea_id: str | None = None, node_id: str | None = None) -> dict[str, Any]:
    resolved_node_id = node_id or (f"idea:{idea_id}" if idea_id else None)
    if not resolved_node_id:
        latest_idea = next(iter(sorted((node for node in graph.get("nodes", {}).values() if node.get("kind") == "idea"), key=lambda item: item.get("updatedAt", ""), reverse=True)), None)
        resolved_node_id = latest_idea["id"] if latest_idea else None
    if not resolved_node_id:
        return {"center": None, "edges": [], "relatedNodes": []}
    center = graph.get("nodes", {}).get(resolved_node_id)
    if not center:
        return {"center": None, "edges": [], "relatedNodes": []}
    edges = [edge for edge in graph.get("edges", []) if edge.get("source") == resolved_node_id or edge.get("target") == resolved_node_id]
    related_ids = list(dict.fromkeys(edge["target"] if edge["source"] == resolved_node_id else edge["source"] for edge in edges))
    related_nodes = sorted([graph["nodes"][related_id] for related_id in related_ids if related_id in graph.get("nodes", {})], key=lambda item: item.get("updatedAt", ""), reverse=True)
    return {"center": center, "edges": edges, "relatedNodes": related_nodes}


def format_graph_summary_markdown(summary: dict[str, Any]) -> str:
    return "\n".join(
        [
            "# Memory Graph",
            "",
            f"- Runs: {summary['runs']}",
            f"- Updated at: {summary.get('updatedAt') or 'n/a'}",
            f"- Latest query: {summary.get('latestQuery') or 'n/a'}",
            f"- Nodes: {summary['nodeCount']}",
            f"- Edges: {summary['edgeCount']}",
            f"- Node kinds: {', '.join(f'{key}={value}' for key, value in summary['nodeKinds'].items()) or 'n/a'}",
            f"- Edge relations: {', '.join(f'{key}={value}' for key, value in summary['edgeRelations'].items()) or 'n/a'}",
            f"- Idea statuses: {', '.join(f'{key}={value}' for key, value in summary['ideaStatuses'].items()) or 'n/a'}",
            f"- Feedback decisions: {', '.join(f'{key}={value}' for key, value in summary['feedbackDecisions'].items()) or 'n/a'}",
            f"- Preference profiles: global={summary.get('preferenceProfiles', {}).get('global', 0)}, topic={summary.get('preferenceProfiles', {}).get('topic', 0)}",
        ]
    )


def format_graph_ideas_markdown(ideas: list[dict[str, Any]]) -> str:
    lines = ["# Graph Ideas", ""]
    for idea in ideas:
        lines.append(f"- {idea['id']}: {idea['title']}")
        lines.append(f"  status={idea['status']}; nearest={idea.get('nearestLiterature') or 'n/a'}")
        if idea.get("abstract"):
            lines.append(f"  abstract={idea['abstract']}")
        if idea.get("feedback", {}).get("decision"):
            note = f" ({idea['feedback']['note']})" if idea["feedback"].get("note") else ""
            lines.append(f"  feedback={idea['feedback']['decision']}{note}")
    return "\n".join(lines)


def format_graph_neighborhood_markdown(neighborhood: dict[str, Any]) -> str:
    if not neighborhood.get("center"):
        return "# Graph Neighborhood\n\nNo matching node found."
    center = neighborhood["center"]
    lines = [
        "# Graph Neighborhood",
        "",
        f"- Center: {center['id']}",
        f"- Kind: {center['kind']}",
        f"- Label: {_as_dict(_payload_dict(center).get('cardView')).get('title') or center.get('label')}",
        "",
    ]
    if not neighborhood.get("relatedNodes"):
        lines.append("No adjacent nodes.")
        return "\n".join(lines)
    lines.extend(["## Adjacent Nodes", ""])
    for node in neighborhood["relatedNodes"]:
        edge = next((item for item in neighborhood["edges"] if item.get("source") == center["id"] and item.get("target") == node["id"]), None) or next((item for item in neighborhood["edges"] if item.get("target") == center["id"] and item.get("source") == node["id"]), None)
        lines.append(f"- {node['id']}: {_as_dict(_payload_dict(node).get('cardView')).get('title') or node.get('label')}")
        lines.append(f"  kind={node['kind']}; relation={edge.get('relation') if edge else 'n/a'}; weight={edge.get('weight', 1) if edge else 1}")
    return "\n".join(lines)


def format_preference_profiles_markdown(profiles: dict[str, Any]) -> str:
    lines = ["# Preference Profiles", ""]
    global_profile = profiles.get("global") or {}
    lines.append("## Global")
    lines.append("")
    global_lines = summarize_preference_profile(global_profile)
    lines.extend([*(f"- {line}" for line in global_lines)] or ["- No stored global preferences."])
    lines.append("")
    lines.append("## Topics")
    lines.append("")
    topic_profiles = profiles.get("topics", []) or []
    if not topic_profiles:
        lines.append("- No topic-scoped preference profiles.")
        return "\n".join(lines)
    for profile in topic_profiles:
        topic_label = profile.get("topicProfile", {}).get("text") or profile.get("topicProfile", {}).get("id") or "topic"
        lines.append(f"- Topic: {topic_label}")
        for line in summarize_preference_profile(profile):
            lines.append(f"  {line}")
    return "\n".join(lines)
