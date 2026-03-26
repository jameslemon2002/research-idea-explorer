import { brainstormSeeds } from "./brainstorm.js";
import { crystallizeSeeds } from "./crystallize.js";
import { critiqueIdeas } from "./critic.js";
import { dedupeIdeas } from "./dedupe.js";
import { rankIdeas } from "./scoring.js";
import { createResearchState } from "../schema.js";
import {
  collectAcceptedIdeas,
  collectRejectedIdeas,
  collectVisitedIdeas,
  collectVisitedSignatures,
  createMemoryGraph,
  recordPipelineRun
} from "../memory/graph.js";

export function selectFrontierIdeas(rankedIdeas, limit = 6) {
  const selected = [];
  const usedPersonas = new Set();
  const usedContrasts = new Set();

  while (selected.length < limit) {
    const next =
      rankedIdeas.find((idea) => {
        const personaId = idea.origin?.personaId || "unknown";
        return (
          !selected.some((candidate) => candidate.id === idea.id) &&
          !usedPersonas.has(personaId) &&
          !usedContrasts.has(idea.contrast.comparison)
        );
      }) ||
      rankedIdeas.find((idea) => {
        const personaId = idea.origin?.personaId || "unknown";
        return !selected.some((candidate) => candidate.id === idea.id) && !usedPersonas.has(personaId);
      }) ||
      rankedIdeas.find(
        (idea) =>
          !selected.some((candidate) => candidate.id === idea.id) &&
          !usedContrasts.has(idea.contrast.comparison)
      ) ||
      rankedIdeas.find((idea) => !selected.some((candidate) => candidate.id === idea.id));

    if (!next) {
      break;
    }

    selected.push(next);
    usedPersonas.add(next.origin?.personaId || "unknown");
    usedContrasts.add(next.contrast.comparison);

    if (selected.length >= limit) {
      continue;
    }
  }

  return selected;
}

export function runIdeaPipeline(input, papers, options = {}) {
  const state = createResearchState(input);
  const memoryGraph = options.memoryGraph || createMemoryGraph();
  const memoryVisitedIdeas = options.visitedIdeas || collectVisitedIdeas(memoryGraph);
  const memoryAcceptedIdeas = options.acceptedIdeas || collectAcceptedIdeas(memoryGraph);
  const memoryRejectedIdeas = options.rejectedIdeas || collectRejectedIdeas(memoryGraph);
  state.visitedSignatures = [...new Set([...state.visitedSignatures, ...collectVisitedSignatures(memoryGraph)])];
  state.acceptedIdeas = [...state.acceptedIdeas, ...memoryAcceptedIdeas];
  state.rejectedIdeas = [...state.rejectedIdeas, ...memoryRejectedIdeas];
  state.history = [...state.history, ...memoryVisitedIdeas];
  const seeds = brainstormSeeds(state, papers, options);
  const rawIdeas = crystallizeSeeds(seeds, state, options);
  const dedupedIdeas = dedupeIdeas(rawIdeas);
  const critiquedIdeas = critiqueIdeas(dedupedIdeas, {
    state,
    papers
  });
  const rankedIdeas = rankIdeas(critiquedIdeas, {
    state,
    papers,
    visitedIdeas: memoryVisitedIdeas,
    acceptedIdeas: memoryAcceptedIdeas,
    rejectedIdeas: memoryRejectedIdeas
  });
  const frontier = selectFrontierIdeas(rankedIdeas, options.frontierLimit || 6);

  recordPipelineRun(
    memoryGraph,
    {
      query: options.query,
      state,
      rankedIdeas,
      frontier,
      paperIndex: papers
    },
    options.memoryOptions || {}
  );

  return {
    state,
    brainstormSeeds: seeds,
    rawIdeas,
    dedupedIdeas,
    rankedIdeas,
    frontier,
    memoryGraph
  };
}
