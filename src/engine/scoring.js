import { ideaSimilarity } from "./dedupe.js";
import { ideaToText, tokenize } from "../schema.js";
import { scoreIdeaAgainstLiterature } from "../retrieval/literature.js";

const EVIDENCE_FEASIBILITY = {
  observational_data: 0.82,
  survey: 0.78,
  archive: 0.74,
  text_corpus: 0.76,
  administrative_data: 0.8,
  interviews: 0.67,
  case_study: 0.7,
  experiment: 0.62,
  quasi_experiment: 0.58,
  field_trial: 0.55,
  sensor_data: 0.68,
  prototype: 0.6,
  simulation: 0.72
};

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function scoreIdea(idea, context = {}) {
  const visitedIdeas = context.visitedIdeas || [];
  const papers = context.papers || [];
  const keywords = context.state?.constraints?.keywords || [];

  const maxVisitedSimilarity = visitedIdeas.length
    ? Math.max(...visitedIdeas.map((candidate) => ideaSimilarity(idea, candidate)))
    : 0;

  const literatureMatch = scoreIdeaAgainstLiterature(ideaToText(idea), papers);
  const keywordTokens = new Set(tokenize(keywords.join(" ")));
  const ideaTokens = new Set(tokenize(ideaToText(idea)));
  const keywordHits = [...keywordTokens].filter((token) => ideaTokens.has(token)).length;

  const novelty = Number((1 - literatureMatch.overlap).toFixed(3));
  const diversity = Number((1 - maxVisitedSimilarity).toFixed(3));
  const feasibilityBase = EVIDENCE_FEASIBILITY[idea.evidence.kind] || 0.65;
  const scopeBonus = average(
    [idea.scope.population, idea.scope.place, idea.scope.time, idea.scope.scale].map((value) =>
      value && !String(value).startsWith("unspecified") ? 1 : 0
    )
  );
  const feasibility = Number((0.7 * feasibilityBase + 0.3 * scopeBonus).toFixed(3));
  const userFit = Number(
    (
      keywordTokens.size === 0 ? 0.75 : Math.min(1, keywordHits / Math.max(keywordTokens.size, 1))
    ).toFixed(3)
  );
  const priorPersonas = new Set(visitedIdeas.map((candidate) => candidate.origin?.personaId).filter(Boolean));
  const creativity = Number(
    Math.min(
      1,
      (idea.origin?.personaId ? 0.35 : 0.15) +
        (idea.origin?.sourcePaperIds?.length ? 0.15 : 0) +
        (idea.origin?.noveltyAngle ? 0.2 : 0) +
        (!priorPersonas.has(idea.origin?.personaId) ? 0.15 : 0.05) +
        (idea.critique?.flags?.includes("weak_contrast") ? 0.05 : 0.15)
    ).toFixed(3)
  );
  const critiquePenalty = idea.critique?.penalty || 0;

  const total = Number(
    (
      0.28 * novelty +
      0.2 * diversity +
      0.16 * feasibility +
      0.14 * userFit +
      0.22 * creativity -
      critiquePenalty
    ).toFixed(3)
  );

  return {
    novelty,
    diversity,
    feasibility,
    userFit,
    creativity,
    critiquePenalty,
    total,
    nearestPaperId: literatureMatch.nearestPaper?.id || null,
    literatureComponents: literatureMatch.components
  };
}

export function rankIdeas(ideas, context = {}) {
  return ideas
    .map((idea) => ({
      ...idea,
      scores: scoreIdea(idea, context)
    }))
    .sort((left, right) => right.scores.total - left.scores.total);
}
