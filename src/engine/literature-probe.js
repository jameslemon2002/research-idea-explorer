import { traceLiteratureQueries } from "../retrieval/literature.js";

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function resolvePaperMap(papers) {
  const paperList = Array.isArray(papers) ? papers : papers?.papers || [];
  return new Map(paperList.map((paper) => [paper.id, paper]));
}

export function buildIdeaLiteratureQueries(idea, context = {}) {
  const keywords = context.state?.constraints?.keywords || [];
  const paperMap = resolvePaperMap(context.papers || []);
  const anchorPaper =
    paperMap.get(idea.origin?.sourcePaperIds?.[0]) ||
    paperMap.get(idea.scores?.nearestPaperId) ||
    paperMap.get(idea.critique?.nearestPaperId);
  const queries = [
    {
      label: "title probe",
      query: idea.title,
      weight: 1.3
    },
    {
      label: "contrast probe",
      query: `${idea.object} ${idea.contrast.comparison}`,
      weight: 1.15
    },
    {
      label: "problem probe",
      query: `${idea.object} ${idea.puzzle.label} ${idea.claim.label}`,
      weight: 1.05
    }
  ];

  if (keywords.length) {
    queries.push({
      label: "keyword probe",
      query: `${idea.object} ${keywords.slice(0, 3).join(" ")}`,
      weight: 0.9
    });
  }

  if (anchorPaper?.keywords?.length) {
    queries.push({
      label: "anchor probe",
      query: `${idea.object} ${anchorPaper.keywords.slice(0, 3).join(" ")}`,
      weight: 0.85
    });
  }

  return queries;
}

export function probeIdeaLiterature(idea, papers, context = {}) {
  const trace = traceLiteratureQueries(papers, buildIdeaLiteratureQueries(idea, context), {
    perQueryLimit: context.perQueryLimit || 4,
    limit: context.limit || 6,
    strategy: context.strategy || context.searchStrategy || "hybrid"
  });
  const topHits = trace.mergedHits.slice(0, 3);
  const directOverlap = topHits[0]?.score || 0;
  const crowdedness = average(topHits.map((hit) => hit.score));
  const breadth = average(topHits.map((hit) => hit.breadth));
  const distinctPaperCount = trace.uniquePaperCount;
  const linkedPaperIds = new Set(idea.origin?.sourcePaperIds || []);
  const anchorAlignment = topHits.some((hit) => linkedPaperIds.has(hit.paper.id)) ? 1 : 0;
  const grounding = Math.min(1, 0.45 * breadth + 0.35 * Math.min(1, distinctPaperCount / 4) + 0.2 * anchorAlignment);

  return {
    queries: trace.queries.map((query) => ({
      label: query.label,
      query: query.query,
      topPaperIds: query.hits.slice(0, 3).map((hit) => hit.paper.id)
    })),
    mergedHits: trace.mergedHits,
    directOverlap: Number(directOverlap.toFixed(3)),
    crowdedness: Number(crowdedness.toFixed(3)),
    breadth: Number(breadth.toFixed(3)),
    distinctPaperCount,
    grounding: Number(grounding.toFixed(3)),
    nearestPaper: topHits[0]?.paper || null,
    nearestPaperId: topHits[0]?.paper?.id || null
  };
}

export function attachLiteratureProbes(ideas, papers, context = {}) {
  return ideas.map((idea) => ({
    ...idea,
    literatureTrace: idea.literatureTrace || probeIdeaLiterature(idea, papers, context)
  }));
}
