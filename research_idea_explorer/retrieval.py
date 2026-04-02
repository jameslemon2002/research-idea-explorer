"""Local literature indexing and retrieval."""

from __future__ import annotations

import math
import re
from typing import Any

from .schema import normalize_text, tokenize, unique
from .similarity import jaccard_similarity


STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "in",
    "into",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "their",
    "this",
    "to",
    "via",
    "with",
}


def _paper_text(metadata: dict[str, Any]) -> str:
    return normalize_text(" ".join([metadata.get("title", ""), metadata.get("abstract", ""), *metadata.get("keywords", [])]))


def _limit_from_options(limit_or_options: int | dict[str, Any] | None) -> int:
    if isinstance(limit_or_options, int):
        return limit_or_options
    return int((limit_or_options or {}).get("limit", 5))


def _normalize_query_spec(spec: Any) -> dict[str, Any] | None:
    if spec is None:
        return None
    if isinstance(spec, str):
        return {"label": spec, "query": spec, "weight": 1}
    query = str(spec.get("query") or spec.get("label") or "").strip()
    if not query:
        return None
    return {
        "label": spec.get("label") or query,
        "query": query,
        "weight": float(spec.get("weight", 1)),
        "strategy": spec.get("strategy"),
    }


def _hash_string(value: str) -> int:
    hash_value = 2166136261
    for char in value:
        hash_value ^= ord(char)
        hash_value = (hash_value * 16777619) & 0xFFFFFFFF
    return hash_value


def _normalize_dense_vector(vector: list[float]) -> list[float]:
    magnitude = math.sqrt(sum(value * value for value in vector))
    if magnitude == 0:
        return vector
    return [value / magnitude for value in vector]


def _character_ngrams(text: str, min_n: int = 3, max_n: int = 5) -> list[str]:
    compact = re.sub(r"[^a-z0-9_]", "", re.sub(r"\s+", "_", str(text or "").lower()))
    grams: list[str] = []
    for size in range(min_n, max_n + 1):
        if len(compact) < size:
            continue
        for index in range(0, len(compact) - size + 1):
            grams.append(compact[index : index + size])
    return grams


def create_sparse_embedding(text: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for token in tokenize(text):
        counts[token] = counts.get(token, 0) + 1
    return counts


def create_local_embedding(text: str, dimensions: int = 256, min_n: int = 3, max_n: int = 5) -> list[float]:
    vector = [0.0] * dimensions
    token_weights = [token for token in tokenize(text) if token not in STOPWORDS]
    grams = _character_ngrams(text, min_n=min_n, max_n=max_n)
    token_bigrams = [f"{token_weights[index]}_{token_weights[index + 1]}" for index in range(len(token_weights) - 1)]

    for token in token_weights:
        hashed = _hash_string(f"tok:{token}")
        slot = hashed % dimensions
        sign = 1 if hashed & 1 else -1
        token_weight = min(2.2, 0.8 + len(token) / 5)
        vector[slot] += sign * token_weight

    for bigram in token_bigrams:
        hashed = _hash_string(f"bigram:{bigram}")
        slot = hashed % dimensions
        sign = 1 if hashed & 1 else -1
        vector[slot] += sign * 1.8

    for gram in grams:
        hashed = _hash_string(f"gram:{gram}")
        slot = hashed % dimensions
        sign = 1 if hashed & 1 else -1
        vector[slot] += sign * (0.3 + len(gram) / 12)

    return _normalize_dense_vector(vector)


def normalize_embedding(embedding: Any, fallback_text: str = "") -> Any:
    if isinstance(embedding, list) and embedding:
        return embedding
    if isinstance(embedding, dict) and embedding:
        return embedding
    return create_local_embedding(fallback_text)


def _sparse_entries(vector: dict[str, float] | Any) -> list[tuple[str, float]]:
    if not isinstance(vector, dict):
        return []
    return [(key, float(value)) for key, value in vector.items() if isinstance(value, (int, float)) and value != 0]


def cosine_similarity(left: Any, right: Any) -> float:
    if left is None or right is None:
        return 0.0
    if isinstance(left, list) and isinstance(right, list):
        length = min(len(left), len(right))
        if not length:
            return 0.0
        dot = sum(left[index] * right[index] for index in range(length))
        magnitude = math.sqrt(sum(value * value for value in left)) * math.sqrt(sum(value * value for value in right))
        return 0.0 if magnitude == 0 else dot / magnitude

    left_sparse = left if isinstance(left, dict) else {}
    right_sparse = right if isinstance(right, dict) else {}
    left_entries = _sparse_entries(left_sparse)
    right_entries = _sparse_entries(right_sparse)
    smaller, larger = (left_sparse, right_sparse) if len(left_entries) <= len(right_entries) else (right_sparse, left_sparse)
    dot = sum(value * float(larger.get(key, 0)) for key, value in _sparse_entries(smaller))
    magnitude = math.sqrt(sum(value * value for _, value in _sparse_entries(left_sparse))) * math.sqrt(
        sum(value * value for _, value in _sparse_entries(right_sparse))
    )
    return 0.0 if magnitude == 0 else dot / magnitude


def create_paper_node(metadata: dict[str, Any]) -> dict[str, Any]:
    text = _paper_text(metadata)
    return {
        "id": metadata["id"],
        "title": metadata.get("title"),
        "abstract": metadata.get("abstract"),
        "authors": metadata.get("authors", []),
        "year": metadata.get("year"),
        "venue": metadata.get("venue", ""),
        "keywords": metadata.get("keywords", []),
        "source": metadata.get("source", ""),
        "provider": metadata.get("provider") or metadata.get("source", ""),
        "providerScore": metadata.get("providerScore", 0),
        "citationCount": metadata.get("citationCount", 0),
        "externalIds": metadata.get("externalIds", {}),
        "links": metadata.get("links", {}),
        "categories": metadata.get("categories", []),
        "text": text,
        "embedding": normalize_embedding(metadata.get("embedding"), text),
    }


def build_similarity_graph(papers: list[dict[str, Any]], threshold: float = 0.68, max_neighbors: int = 4) -> dict[str, Any]:
    adjacency: dict[str, list[dict[str, Any]]] = {paper["id"]: [] for paper in papers}
    for left_index in range(len(papers)):
        for right_index in range(left_index + 1, len(papers)):
            left_paper = papers[left_index]
            right_paper = papers[right_index]
            similarity = cosine_similarity(left_paper["embedding"], right_paper["embedding"])
            if similarity < threshold:
                continue
            adjacency[left_paper["id"]].append({"paperId": right_paper["id"], "score": similarity})
            adjacency[right_paper["id"]].append({"paperId": left_paper["id"], "score": similarity})
    for paper_id, neighbors in adjacency.items():
        adjacency[paper_id] = sorted(neighbors, key=lambda item: item["score"], reverse=True)[:max_neighbors]
    return {"adjacency": adjacency, "threshold": threshold, "maxNeighbors": max_neighbors}


def build_literature_index(papers: list[dict[str, Any]], default_strategy: str = "hybrid", graph_threshold: float | None = None, graph_neighbors: int | None = None) -> dict[str, Any]:
    nodes = [create_paper_node(paper) for paper in papers]
    return {
        "papers": nodes,
        "paperMap": {paper["id"]: paper for paper in nodes},
        "graph": build_similarity_graph(nodes, threshold=graph_threshold or 0.68, max_neighbors=graph_neighbors or 4),
        "options": {"defaultStrategy": default_strategy},
    }


def _ensure_index(input_data: Any) -> dict[str, Any]:
    if isinstance(input_data, dict) and input_data.get("papers") is not None and input_data.get("paperMap") is not None:
        return input_data
    return build_literature_index(list(input_data or []))


def get_graph_neighbors(index: dict[str, Any], paper_id: str, limit: int = 5) -> list[dict[str, Any]]:
    neighbors = index.get("graph", {}).get("adjacency", {}).get(paper_id, [])
    hits = []
    for neighbor in neighbors[:limit]:
        paper = index["paperMap"].get(neighbor["paperId"])
        if paper:
            hits.append({"paper": paper, "score": neighbor["score"]})
    return hits


def expand_hits_with_graph(index: dict[str, Any], hits: list[dict[str, Any]], decay: float = 0.75, limit: int = 6) -> list[dict[str, Any]]:
    score_map: dict[str, dict[str, Any]] = {}
    for hit in hits:
        for neighbor in get_graph_neighbors(index, hit["paper"]["id"], limit):
            neighbor_score = hit["score"] * neighbor["score"] * decay
            existing = score_map.get(neighbor["paper"]["id"]) or {
                "paper": neighbor["paper"],
                "score": 0,
                "components": {"graph": 0},
            }
            existing["score"] = max(existing["score"], neighbor_score)
            existing["components"]["graph"] = max(existing["components"]["graph"], neighbor_score)
            score_map[neighbor["paper"]["id"]] = existing
    return sorted(score_map.values(), key=lambda item: item["score"], reverse=True)[:limit]


def search_lexical(index_input: Any, query: str, limit: int = 5) -> list[dict[str, Any]]:
    index = _ensure_index(index_input)
    query_tokens = unique(tokenize(query))
    hits = []
    for paper in index["papers"]:
        lexical = jaccard_similarity(query_tokens, unique(tokenize(paper["text"])))
        hits.append({"paper": paper, "score": lexical, "components": {"lexical": lexical, "embedding": 0, "graph": 0}})
    return sorted(hits, key=lambda item: item["score"], reverse=True)[:limit]


def search_embedding(index_input: Any, query: str, limit: int = 5) -> list[dict[str, Any]]:
    index = _ensure_index(index_input)
    query_embedding = create_local_embedding(query)
    hits = []
    for paper in index["papers"]:
        score = cosine_similarity(query_embedding, paper["embedding"])
        hits.append({"paper": paper, "score": score, "components": {"lexical": 0, "embedding": score, "graph": 0}})
    return sorted(hits, key=lambda item: item["score"], reverse=True)[:limit]


def search_graph(index_input: Any, query: str, options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    options = options or {}
    index = _ensure_index(index_input)
    limit = _limit_from_options(options)
    candidate_limit = max(limit * 3, 8)
    seed_limit = options.get("seedLimit", max(limit, 3))
    graph_decay = options.get("graphDecay", 0.85)
    seed_weight = options.get("seedWeight", 0.35)
    seed_strategy = options.get("seedStrategy", "embedding")
    seed_hits = search_lexical(index, query, seed_limit) if seed_strategy == "lexical" else search_embedding(index, query, seed_limit)
    graph_hits = expand_hits_with_graph(index, seed_hits, decay=graph_decay, limit=candidate_limit)
    scores: dict[str, dict[str, Any]] = {}

    def upsert(hit: dict[str, Any]) -> None:
        current = scores.get(hit["paper"]["id"]) or {
            "paper": hit["paper"],
            "score": 0,
            "components": {"lexical": 0, "embedding": 0, "graph": 0},
        }
        current["paper"] = hit["paper"]
        current["components"]["lexical"] = max(current["components"]["lexical"], hit.get("components", {}).get("lexical", 0))
        current["components"]["embedding"] = max(current["components"]["embedding"], hit.get("components", {}).get("embedding", 0))
        current["components"]["graph"] = max(current["components"]["graph"], hit.get("components", {}).get("graph", 0))
        current["score"] = seed_weight * (current["components"]["lexical"] + current["components"]["embedding"]) + current["components"]["graph"]
        scores[hit["paper"]["id"]] = current

    for hit in seed_hits:
        upsert(hit)
    for hit in graph_hits:
        upsert(hit)
    return sorted(scores.values(), key=lambda item: item["score"], reverse=True)[:limit]


def search_hybrid(index_input: Any, query: str, options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    options = options or {}
    index = _ensure_index(index_input)
    limit = _limit_from_options(options)
    lexical_weight = options.get("lexicalWeight", 0.5)
    embedding_weight = options.get("embeddingWeight", 0.34)
    graph_weight = options.get("graphWeight", 0.16)
    graph_decay = options.get("graphDecay", 0.75)
    candidate_limit = max(limit * 3, 8)

    lexical_hits = search_lexical(index, query, candidate_limit)
    embedding_hits = search_embedding(index, query, candidate_limit)
    graph_hits = expand_hits_with_graph(index, embedding_hits[: max(limit, 3)], decay=graph_decay, limit=candidate_limit)

    scores: dict[str, dict[str, Any]] = {}

    def ingest(hits: list[dict[str, Any]], component: str) -> None:
        for hit in hits:
            current = scores.get(hit["paper"]["id"]) or {
                "paper": hit["paper"],
                "score": 0,
                "components": {"lexical": 0, "embedding": 0, "graph": 0},
            }
            current["components"][component] = max(current["components"][component], hit["score"])
            current["score"] = (
                lexical_weight * current["components"]["lexical"]
                + embedding_weight * current["components"]["embedding"]
                + graph_weight * current["components"]["graph"]
            )
            scores[hit["paper"]["id"]] = current

    ingest(lexical_hits, "lexical")
    ingest(embedding_hits, "embedding")
    ingest(graph_hits, "graph")
    return sorted(scores.values(), key=lambda item: item["score"], reverse=True)[:limit]


def search_literature(index_input: Any, query: str, limit_or_options: int | dict[str, Any] | None = 5) -> list[dict[str, Any]]:
    index = _ensure_index(index_input)
    options = {"limit": limit_or_options} if isinstance(limit_or_options, int) else dict(limit_or_options or {})
    strategy = options.get("strategy") or index.get("options", {}).get("defaultStrategy") or "hybrid"
    limit = _limit_from_options(options)
    if strategy == "lexical":
        return search_lexical(index, query, limit)
    if strategy == "embedding":
        return search_embedding(index, query, limit)
    if strategy == "graph":
        return search_graph(index, query, {**options, "limit": limit})
    return search_hybrid(index, query, {**options, "limit": limit})


def trace_literature_queries(index_input: Any, query_specs: list[Any], options: dict[str, Any] | None = None) -> dict[str, Any]:
    options = options or {}
    index = _ensure_index(index_input)
    per_query_limit = int(options.get("perQueryLimit") or options.get("limit") or 5)
    limit = int(options.get("limit") or max(per_query_limit, 5))
    strategy = options.get("strategy") or index.get("options", {}).get("defaultStrategy") or "hybrid"
    seen_queries: set[str] = set()
    specs = []
    for spec in query_specs or []:
        normalized = _normalize_query_spec(spec)
        if not normalized:
            continue
        key = f"{normalized.get('strategy') or strategy}|{normalize_text(normalized['query'])}"
        if key in seen_queries:
            continue
        seen_queries.add(key)
        specs.append(normalized)

    if not specs:
        return {"queries": [], "mergedHits": [], "totalWeight": 0, "uniquePaperCount": 0}

    total_weight = sum(spec["weight"] for spec in specs) or 1
    merged: dict[str, dict[str, Any]] = {}
    queries = []

    for spec in specs:
        hits = search_literature(index, spec["query"], {**options, "limit": per_query_limit, "strategy": spec.get("strategy") or strategy})
        for hit in hits:
            current = merged.get(hit["paper"]["id"]) or {
                "paper": hit["paper"],
                "score": 0,
                "weightedScore": 0,
                "maxScore": 0,
                "breadth": 0,
                "appearances": 0,
                "components": {"lexical": 0, "embedding": 0, "graph": 0},
                "matchedQueries": [],
            }
            current["paper"] = hit["paper"]
            current["weightedScore"] += hit["score"] * spec["weight"]
            current["maxScore"] = max(current["maxScore"], hit["score"])
            current["appearances"] += 1
            current["components"]["lexical"] = max(current["components"]["lexical"], hit.get("components", {}).get("lexical", 0))
            current["components"]["embedding"] = max(current["components"]["embedding"], hit.get("components", {}).get("embedding", 0))
            current["components"]["graph"] = max(current["components"]["graph"], hit.get("components", {}).get("graph", 0))
            current["matchedQueries"].append({"label": spec["label"], "query": spec["query"], "score": round(hit["score"], 3)})
            merged[hit["paper"]["id"]] = current

        queries.append({"label": spec["label"], "query": spec["query"], "weight": spec["weight"], "hits": hits})

    merged_hits = []
    for current in merged.values():
        breadth = current["appearances"] / max(len(specs), 1)
        weighted_score = current["weightedScore"] / total_weight
        score = 0.72 * weighted_score + 0.28 * breadth
        merged_hits.append(
            {
                **current,
                "breadth": round(breadth, 3),
                "score": round(score, 3),
                "weightedScore": round(weighted_score, 3),
                "maxScore": round(current["maxScore"], 3),
            }
        )

    merged_hits = sorted(merged_hits, key=lambda item: item["score"], reverse=True)[:limit]
    return {
        "queries": queries,
        "mergedHits": merged_hits,
        "totalWeight": total_weight,
        "uniquePaperCount": len(merged),
    }
