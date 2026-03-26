import { ideaSimilarity } from "./dedupe.js";
import { probeIdeaLiterature } from "./literature-probe.js";
import { ideaToMatchText, tokenize } from "../schema.js";

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
  const acceptedIdeas = context.acceptedIdeas || context.state?.acceptedIdeas || [];
  const rejectedIdeas = context.rejectedIdeas || context.state?.rejectedIdeas || [];
  const papers = context.papers || [];
  const keywords = context.state?.constraints?.keywords || [];
  const acceptedIds = new Set(acceptedIdeas.map((candidate) => candidate.id).filter(Boolean));
  const diversityPool = visitedIdeas.filter((candidate) => !acceptedIds.has(candidate.id));
  const priorFamilies = new Set(visitedIdeas.map((candidate) => candidate.familyId).filter(Boolean));

  const maxVisitedSimilarity = diversityPool.length
    ? Math.max(...diversityPool.map((candidate) => ideaSimilarity(idea, candidate)))
    : 0;
  const acceptedAlignment = acceptedIdeas.length
    ? Math.max(...acceptedIdeas.map((candidate) => ideaSimilarity(idea, candidate)))
    : 0;
  const rejectedAlignment = rejectedIdeas.length
    ? Math.max(...rejectedIdeas.map((candidate) => ideaSimilarity(idea, candidate)))
    : 0;

  const literatureTrace = idea.literatureTrace || probeIdeaLiterature(idea, papers, context);
  const keywordTokens = new Set(tokenize(keywords.join(" ")));
  const ideaTokens = new Set(tokenize(ideaToMatchText(idea)));
  const keywordHits = [...keywordTokens].filter((token) => ideaTokens.has(token)).length;

  const novelty = Number((1 - literatureTrace.crowdedness).toFixed(3));
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
  const creativity = Number(
    Math.min(
      1,
      (idea.origin?.sourcePaperIds?.length ? 0.22 : 0.1) +
        (idea.origin?.noveltyAngle ? 0.18 : 0.05) +
        (!priorFamilies.has(idea.familyId) ? 0.16 : 0.06) +
        (idea.round === "mutation" ? 0.16 : 0.08) +
        (literatureTrace.breadth >= 0.35 ? 0.16 : 0.06) +
        (idea.critique?.flags?.includes("weak_contrast") ? 0.04 : 0.12)
    ).toFixed(3)
  );
  const grounding = literatureTrace.grounding;
  const critiquePenalty = idea.critique?.penalty || 0;

  const total = Number(
    (
      0.22 * novelty +
      0.18 * diversity +
      0.15 * feasibility +
      0.12 * userFit +
      0.15 * creativity +
      0.1 * grounding +
      0.11 * acceptedAlignment -
      0.16 * rejectedAlignment -
      critiquePenalty
    ).toFixed(3)
  );

  return {
    novelty,
    diversity,
    feasibility,
    userFit,
    creativity,
    grounding,
    acceptedAlignment: Number(acceptedAlignment.toFixed(3)),
    rejectedAlignment: Number(rejectedAlignment.toFixed(3)),
    critiquePenalty,
    total,
    nearestPaperId: literatureTrace.nearestPaperId || null,
    literatureBreadth: literatureTrace.breadth,
    literatureCrowdedness: literatureTrace.crowdedness
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
