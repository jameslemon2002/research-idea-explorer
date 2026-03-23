import { ideaSimilarity } from "./dedupe.js";
import { ideaToText } from "../schema.js";
import { scoreIdeaAgainstLiterature } from "../retrieval/literature.js";

function critiqueIdea(idea, ideas, papers) {
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

  const literatureMatch = scoreIdeaAgainstLiterature(ideaToText(idea), papers);
  if (literatureMatch.overlap >= 0.38) {
    flags.push("crowded_literature");
    penalty += 0.16;
  }

  return {
    flags,
    penalty: Number(Math.min(0.5, penalty).toFixed(3)),
    summary:
      flags.length === 0
        ? "No major template warning detected."
        : `Main critique: ${flags.join(", ")}.`,
    nearestPaperId: literatureMatch.nearestPaper?.id || null
  };
}

export function critiqueIdeas(ideas, context = {}) {
  const papers = context.papers || [];
  return ideas.map((idea) => ({
    ...idea,
    critique: critiqueIdea(idea, ideas, papers)
  }));
}

