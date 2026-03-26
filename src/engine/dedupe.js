import { ideaToSimilarityText, tokenize, unique } from "../schema.js";

export function jaccardSimilarity(leftTokens, rightTokens) {
  const left = new Set(leftTokens);
  const right = new Set(rightTokens);
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

export function ideaSimilarity(leftIdea, rightIdea) {
  return jaccardSimilarity(
    unique(tokenize(ideaToSimilarityText(leftIdea))),
    unique(tokenize(ideaToSimilarityText(rightIdea)))
  );
}

export function dedupeIdeas(ideas, threshold = 0.74) {
  const seenSignatures = new Set();
  const kept = [];

  for (const idea of ideas) {
    if (seenSignatures.has(idea.signature)) {
      continue;
    }

    const nearDuplicate = kept.some((candidate) => ideaSimilarity(candidate, idea) >= threshold);
    if (nearDuplicate) {
      continue;
    }

    seenSignatures.add(idea.signature);
    kept.push(idea);
  }

  return kept;
}
