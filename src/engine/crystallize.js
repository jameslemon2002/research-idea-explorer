import { EVIDENCE_LIBRARY, getClaim, getPuzzle } from "../domain/taxonomy.js";
import { buildIdeaTitle } from "../idea-language.js";
import { createIdeaCard } from "../schema.js";

function compatibleClaims(seed, state) {
  const preferredClaims = state.constraints?.preferredClaims || [];
  const candidateIds = preferredClaims.length
    ? seed.suggestedClaims.filter((id) => preferredClaims.includes(id))
    : seed.suggestedClaims;
  const finalIds = candidateIds.length ? candidateIds : seed.suggestedClaims;
  return finalIds.slice(0, 2).map(getClaim).filter(Boolean);
}

function compatiblePuzzles(seed, state) {
  const preferredPuzzles = state.constraints?.preferredPuzzles || [];
  const candidateIds = preferredPuzzles.length
    ? seed.suggestedPuzzles.filter((id) => preferredPuzzles.includes(id))
    : seed.suggestedPuzzles;
  const finalIds = candidateIds.length ? candidateIds : seed.suggestedPuzzles;
  return finalIds.slice(0, 2).map(getPuzzle).filter(Boolean);
}

function selectEvidenceKinds(seed, claim, state) {
  const preferred = state.constraints?.evidenceKinds || [];
  const overlap = claim.defaultEvidence.filter(
    (kind) => seed.evidenceHints.includes(kind) && (!preferred.length || preferred.includes(kind))
  );

  if (overlap.length) {
    return overlap.slice(0, 2);
  }

  const fallback = claim.defaultEvidence.filter((kind) => !preferred.length || preferred.includes(kind));
  return (fallback.length ? fallback : claim.defaultEvidence).slice(0, 2);
}

function buildTitle(seed, puzzle, claim, contrast) {
  return buildIdeaTitle({
    object: seed.object,
    puzzle,
    claim,
    contrast
  });
}

function buildRationale(seed, puzzle, claim, contrast, evidence, state) {
  return [
    seed.hook,
    seed.noveltyAngle,
    `The structured move is to treat this as a ${puzzle.label.toLowerCase()} problem and ${claim.outcome}.`,
    `The key contrast is ${contrast.comparison}.`,
    `A practical starting point is ${EVIDENCE_LIBRARY[evidence.kind] || evidence.detail}.`,
    `The main stakes are ${(state.stakes || []).join(", ")}.`
  ].join(" ");
}

export function crystallizeSeeds(brainstormSeeds, state, options = {}) {
  const ideas = [];

  for (const seed of brainstormSeeds) {
    const puzzles = compatiblePuzzles(seed, state);
    const claims = compatibleClaims(seed, state);
    const contrasts = (seed.contrastSuggestions || state.contrasts || []).slice(0, 2);

    for (const puzzle of puzzles) {
      for (const claim of claims) {
        for (const contrast of contrasts) {
          for (const evidenceKind of selectEvidenceKinds(seed, claim, state)) {
            const evidence = {
              kind: evidenceKind,
              detail: EVIDENCE_LIBRARY[evidenceKind]
            };

            ideas.push(
              createIdeaCard({
                object: seed.object,
                puzzle,
                claim,
                contrast,
                evidence,
                scope: state.scope,
                stakes: state.stakes,
                title: buildTitle(seed, puzzle, claim, contrast),
                rationale: buildRationale(seed, puzzle, claim, contrast, evidence, state),
                tags: [state.focus?.domain, seed.persona.id, puzzle.id, claim.id, evidenceKind],
                origin: {
                  seedId: seed.id,
                  personaId: seed.persona.id,
                  personaLabel: seed.persona.label,
                  noveltyAngle: seed.noveltyAngle,
                  sourcePaperIds: seed.sourcePaperIds
                }
              })
            );
          }
        }
      }
    }
  }

  return ideas.slice(0, options.limit || 64);
}
