import { resolvePersonas } from "../domain/personas.js";
import { createBrainstormSeed } from "../schema.js";
import { searchLiterature } from "../retrieval/literature.js";

function pickContrasts(state, options = {}) {
  if (state.contrasts?.length) {
    const feedbackStrategy = options.feedbackStrategy || state.feedbackStrategy || {};
    const rejectedComparisons = new Set(feedbackStrategy.rejectedComparisons || []);
    const rejectedAxes = new Set(
      (state.rejectedIdeas || []).map((idea) => idea.contrast?.axis).filter(Boolean)
    );
    const ordered = [...state.contrasts].sort((left, right) => {
      const leftPenalty =
        (rejectedComparisons.has(left.comparison) ? 2 : 0) +
        (rejectedAxes.has(left.axis) ? 1 : 0);
      const rightPenalty =
        (rejectedComparisons.has(right.comparison) ? 2 : 0) +
        (rejectedAxes.has(right.axis) ? 1 : 0);
      return leftPenalty - rightPenalty;
    });

    return ordered.slice(0, 3);
  }

  return [{ axis: "default", comparison: "core subgroups and time periods" }];
}

function filterEvidenceBias(persona, state) {
  const preferred = state.constraints?.evidenceKinds || [];
  if (!preferred.length) {
    return persona.evidenceBias;
  }

  const overlap = persona.evidenceBias.filter((kind) => preferred.includes(kind));
  return overlap.length ? overlap : preferred.slice(0, 3);
}

function selectAnchorPaper(object, state, papers) {
  if (!papers?.length) {
    return null;
  }

  const query = `${object} ${state.constraints?.keywords?.join(" ") || ""}`.trim();
  return searchLiterature(papers, query, 1)[0]?.paper || null;
}

function selectLiteratureContexts(state, papers, options = {}) {
  const neighborhoods = options.literatureMap?.neighborhoods || [];
  if (neighborhoods.length) {
    const rejectedPaperIds = new Set(options.feedbackStrategy?.rejectedPaperIds || []);
    return [...neighborhoods].sort((left, right) => {
      const leftPenalty = rejectedPaperIds.has(left.anchorPaperId) ? 1 : 0;
      const rightPenalty = rejectedPaperIds.has(right.anchorPaperId) ? 1 : 0;
      return leftPenalty - rightPenalty;
    });
  }

  const objects = state.focus?.objects || [];
  return objects
    .map((object) => {
      const anchorPaper = selectAnchorPaper(object, state, papers);
      if (!anchorPaper) {
        return null;
      }

      return {
        id: `anchor:${anchorPaper.id}`,
        anchorPaperId: anchorPaper.id,
        anchorTitle: anchorPaper.title,
        paperIds: [anchorPaper.id],
        focusTerms: anchorPaper.keywords || [],
        queryRefs: [
          {
            label: "anchor",
            query: `${object} ${state.constraints?.keywords?.join(" ") || ""}`.trim(),
            weight: 1
          }
        ]
      };
    })
    .filter(Boolean);
}

export function brainstormSeeds(state, papers, options = {}) {
  const objects = state.focus?.objects || [];
  const personas = resolvePersonas(options.personaIds || state.constraints?.personaIds || []);
  const contrasts = pickContrasts(state, options);
  const literatureContexts = selectLiteratureContexts(state, papers, options);
  const seeds = [];

  for (const object of objects) {
    for (const [personaIndex, persona] of personas.entries()) {
      const literatureContext =
        literatureContexts[(seeds.length + personaIndex) % Math.max(literatureContexts.length, 1)] || null;
      const contrast = contrasts[seeds.length % contrasts.length];
      const seeded = persona.buildSeed({
        object,
        contrast,
        anchorTitle: literatureContext?.anchorTitle || null
      });

      seeds.push(
        createBrainstormSeed({
          persona,
          object,
          hook: seeded.hook,
          pivot: seeded.pivot,
          questionStem: seeded.questionStem,
          noveltyAngle: seeded.noveltyAngle,
          suggestedPuzzles: persona.preferredPuzzles,
          suggestedClaims: persona.preferredClaims,
          contrastSuggestions: contrasts,
          evidenceHints: filterEvidenceBias(persona, state),
          sourcePaperIds: literatureContext?.paperIds?.slice(0, 3) || [],
          literatureQueries: literatureContext?.queryRefs || [],
          focusTerms: literatureContext?.focusTerms || [],
          round: "initial",
          stage: "diverge",
          tags: [state.focus?.domain, object, persona.id, literatureContext?.id]
        })
      );
    }
  }

  return seeds.slice(0, options.limit || 36);
}
