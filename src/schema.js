import { getClaim, getPuzzle } from "./domain/taxonomy.js";

let nextIdeaId = 1;
let nextSeedId = 1;

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

export function buildIdeaSignature(idea) {
  return [
    normalizeText(idea.object),
    idea.puzzle.id,
    idea.claim.id,
    normalizeText(idea.contrast.axis),
    normalizeText(idea.evidence.kind),
    normalizeText(idea.scope.population),
    normalizeText(idea.scope.place)
  ].join("|");
}

export function ideaToText(idea) {
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
    idea.rationale,
    idea.origin?.personaLabel,
    idea.origin?.noveltyAngle,
    idea.critique?.summary,
    ...(idea.stakes || [])
  ].join(" ");
}

export function createBrainstormSeed(input) {
  return {
    id: input.id || `seed-${nextSeedId++}`,
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
    id: input.id || `idea-${nextIdeaId++}`,
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

  return {
    ...idea,
    signature: buildIdeaSignature(idea)
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
