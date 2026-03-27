import { normalizeText, tokenize, unique } from "../schema.js";
import { buildLiteratureIndex, getGraphNeighbors, traceLiteratureQueries } from "../retrieval/literature.js";

const STOPWORDS = new Set([
  "about",
  "across",
  "after",
  "among",
  "around",
  "between",
  "during",
  "from",
  "into",
  "over",
  "through",
  "under",
  "with",
  "without",
  "study",
  "studies",
  "effect",
  "effects",
  "using",
  "based",
  "toward"
]);

function pushQuery(querySpecs, query, label, weight = 1) {
  const text = String(query || "").trim();
  if (!text) {
    return;
  }

  querySpecs.push({
    query: text,
    label,
    weight
  });
}

function dedupeQueries(querySpecs) {
  const seen = new Set();
  return querySpecs.filter((spec) => {
    const key = normalizeText(spec.query);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function extractAdjacentTerms(index, rejectedPaperIds = []) {
  return unique(
    rejectedPaperIds.flatMap((paperId) =>
      getGraphNeighbors(index, paperId, 3).flatMap((neighbor) => [
        ...(neighbor.paper.keywords || []),
        ...tokenize(neighbor.paper.title).filter((term) => term.length > 3)
      ])
    )
  ).slice(0, 4);
}

function extractFocusTerms(paper, queryRefs = []) {
  const keywordTerms = (paper.keywords || []).map((keyword) => String(keyword).trim()).filter(Boolean);
  const titleTerms = tokenize(paper.title)
    .filter((term) => term.length > 3 && !STOPWORDS.has(term))
    .slice(0, 6);
  const queryTerms = queryRefs.flatMap((ref) => tokenize(ref.query).filter((term) => term.length > 3));

  return unique([...keywordTerms, ...queryTerms, ...titleTerms]).slice(0, 4);
}

function buildNeighborhood(index, hit, trace, options = {}) {
  const queryRefs = trace.queries
    .filter((query) => query.hits.some((candidate) => candidate.paper.id === hit.paper.id))
    .map((query) => ({
      label: query.label,
      query: query.query,
      weight: query.weight
    }));
  const neighbors = getGraphNeighbors(index, hit.paper.id, options.neighborLimit || 3);
  const paperIds = unique([hit.paper.id, ...neighbors.map((neighbor) => neighbor.paper.id)]);
  const papers = paperIds.map((paperId) => index.paperMap.get(paperId)).filter(Boolean);
  const focusTerms = extractFocusTerms(hit.paper, queryRefs);

  return {
    id: `literature-map:${hit.paper.id}`,
    anchorPaperId: hit.paper.id,
    anchorTitle: hit.paper.title,
    score: hit.score,
    breadth: hit.breadth,
    queryRefs,
    focusTerms,
    paperIds,
    papers
  };
}

export function buildLiteratureQuerySpecs(state, options = {}) {
  const objects = state.focus?.objects?.length ? state.focus.objects : [state.focus?.domain || "research topic"];
  const keywords = state.constraints?.keywords || [];
  const stakes = state.stakes || [];
  const contrasts = state.contrasts || [];
  const feedbackStrategy = options.feedbackStrategy || state.feedbackStrategy || {};
  const querySpecs = [];

  for (const object of objects) {
    pushQuery(querySpecs, object, "core topic", 1.4);

    if (keywords.length) {
      pushQuery(querySpecs, `${object} ${keywords.slice(0, 4).join(" ")}`, "keywords", 1.15);
    }

    if (stakes.length) {
      pushQuery(querySpecs, `${object} ${stakes.slice(0, 2).join(" ")}`, "stakes", 0.95);
    }

    for (const contrast of contrasts.slice(0, options.contrastQueryLimit || 3)) {
      pushQuery(querySpecs, `${object} ${contrast.comparison}`, `contrast:${contrast.axis}`, 1.1);
    }

    if (feedbackStrategy.expandLaterally) {
      const rejectedComparisons = new Set(feedbackStrategy.rejectedComparisons || []);
      const lateralContrasts = contrasts.filter(
        (contrast) => !rejectedComparisons.has(contrast.comparison)
      );
      for (const contrast of lateralContrasts.slice(0, options.escapeContrastLimit || 2)) {
        pushQuery(querySpecs, `${object} ${contrast.comparison}`, `lateral:${contrast.axis}`, 1.2);
      }

      const adjacentTerms = extractAdjacentTerms(
        options.index,
        feedbackStrategy.rejectedPaperIds || []
      );
      if (adjacentTerms.length) {
        pushQuery(
          querySpecs,
          `${object} ${adjacentTerms.join(" ")}`,
          "adjacent neighborhood",
          1.02
        );
      }

      pushQuery(
        querySpecs,
        `${object} heterogeneity mechanism boundary`,
        "lateral reset",
        0.96
      );
    }
  }

  return dedupeQueries(querySpecs);
}

export function buildLiteratureMap(state, indexInput, options = {}) {
  const index = indexInput?.paperMap ? indexInput : buildLiteratureIndex(indexInput || []);
  const querySpecs =
    options.querySpecs || buildLiteratureQuerySpecs(state, { ...options, index });
  const trace = traceLiteratureQueries(index, querySpecs, {
    perQueryLimit: options.perQueryLimit || 4,
    limit: options.limit || 8,
    strategy: options.strategy || options.searchStrategy || "hybrid"
  });
  const rejectedPaperIds = new Set(options.feedbackStrategy?.rejectedPaperIds || []);
  const neighborhoods = trace.mergedHits
    .map((hit) => buildNeighborhood(index, hit, trace, options))
    .sort((left, right) => {
      const leftPenalty = rejectedPaperIds.has(left.anchorPaperId) ? 1 : 0;
      const rightPenalty = rejectedPaperIds.has(right.anchorPaperId) ? 1 : 0;
      if (leftPenalty !== rightPenalty) {
        return leftPenalty - rightPenalty;
      }
      return right.score - left.score;
    })
    .slice(0, options.anchorLimit || 4);

  return {
    strategy: options.strategy || options.searchStrategy || "hybrid",
    queries: trace.queries.map((query) => ({
      label: query.label,
      query: query.query,
      weight: query.weight,
      topPaperIds: query.hits.slice(0, 3).map((hit) => hit.paper.id)
    })),
    mergedHits: trace.mergedHits,
    neighborhoods,
    uniquePaperCount: trace.uniquePaperCount,
    queryCount: trace.queries.length
  };
}
