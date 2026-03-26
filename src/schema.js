import { createHash } from "node:crypto";

import { getClaim, getPuzzle } from "./domain/taxonomy.js";

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(...values) {
  return normalizeText(values.join(" "))
    .split(" ")
    .filter(Boolean);
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

const TOPIC_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "without",
  "study",
  "studies",
  "research",
  "topic",
  "topics",
  "query",
  "queries",
  "live",
  "search",
  "novelty",
  "feasibility",
  "literature",
  "awareness",
  "relevant",
  "recent",
  "contexts",
  "surfaced",
  "retrieved",
  "unspecified"
]);

function buildStableId(prefix, values) {
  const digest = createHash("sha1")
    .update(values.map((value) => normalizeText(value)).join("|"))
    .digest("hex")
    .slice(0, 12);

  return `${prefix}-${digest}`;
}

function topicJaccard(leftTokens, rightTokens) {
  const left = new Set(leftTokens);
  const right = new Set(rightTokens);
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function topicKeywords(input = {}) {
  if (Array.isArray(input.constraints?.keywords)) {
    return input.constraints.keywords;
  }

  if (Array.isArray(input.keywords)) {
    return input.keywords;
  }

  return [];
}

function topicObjects(input = {}) {
  if (Array.isArray(input.focus?.objects)) {
    return input.focus.objects;
  }

  if (Array.isArray(input.objects)) {
    return input.objects;
  }

  if (input.object) {
    return [input.object];
  }

  if (input.query) {
    return [input.query];
  }

  return [];
}

function topicDomain(input = {}) {
  const raw = input.focus?.domain || input.domain || input.topicProfile?.domain || "";
  const domain = normalizeText(raw);
  return domain && !["live search", "unspecified domain"].includes(domain) ? domain : "";
}

function topicFocusTerms(input = {}) {
  if (Array.isArray(input.focusTerms)) {
    return input.focusTerms;
  }

  if (Array.isArray(input.origin?.focusTerms)) {
    return input.origin.focusTerms;
  }

  return [];
}

export function buildTopicProfile(input = {}) {
  if (input.topicProfile?.id && Array.isArray(input.topicProfile?.tokens)) {
    return {
      id: input.topicProfile.id,
      text: input.topicProfile.text || input.topicProfile.tokens.join(" "),
      tokens: unique(input.topicProfile.tokens.map((token) => normalizeText(token)).filter(Boolean)),
      domain: input.topicProfile.domain || null
    };
  }

  if (input.id && Array.isArray(input.tokens)) {
    return {
      id: input.id,
      text: input.text || input.tokens.join(" "),
      tokens: unique(input.tokens.map((token) => normalizeText(token)).filter(Boolean)),
      domain: input.domain || null
    };
  }

  const objects = topicObjects(input);
  const keywords = topicKeywords(input);
  const focusTerms = topicFocusTerms(input);
  const domain = topicDomain(input);
  const text = unique([...objects, ...keywords, ...focusTerms, domain]).join(" ").trim();
  const tokens = unique(
    tokenize(text)
      .filter((token) => token.length > 1)
      .filter((token) => !TOPIC_STOPWORDS.has(token))
  );

  return {
    id: buildStableId("topic", tokens.length ? tokens : [text || "topic"]),
    text: text || objects.join(" ") || domain || "topic",
    tokens,
    domain: domain || null
  };
}

export function topicSimilarity(left, right) {
  const leftProfile = buildTopicProfile(left);
  const rightProfile = buildTopicProfile(right);
  return topicJaccard(leftProfile.tokens, rightProfile.tokens);
}

export function sameTopic(left, right, options = {}) {
  const threshold = options.threshold ?? 0.26;
  const leftProfile = buildTopicProfile(left);
  const rightProfile = buildTopicProfile(right);

  return leftProfile.id === rightProfile.id || topicSimilarity(leftProfile, rightProfile) >= threshold;
}

export function buildIdeaSignature(idea) {
  return [
    normalizeText(idea.object),
    idea.puzzle.id,
    idea.claim.id,
    normalizeText(idea.contrast.axis),
    normalizeText(idea.contrast.comparison),
    normalizeText(idea.evidence.kind),
    normalizeText(idea.scope.population),
    normalizeText(idea.scope.place),
    normalizeText(idea.scope.time),
    normalizeText(idea.scope.scale)
  ].join("|");
}

export function buildIdeaFamilyId(idea) {
  return buildStableId("family", [
    idea.object,
    idea.puzzle?.id,
    idea.claim?.id,
    idea.contrast?.axis,
    idea.scope?.scale
  ]);
}

export function ideaToMatchText(idea) {
  return [
    idea.title,
    idea.object,
    idea.puzzle.label,
    idea.claim.label,
    idea.contrast.axis,
    idea.contrast.comparison,
    idea.evidence.kind,
    idea.evidence.detail,
    idea.scope.population,
    idea.scope.place,
    idea.scope.time,
    idea.scope.scale,
    ...(idea.stakes || [])
  ].join(" ");
}

export function ideaToSimilarityText(idea) {
  return [
    ideaToMatchText(idea),
    idea.rationale,
    idea.origin?.personaLabel,
    idea.origin?.noveltyAngle
  ].join(" ");
}

export function ideaToText(idea) {
  return [
    ideaToSimilarityText(idea),
    idea.critique?.summary
  ].join(" ");
}

export function createBrainstormSeed(input) {
  const persona = input.persona || {
    id: input.moveId || "literature_move",
    label: input.moveLabel || "Literature Move"
  };

  return {
    id:
      input.id ||
      buildStableId("seed", [
        persona.id,
        input.object,
        input.hook,
        input.pivot,
        input.questionStem,
        input.noveltyAngle,
        ...(input.sourcePaperIds || [])
      ]),
    persona: {
      id: persona.id,
      label: persona.label
    },
    object: input.object,
    hook: input.hook || "",
    pivot: input.pivot || "",
    questionStem: input.questionStem || "",
    noveltyAngle: input.noveltyAngle || "",
    suggestedPuzzles: input.suggestedPuzzles || [],
    suggestedClaims: input.suggestedClaims || [],
    contrastSuggestions: input.contrastSuggestions || [],
    evidenceHints: input.evidenceHints || [],
    sourcePaperIds: input.sourcePaperIds || [],
    literatureQueries: (input.literatureQueries || []).map((query) => ({
      label: query.label || query.query || "query",
      query: query.query || "",
      weight: query.weight || 1
    })),
    focusTerms: unique(input.focusTerms || []),
    round: input.round || "initial",
    stage: input.stage || "diverge",
    parentIdeaId: input.parentIdeaId || null,
    tags: unique(input.tags || [])
  };
}

export function createIdeaCard(input) {
  const puzzle = typeof input.puzzle === "string" ? getPuzzle(input.puzzle) : input.puzzle;
  const claim = typeof input.claim === "string" ? getClaim(input.claim) : input.claim;

  if (!puzzle) {
    throw new Error(`Unknown puzzle: ${input.puzzle}`);
  }

  if (!claim) {
    throw new Error(`Unknown claim: ${input.claim}`);
  }

  const idea = {
    title: input.title,
    object: input.object,
    puzzle,
    claim,
    contrast: {
      axis: input.contrast?.axis || "comparison",
      comparison: input.contrast?.comparison || "unspecified contrast"
    },
    evidence: {
      kind: input.evidence?.kind || "observational_data",
      detail: input.evidence?.detail || "unspecified evidence source"
    },
    scope: {
      population: input.scope?.population || "unspecified population",
      place: input.scope?.place || "unspecified place",
      time: input.scope?.time || "unspecified period",
      scale: input.scope?.scale || "unspecified scale"
    },
    stakes: input.stakes || [],
    rationale: input.rationale || "",
    tags: unique(input.tags || []),
    scores: input.scores || {},
    origin: input.origin || {
      seedId: null,
      personaId: null,
      personaLabel: null,
      noveltyAngle: null,
      sourcePaperIds: []
    },
    critique: input.critique || {
      flags: [],
      penalty: 0,
      summary: ""
    },
    literatureTrace: input.literatureTrace || null,
    round: input.round || input.origin?.round || "initial",
    topicProfile: buildTopicProfile(input.topicProfile || {
      object: input.object,
      keywords: input.origin?.focusTerms || []
    })
  };

  const signature = buildIdeaSignature(idea);
  const familyId = input.familyId || buildIdeaFamilyId(idea);
  const id =
    input.id ||
    buildStableId("idea", [
      signature,
      idea.origin?.personaId,
      idea.title
    ]);

  return {
    id,
    familyId,
    ...idea,
    signature
  };
}

export function createResearchState(input = {}) {
  return {
    focus: {
      domain: input.focus?.domain || "unspecified domain",
      objects: input.focus?.objects || []
    },
    constraints: {
      preferredPuzzles: input.constraints?.preferredPuzzles || [],
      preferredClaims: input.constraints?.preferredClaims || [],
      evidenceKinds: input.constraints?.evidenceKinds || [],
      keywords: input.constraints?.keywords || [],
      personaIds: input.constraints?.personaIds || []
    },
    contrasts: input.contrasts || [],
    scope: input.scope || {},
    stakes: input.stakes || [],
    topicProfile: buildTopicProfile(input),
    visitedSignatures: input.visitedSignatures || [],
    acceptedIdeas: input.acceptedIdeas || [],
    rejectedIdeas: input.rejectedIdeas || [],
    frontier: input.frontier || [],
    history: input.history || []
  };
}
