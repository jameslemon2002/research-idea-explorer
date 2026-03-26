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

function buildStableId(prefix, values) {
  const digest = createHash("sha1")
    .update(values.map((value) => normalizeText(value)).join("|"))
    .digest("hex")
    .slice(0, 12);

  return `${prefix}-${digest}`;
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
  return {
    id:
      input.id ||
      buildStableId("seed", [
        input.persona.id,
        input.object,
        input.hook,
        input.pivot,
        input.questionStem,
        input.noveltyAngle,
        ...(input.sourcePaperIds || [])
      ]),
    persona: {
      id: input.persona.id,
      label: input.persona.label
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
    }
  };

  const signature = buildIdeaSignature(idea);
  const id =
    input.id ||
    buildStableId("idea", [
      signature,
      idea.origin?.personaId,
      idea.title
    ]);

  return {
    id,
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
    visitedSignatures: input.visitedSignatures || [],
    acceptedIdeas: input.acceptedIdeas || [],
    rejectedIdeas: input.rejectedIdeas || [],
    frontier: input.frontier || [],
    history: input.history || []
  };
}
