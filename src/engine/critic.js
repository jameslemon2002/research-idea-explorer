import { ideaSimilarity } from "./dedupe.js";
import { probeIdeaLiterature } from "./literature-probe.js";

function critiqueIdea(idea, ideas, papers, context = {}) {
  const flags = [];
  let penalty = 0;

  if (!idea.origin?.personaId) {
    flags.push("missing_persona_origin");
    penalty += 0.08;
  }

  if (!idea.origin?.noveltyAngle) {
    flags.push("weak_brainstorm_signal");
    penalty += 0.08;
  }

  if (!idea.contrast?.comparison || String(idea.contrast.comparison).includes("core subgroups")) {
    flags.push("weak_contrast");
    penalty += 0.12;
  }

  const nearestSiblingSimilarity = ideas
    .filter((candidate) => candidate.id !== idea.id)
    .reduce((max, candidate) => Math.max(max, ideaSimilarity(idea, candidate)), 0);

  if (nearestSiblingSimilarity >= 0.84) {
    flags.push("near_duplicate_cluster");
    penalty += 0.14;
  }

  const literatureTrace = idea.literatureTrace || probeIdeaLiterature(idea, papers, context);
  if (literatureTrace.crowdedness >= 0.34) {
    flags.push("crowded_literature");
    penalty += 0.16;
  }

  if (literatureTrace.grounding <= 0.34 || literatureTrace.distinctPaperCount < 2) {
    flags.push("thin_literature_bridge");
    penalty += 0.1;
  }

  if (literatureTrace.breadth <= 0.18) {
    flags.push("single_anchor_dependence");
    penalty += 0.06;
  }

  const parentIdea = (context.referenceIdeas || []).find((candidate) => candidate.id === idea.origin?.parentIdeaId);
  if (parentIdea && ideaSimilarity(idea, parentIdea) >= 0.88) {
    flags.push("mutation_too_close_to_parent");
    penalty += 0.1;
  }

  return {
    flags,
    penalty: Number(Math.min(0.5, penalty).toFixed(3)),
    summary:
      flags.length === 0
        ? "No major template warning detected."
        : `Main critique: ${flags.join(", ")}.`,
    nearestPaperId: literatureTrace.nearestPaperId || null,
    literatureBreadth: literatureTrace.breadth
  };
}

export function critiqueIdeas(ideas, context = {}) {
  const papers = context.papers || [];
  return ideas.map((idea) => {
    const literatureTrace = idea.literatureTrace || probeIdeaLiterature(idea, papers, context);
    const preparedIdea = {
      ...idea,
      literatureTrace
    };

    return {
      ...preparedIdea,
      critique: critiqueIdea(preparedIdea, ideas, papers, context)
    };
  });
}
