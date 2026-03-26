import { normalizeText, tokenize, unique } from "../schema.js";
import { jaccardSimilarity } from "../engine/dedupe.js";
import { buildSimilarityGraph, expandHitsWithGraph, getGraphNeighbors as getIndexGraphNeighbors } from "./graph.js";
import { cosineSimilarity, createLocalEmbedding, normalizeEmbedding } from "./vector.js";

function paperText(metadata) {
  return normalizeText([metadata.title, metadata.abstract, ...(metadata.keywords || [])].join(" "));
}

function ensureIndex(input) {
  if (input?.papers && input?.paperMap) {
    return input;
  }

  return buildLiteratureIndex(input || []);
}

function limitFromOptions(limitOrOptions) {
  return typeof limitOrOptions === "number" ? limitOrOptions : limitOrOptions?.limit ?? 5;
}

export function createPaperNode(metadata) {
  const text = paperText(metadata);
  return {
    id: metadata.id,
    title: metadata.title,
    abstract: metadata.abstract,
    authors: metadata.authors || [],
    year: metadata.year || null,
    venue: metadata.venue || "",
    keywords: metadata.keywords || [],
    source: metadata.source || "",
    provider: metadata.provider || metadata.source || "",
    providerScore: metadata.providerScore || 0,
    citationCount: metadata.citationCount || 0,
    externalIds: metadata.externalIds || {},
    links: metadata.links || {},
    categories: metadata.categories || [],
    text,
    embedding: normalizeEmbedding(metadata.embedding, text)
  };
}

export function buildLiteratureIndex(papers, options = {}) {
  const nodes = papers.map(createPaperNode);
  const paperMap = new Map(nodes.map((paper) => [paper.id, paper]));
  const graph = buildSimilarityGraph(nodes, {
    threshold: options.graphThreshold,
    maxNeighbors: options.graphNeighbors
  });

  return {
    papers: nodes,
    paperMap,
    graph,
    options: {
      defaultStrategy: options.defaultStrategy || "hybrid"
    }
  };
}

export function searchLexical(indexInput, query, limit = 5) {
  const index = ensureIndex(indexInput);
  const queryTokens = unique(tokenize(query));
  return [...index.papers]
    .map((paper) => ({
      paper,
      score: jaccardSimilarity(queryTokens, unique(tokenize(paper.text))),
      components: {
        lexical: jaccardSimilarity(queryTokens, unique(tokenize(paper.text))),
        embedding: 0,
        graph: 0
      }
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function searchEmbedding(indexInput, query, limit = 5) {
  const index = ensureIndex(indexInput);
  const queryEmbedding = createLocalEmbedding(query);
  return [...index.papers]
    .map((paper) => {
      const score = cosineSimilarity(queryEmbedding, paper.embedding);
      return {
        paper,
        score,
        components: {
          lexical: 0,
          embedding: score,
          graph: 0
        }
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function searchGraph(indexInput, query, options = {}) {
  const index = ensureIndex(indexInput);
  const limit = limitFromOptions(options);
  const candidateLimit = Math.max(limit * 3, 8);
  const seedLimit = options.seedLimit ?? Math.max(limit, 3);
  const graphDecay = options.graphDecay ?? 0.85;
  const seedWeight = options.seedWeight ?? 0.35;
  const seedStrategy = options.seedStrategy || "embedding";
  const seedHits =
    seedStrategy === "lexical"
      ? searchLexical(index, query, seedLimit)
      : searchEmbedding(index, query, seedLimit);
  const graphHits = expandHitsWithGraph(index, seedHits, {
    decay: graphDecay,
    limit: candidateLimit
  });
  const scores = new Map();

  const upsert = (hit) => {
    const current = scores.get(hit.paper.id) || {
      paper: hit.paper,
      score: 0,
      components: {
        lexical: 0,
        embedding: 0,
        graph: 0
      }
    };

    current.paper = hit.paper;
    current.components.lexical = Math.max(current.components.lexical, hit.components?.lexical || 0);
    current.components.embedding = Math.max(current.components.embedding, hit.components?.embedding || 0);
    current.components.graph = Math.max(current.components.graph, hit.components?.graph || 0);
    current.score =
      seedWeight * (current.components.lexical + current.components.embedding) + current.components.graph;
    scores.set(hit.paper.id, current);
  };

  for (const hit of seedHits) {
    upsert(hit);
  }

  for (const hit of graphHits) {
    upsert(hit);
  }

  return [...scores.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function searchHybrid(indexInput, query, options = {}) {
  const index = ensureIndex(indexInput);
  const limit = limitFromOptions(options);
  const lexicalWeight = options.lexicalWeight ?? 0.5;
  const embeddingWeight = options.embeddingWeight ?? 0.34;
  const graphWeight = options.graphWeight ?? 0.16;
  const graphDecay = options.graphDecay ?? 0.75;
  const candidateLimit = Math.max(limit * 3, 8);

  const lexicalHits = searchLexical(index, query, candidateLimit);
  const embeddingHits = searchEmbedding(index, query, candidateLimit);
  const graphHits = expandHitsWithGraph(
    index,
    embeddingHits.slice(0, Math.max(limit, 3)),
    {
      decay: graphDecay,
      limit: candidateLimit
    }
  );

  const scores = new Map();
  const ingest = (hits, component, weight) => {
    for (const hit of hits) {
      const current = scores.get(hit.paper.id) || {
        paper: hit.paper,
        score: 0,
        components: {
          lexical: 0,
          embedding: 0,
          graph: 0
        }
      };

      current.components[component] = Math.max(current.components[component], hit.score);
      current.score =
        lexicalWeight * current.components.lexical +
        embeddingWeight * current.components.embedding +
        graphWeight * current.components.graph;
      scores.set(hit.paper.id, current);
    }
  };

  ingest(lexicalHits, "lexical", lexicalWeight);
  ingest(embeddingHits, "embedding", embeddingWeight);
  ingest(graphHits, "graph", graphWeight);

  return [...scores.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function searchLiterature(indexInput, query, limitOrOptions = 5) {
  const index = ensureIndex(indexInput);
  const options = typeof limitOrOptions === "number" ? { limit: limitOrOptions } : limitOrOptions || {};
  const strategy = options.strategy || index.options.defaultStrategy || "hybrid";
  const limit = limitFromOptions(options);

  if (strategy === "lexical") {
    return searchLexical(index, query, limit);
  }

  if (strategy === "embedding") {
    return searchEmbedding(index, query, limit);
  }

  if (strategy === "graph") {
    return searchGraph(index, query, {
      ...options,
      limit
    });
  }

  return searchHybrid(index, query, {
    ...options,
    limit
  });
}

export function scoreIdeaAgainstLiterature(ideaText, indexInput, options = {}) {
  const [topHit] = searchLiterature(indexInput, ideaText, {
    limit: 1,
    strategy: options.strategy || "hybrid"
  });

  return {
    overlap: topHit?.score || 0,
    nearestPaper: topHit?.paper || null,
    components: topHit?.components || {
      lexical: 0,
      embedding: 0,
      graph: 0
    }
  };
}

export function getGraphNeighbors(indexInput, paperId, limit = 5) {
  const index = ensureIndex(indexInput);
  return getIndexGraphNeighbors(index, paperId, limit);
}
