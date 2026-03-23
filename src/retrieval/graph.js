import { cosineSimilarity } from "./vector.js";

export function buildSimilarityGraph(papers, options = {}) {
  const threshold = options.threshold ?? 0.68;
  const maxNeighbors = options.maxNeighbors ?? 4;
  const adjacency = new Map(papers.map((paper) => [paper.id, []]));

  for (let leftIndex = 0; leftIndex < papers.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < papers.length; rightIndex += 1) {
      const leftPaper = papers[leftIndex];
      const rightPaper = papers[rightIndex];
      const similarity = cosineSimilarity(leftPaper.embedding, rightPaper.embedding);

      if (similarity < threshold) {
        continue;
      }

      adjacency.get(leftPaper.id).push({ paperId: rightPaper.id, score: similarity });
      adjacency.get(rightPaper.id).push({ paperId: leftPaper.id, score: similarity });
    }
  }

  for (const [paperId, neighbors] of adjacency.entries()) {
    adjacency.set(
      paperId,
      [...neighbors].sort((left, right) => right.score - left.score).slice(0, maxNeighbors)
    );
  }

  return {
    adjacency,
    threshold,
    maxNeighbors
  };
}

export function getGraphNeighbors(index, paperId, limit = 5) {
  const neighbors = index.graph?.adjacency?.get(paperId) || [];
  return neighbors
    .slice(0, limit)
    .map((neighbor) => ({
      paper: index.paperMap.get(neighbor.paperId),
      score: neighbor.score
    }))
    .filter((hit) => hit.paper);
}

export function expandHitsWithGraph(index, hits, options = {}) {
  const decay = options.decay ?? 0.75;
  const limit = options.limit ?? 6;
  const scoreMap = new Map();

  for (const hit of hits) {
    for (const neighbor of getGraphNeighbors(index, hit.paper.id, limit)) {
      const neighborScore = hit.score * neighbor.score * decay;
      const existing = scoreMap.get(neighbor.paper.id) || {
        paper: neighbor.paper,
        score: 0,
        components: { graph: 0 }
      };

      existing.score = Math.max(existing.score, neighborScore);
      existing.components.graph = Math.max(existing.components.graph, neighborScore);
      scoreMap.set(neighbor.paper.id, existing);
    }
  }

  return [...scoreMap.values()].sort((left, right) => right.score - left.score).slice(0, limit);
}
