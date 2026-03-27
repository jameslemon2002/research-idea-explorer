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
  const feedbackStrategy = context.feedbackStrategy || context.state?.feedbackStrategy || {};
  const papers = context.papers || [];
  const keywords = context.state?.constraints?.keywords || [];
  const acceptedIds = new Set(acceptedIdeas.map((candidate) => candidate.id).filter(Boolean));
  const rejectedFamilies = new Set(feedbackStrategy.rejectedFamilies || []);
  const rejectedComparisons = new Set(feedbackStrategy.rejectedComparisons || []);
  const rejectedEvidenceKinds = new Set(feedbackStrategy.rejectedEvidenceKinds || []);
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
  const feasibility = Number(
    (
      feedbackStrategy.avoidOverNarrowing
        ? 0.85 * feasibilityBase + 0.15 * scopeBonus
        : 0.7 * feasibilityBase + 0.3 * scopeBonus
    ).toFixed(3)
  );
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
  const lateralEscape = Number(
    (
      feedbackStrategy.expandLaterally
        ? (1 - rejectedAlignment) * (!priorFamilies.has(idea.familyId) ? 1 : 0.7)
        : 0
    ).toFixed(3)
  );
  const rejectedLanePenalty = Number(
    (
      feedbackStrategy.expandLaterally
        ? (rejectedFamilies.has(idea.familyId) ? 0.12 : 0) +
          (rejectedComparisons.has(idea.contrast?.comparison) ? 0.12 : 0) +
          (rejectedEvidenceKinds.has(idea.evidence?.kind) ? 0.06 : 0)
        : 0
    ).toFixed(3)
  );
  const noveltyWeight = feedbackStrategy.expandLaterally ? 0.24 : 0.22;
  const diversityWeight = feedbackStrategy.expandLaterally ? 0.24 : 0.18;
  const feasibilityWeight = feedbackStrategy.avoidOverNarrowing ? 0.1 : 0.15;
  const userFitWeight = feedbackStrategy.expandLaterally ? 0.1 : 0.12;
  const creativityWeight = feedbackStrategy.expandLaterally ? 0.18 : 0.15;
  const groundingWeight = feedbackStrategy.expandLaterally ? 0.09 : 0.1;
  const acceptedAlignmentWeight = feedbackStrategy.expandLaterally ? 0.04 : 0.11;
  const rejectedAlignmentWeight = feedbackStrategy.expandLaterally ? 0.22 : 0.16;
  const lateralEscapeWeight = feedbackStrategy.expandLaterally ? 0.11 : 0;

  const total = Number(
    (
      noveltyWeight * novelty +
      diversityWeight * diversity +
      feasibilityWeight * feasibility +
      userFitWeight * userFit +
      creativityWeight * creativity +
      groundingWeight * grounding +
      acceptedAlignmentWeight * acceptedAlignment +
      lateralEscapeWeight * lateralEscape -
      rejectedAlignmentWeight * rejectedAlignment -
      rejectedLanePenalty -
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
    lateralEscape,
    rejectedLanePenalty,
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
