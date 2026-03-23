import { tokenize } from "../schema.js";

const STOPWORDS = new Set([
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
  "with"
]);

function normalizeDenseVector(vector) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function characterNgrams(text, minN = 3, maxN = 5) {
  const compact = String(text || "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  const grams = [];

  for (let size = minN; size <= maxN; size += 1) {
    if (compact.length < size) {
      continue;
    }

    for (let index = 0; index <= compact.length - size; index += 1) {
      grams.push(compact.slice(index, index + size));
    }
  }

  return grams;
}

function sparseEntries(vector) {
  if (!vector || Array.isArray(vector)) {
    return [];
  }

  return Object.entries(vector).filter(([, value]) => typeof value === "number" && value !== 0);
}

function sparseMagnitude(vector) {
  return Math.sqrt(sparseEntries(vector).reduce((sum, [, value]) => sum + value * value, 0));
}

function denseMagnitude(vector) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

export function createSparseEmbedding(text) {
  const counts = {};

  for (const token of tokenize(text)) {
    counts[token] = (counts[token] || 0) + 1;
  }

  return counts;
}

export function createLocalEmbedding(text, options = {}) {
  const dimensions = options.dimensions || 256;
  const vector = new Array(dimensions).fill(0);
  const tokenWeights = tokenize(text).filter((token) => !STOPWORDS.has(token));
  const grams = characterNgrams(text, options.minN || 3, options.maxN || 5);
  const tokenBigrams = [];

  for (let index = 0; index < tokenWeights.length - 1; index += 1) {
    tokenBigrams.push(`${tokenWeights[index]}_${tokenWeights[index + 1]}`);
  }

  for (const token of tokenWeights) {
    const hash = hashString(`tok:${token}`);
    const slot = hash % dimensions;
    const sign = hash & 1 ? 1 : -1;
    const tokenWeight = Math.min(2.2, 0.8 + token.length / 5);
    vector[slot] += sign * tokenWeight;
  }

  for (const bigram of tokenBigrams) {
    const hash = hashString(`bigram:${bigram}`);
    const slot = hash % dimensions;
    const sign = hash & 1 ? 1 : -1;
    vector[slot] += sign * 1.8;
  }

  for (const gram of grams) {
    const hash = hashString(`gram:${gram}`);
    const slot = hash % dimensions;
    const sign = hash & 1 ? 1 : -1;
    vector[slot] += sign * (0.3 + gram.length / 12);
  }

  return normalizeDenseVector(vector);
}

export function normalizeEmbedding(embedding, fallbackText = "") {
  if (Array.isArray(embedding) && embedding.length) {
    return embedding;
  }

  if (embedding && typeof embedding === "object" && !Array.isArray(embedding)) {
    return embedding;
  }

  return createLocalEmbedding(fallbackText);
}

export function cosineSimilarity(left, right) {
  if (!left || !right) {
    return 0;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.min(left.length, right.length);
    if (!length) {
      return 0;
    }

    const dot = Array.from({ length }, (_, index) => left[index] * right[index]).reduce(
      (sum, value) => sum + value,
      0
    );
    const magnitude = denseMagnitude(left) * denseMagnitude(right);
    return magnitude === 0 ? 0 : dot / magnitude;
  }

  const leftSparse = Array.isArray(left) ? {} : left;
  const rightSparse = Array.isArray(right) ? {} : right;
  const [smaller, larger] =
    sparseEntries(leftSparse).length <= sparseEntries(rightSparse).length
      ? [leftSparse, rightSparse]
      : [rightSparse, leftSparse];

  let dot = 0;
  for (const [key, value] of sparseEntries(smaller)) {
    dot += value * (larger[key] || 0);
  }

  const magnitude = sparseMagnitude(leftSparse) * sparseMagnitude(rightSparse);
  return magnitude === 0 ? 0 : dot / magnitude;
}
