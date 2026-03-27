import { brainstormSeeds } from "./brainstorm.js";
import { crystallizeSeeds } from "./crystallize.js";
import { critiqueIdeas } from "./critic.js";
import { dedupeIdeas } from "./dedupe.js";
import { buildLiteratureMap } from "./literature-map.js";
import { buildMutationRound } from "./mutate.js";
import { rankIdeas } from "./scoring.js";
import { buildTopicProfile, createResearchState } from "../schema.js";
import {
  collectAcceptedIdeas,
  collectRejectedIdeas,
  collectVisitedIdeas,
  collectVisitedSignatures,
  createMemoryGraph,
  recordPipelineRun
} from "../memory/graph.js";

function buildFeedbackStrategy(acceptedIdeas = [], rejectedIdeas = []) {
  const acceptedCount = acceptedIdeas.length;
  const rejectedCount = rejectedIdeas.length;
  const rejectedFamilies = [...new Set(rejectedIdeas.map((idea) => idea.familyId).filter(Boolean))];
  const rejectedComparisons = [
    ...new Set(rejectedIdeas.map((idea) => idea.contrast?.comparison).filter(Boolean))
  ];
  const rejectedEvidenceKinds = [
    ...new Set(rejectedIdeas.map((idea) => idea.evidence?.kind).filter(Boolean))
  ];
  const rejectedPaperIds = [
    ...new Set(
      rejectedIdeas
        .map(
          (idea) =>
            idea.scores?.nearestPaperId ||
            idea.critique?.nearestPaperId ||
            idea.literatureTrace?.nearestPaperId ||
            idea.origin?.sourcePaperIds?.[0]
        )
        .filter(Boolean)
    )
  ];
  const hardReset = rejectedCount >= 2 && acceptedCount === 0;
  const lateralExpand = hardReset || (rejectedCount >= 2 && rejectedCount >= acceptedCount);

  return {
    mode: hardReset ? "lateral_reset" : lateralExpand ? "lateral_expand" : acceptedCount ? "deepen" : "default",
    acceptedCount,
    rejectedCount,
    expandLaterally: lateralExpand,
    avoidOverNarrowing: lateralExpand,
    forceExtraRound: hardReset,
    rejectedFamilies,
    rejectedComparisons,
    rejectedEvidenceKinds,
    rejectedPaperIds
  };
}

export function selectFrontierIdeas(rankedIdeas, limit = 6) {
  const selected = [];
  const usedFamilies = new Set();
  const usedContrasts = new Set();
  const usedTitles = new Set();

  while (selected.length < limit) {
    const next =
      rankedIdeas.find((idea) => {
        return (
          !selected.some((candidate) => candidate.id === idea.id) &&
          !usedFamilies.has(idea.familyId || idea.id) &&
          !usedContrasts.has(idea.contrast.comparison) &&
          !usedTitles.has(idea.title)
        );
      }) ||
      rankedIdeas.find(
        (idea) =>
          !selected.some((candidate) => candidate.id === idea.id) &&
          !usedFamilies.has(idea.familyId || idea.id) &&
          !usedTitles.has(idea.title)
      ) ||
      rankedIdeas.find(
        (idea) =>
          !selected.some((candidate) => candidate.id === idea.id) &&
          !usedContrasts.has(idea.contrast.comparison) &&
          !usedTitles.has(idea.title)
      ) ||
      rankedIdeas.find((idea) => !selected.some((candidate) => candidate.id === idea.id) && !usedTitles.has(idea.title)) ||
      rankedIdeas.find((idea) => !selected.some((candidate) => candidate.id === idea.id));

    if (!next) {
      break;
    }

    selected.push(next);
    usedFamilies.add(next.familyId || next.id);
    usedContrasts.add(next.contrast.comparison);
    usedTitles.add(next.title);

    if (selected.length >= limit) {
      continue;
    }
  }

  return selected;
}

export function runIdeaPipeline(input, papers, options = {}) {
  const state = createResearchState(input);
  const memoryGraph = options.memoryGraph || createMemoryGraph();
  const searchStrategy = options.searchStrategy || papers?.options?.defaultStrategy || "hybrid";
  const topicProfile = buildTopicProfile({
    ...input,
    query: options.query || input.query || input.focus?.objects?.join(" ")
  });
  const memoryScope = options.memoryScope || "topic";
  const memoryScopeOptions = {
    scope: memoryScope,
    topicProfile,
    threshold: options.memoryTopicThreshold
  };
  const memoryVisitedIdeas = options.visitedIdeas || collectVisitedIdeas(memoryGraph, memoryScopeOptions);
  const memoryAcceptedIdeas = options.acceptedIdeas || collectAcceptedIdeas(memoryGraph, memoryScopeOptions);
  const memoryRejectedIdeas = options.rejectedIdeas || collectRejectedIdeas(memoryGraph, memoryScopeOptions);
  const feedbackStrategy =
    options.feedbackStrategy || buildFeedbackStrategy(memoryAcceptedIdeas, memoryRejectedIdeas);
  const requestedRounds = Number(options.rounds || 0);
  const effectiveRounds =
    requestedRounds >= 1
      ? Math.min(2, requestedRounds)
      : memoryAcceptedIdeas.length || feedbackStrategy.forceExtraRound
        ? 2
        : 1;
  state.topicProfile = topicProfile;
  state.feedbackStrategy = feedbackStrategy;
  state.visitedSignatures = [
    ...new Set([...state.visitedSignatures, ...collectVisitedSignatures(memoryGraph, memoryScopeOptions)])
  ];
  state.acceptedIdeas = [...state.acceptedIdeas, ...memoryAcceptedIdeas];
  state.rejectedIdeas = [...state.rejectedIdeas, ...memoryRejectedIdeas];
  state.history = [...state.history, ...memoryVisitedIdeas];
  const literatureMap = buildLiteratureMap(state, papers, {
    strategy: searchStrategy,
    feedbackStrategy,
    limit: options.literatureMapLimit || (feedbackStrategy.expandLaterally ? 10 : 8),
    anchorLimit: options.literatureAnchorLimit || (feedbackStrategy.expandLaterally ? 5 : 4),
    perQueryLimit: options.literaturePerQueryLimit || (feedbackStrategy.expandLaterally ? 5 : 4)
  });
  const initialSeeds = brainstormSeeds(state, papers, {
    ...options,
    feedbackStrategy,
    literatureMap,
    limit: options.initialSeedLimit || options.limit || (feedbackStrategy.expandLaterally ? 42 : 36)
  });
  const initialRawIdeas = crystallizeSeeds(initialSeeds, state, {
    ...options,
    limit: options.initialIdeaLimit || 96
  });
  const initialDedupedIdeas = dedupeIdeas(initialRawIdeas, options.initialDedupeThreshold || 0.72);
  const initialCritiquedIdeas = critiqueIdeas(initialDedupedIdeas, {
    state,
    papers,
    literatureMap,
    searchStrategy
  });
  const initialRankedIdeas = rankIdeas(initialCritiquedIdeas, {
    state,
    papers,
    visitedIdeas: memoryVisitedIdeas,
    acceptedIdeas: memoryAcceptedIdeas,
    rejectedIdeas: memoryRejectedIdeas,
    literatureMap,
    feedbackStrategy,
    searchStrategy
  });
  const firstFocus = selectFrontierIdeas(
    initialRankedIdeas,
    effectiveRounds >= 2
      ? options.intermediateFrontierLimit || (feedbackStrategy.expandLaterally ? 5 : 4)
      : options.frontierLimit || 6
  );
  const mutationRound =
    effectiveRounds >= 2
      ? buildMutationRound(firstFocus, state, papers, {
          feedbackStrategy,
          strategy: searchStrategy,
          perQueryLimit: options.mutationPerQueryLimit || (feedbackStrategy.expandLaterally ? 5 : 4),
          limit: options.mutationLiteratureLimit || (feedbackStrategy.expandLaterally ? 8 : 6),
          ideaLimit: options.mutationIdeaLimit || firstFocus.length
        })
      : {
          seeds: [],
          traces: []
        };
  const mutationRawIdeas =
    effectiveRounds >= 2
      ? crystallizeSeeds(mutationRound.seeds, state, {
          ...options,
          limit: options.mutationCardLimit || 96
        })
      : [];
  const combinedRawIdeas = effectiveRounds >= 2 ? [...firstFocus, ...mutationRawIdeas] : initialRawIdeas;
  const dedupedIdeas =
    effectiveRounds >= 2
      ? dedupeIdeas(combinedRawIdeas, options.finalDedupeThreshold || 0.74)
      : initialDedupedIdeas;
  const critiquedIdeas =
    effectiveRounds >= 2
      ? critiqueIdeas(dedupedIdeas, {
          state,
          papers,
          literatureMap,
          referenceIdeas: firstFocus,
          searchStrategy
        })
      : initialCritiquedIdeas;
  const rankedIdeas =
    effectiveRounds >= 2
      ? rankIdeas(critiquedIdeas, {
          state,
          papers,
          visitedIdeas: memoryVisitedIdeas,
          acceptedIdeas: memoryAcceptedIdeas,
          rejectedIdeas: memoryRejectedIdeas,
          literatureMap,
          feedbackStrategy,
          searchStrategy
        })
      : initialRankedIdeas;
  const frontier = effectiveRounds >= 2 ? selectFrontierIdeas(rankedIdeas, options.frontierLimit || 6) : firstFocus;
  state.frontier = frontier.map((idea) => idea.id);
  const allBrainstormSeeds = [...initialSeeds, ...mutationRound.seeds];

  recordPipelineRun(
    memoryGraph,
    {
      query: options.query,
      state,
      feedbackStrategy,
      topicProfile,
      rankedIdeas,
      frontier,
      paperIndex: papers,
      literatureMap,
      stages: {
        initial: {
          queryCount: literatureMap.queryCount,
          seedCount: initialSeeds.length,
          rankedCount: initialRankedIdeas.length
        },
        firstFocus: {
          ideaIds: firstFocus.map((idea) => idea.id)
        },
        mutation:
          effectiveRounds >= 2
            ? {
                seedCount: mutationRound.seeds.length,
                traceCount: mutationRound.traces.length
              }
            : null,
        final: {
          rankedCount: rankedIdeas.length
        },
        rounds: effectiveRounds
      }
    },
    options.memoryOptions || {}
  );

  return {
    state,
    feedbackStrategy,
    topicProfile,
    memoryScope,
    literatureMap,
    effectiveRounds,
    rounds: {
      initial: {
        brainstormSeeds: initialSeeds,
        rawIdeas: initialRawIdeas,
        dedupedIdeas: initialDedupedIdeas,
        rankedIdeas: initialRankedIdeas
      },
      firstFocus: {
        frontier: firstFocus
      },
      mutation: mutationRound,
      final: {
        rankedIdeas
      }
    },
    brainstormSeeds: allBrainstormSeeds,
    rawIdeas: combinedRawIdeas,
    dedupedIdeas,
    rankedIdeas,
    frontier,
    memoryGraph
  };
}
