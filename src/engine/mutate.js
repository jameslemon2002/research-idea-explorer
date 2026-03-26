import { createBrainstormSeed, tokenize, unique } from "../schema.js";
import { traceLiteratureQueries } from "../retrieval/literature.js";

const PUZZLE_MUTATIONS = {
  blind_spot: ["distortion", "boundary_unknown"],
  conflict: ["mechanism_unknown", "boundary_unknown"],
  distortion: ["boundary_unknown", "conflict"],
  mechanism_unknown: ["conflict", "leverage_unknown"],
  boundary_unknown: ["distortion", "mechanism_unknown"],
  leverage_unknown: ["mechanism_unknown", "boundary_unknown"]
};

const CLAIM_MUTATIONS = {
  describe: ["measure", "compare"],
  measure: ["compare", "critique"],
  compare: ["identify", "explain"],
  explain: ["identify", "compare"],
  identify: ["explain", "intervene"],
  predict: ["compare", "identify"],
  intervene: ["design", "identify"],
  design: ["intervene", "compare"],
  critique: ["measure", "compare"]
};

const EVIDENCE_HINT_PATTERNS = [
  { pattern: /(survey|questionnaire|respondent)/i, kind: "survey" },
  { pattern: /(administrative|registry|record|claims data|institutional)/i, kind: "administrative_data" },
  { pattern: /(interview|ethnograph|fieldnote|process tracing)/i, kind: "interviews" },
  { pattern: /(archive|historical|policy document)/i, kind: "archive" },
  { pattern: /(sensor|satellite|remote sensing|mobility)/i, kind: "sensor_data" },
  { pattern: /(experiment|randomized|lab study)/i, kind: "experiment" },
  { pattern: /(trial|pilot|field test|rollout)/i, kind: "field_trial" },
  { pattern: /(simulation|agent based|scenario model)/i, kind: "simulation" },
  { pattern: /(prototype|tool|interface|workflow)/i, kind: "prototype" },
  { pattern: /(text|corpus|transcript|discourse|language)/i, kind: "text_corpus" }
];

function buildMutationQuerySpecs(idea, state, paperMap) {
  const keywords = state.constraints?.keywords || [];
  const anchorPaper =
    paperMap.get(idea.scores?.nearestPaperId) ||
    paperMap.get(idea.critique?.nearestPaperId) ||
    paperMap.get(idea.origin?.sourcePaperIds?.[0]);
  const queries = [
    {
      label: "family contrast",
      query: `${idea.object} ${idea.contrast.comparison}`,
      weight: 1.3
    },
    {
      label: "family puzzle",
      query: `${idea.object} ${idea.puzzle.label} ${idea.claim.label}`,
      weight: 1.15
    }
  ];

  if (keywords.length) {
    queries.push({
      label: "family keywords",
      query: `${idea.object} ${keywords.slice(0, 3).join(" ")}`,
      weight: 0.95
    });
  }

  if (anchorPaper?.keywords?.length) {
    queries.push({
      label: "adjacent literature",
      query: `${idea.object} ${anchorPaper.keywords.slice(0, 3).join(" ")}`,
      weight: 0.9
    });
  }

  queries.push({
    label: "evidence probe",
    query: `${idea.object} ${idea.evidence.kind.replace(/_/g, " ")}`,
    weight: 0.8
  });

  return queries;
}

function inferEvidenceHints(trace, fallback = []) {
  const inferred = [];

  for (const hit of trace.mergedHits || []) {
    const text = [hit.paper.title, hit.paper.abstract, ...(hit.paper.keywords || [])].join(" ");
    for (const candidate of EVIDENCE_HINT_PATTERNS) {
      if (candidate.pattern.test(text)) {
        inferred.push(candidate.kind);
      }
    }
  }

  return unique([...fallback, ...inferred]).slice(0, 4);
}

function selectMutationContrast(idea, state, index = 0) {
  const alternatives = (state.contrasts || []).filter(
    (contrast) => contrast.comparison !== idea.contrast?.comparison
  );

  return alternatives[index % Math.max(alternatives.length, 1)] || idea.contrast;
}

function extractFocusTerms(trace) {
  return unique(
    (trace.mergedHits || [])
      .flatMap((hit) => [...(hit.paper.keywords || []), ...tokenize(hit.paper.title)])
      .filter((term) => String(term || "").length > 3)
  ).slice(0, 4);
}

function dedupeContrasts(contrasts = []) {
  const seen = new Set();
  return contrasts.filter((contrast) => {
    const key = `${contrast?.axis || "comparison"}|${contrast?.comparison || ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function buildMutationRound(frontier, state, papers, options = {}) {
  const paperList = Array.isArray(papers) ? papers : papers?.papers || [];
  const paperMap = new Map(paperList.map((paper) => [paper.id, paper]));
  const seeds = [];
  const traces = [];
  const targetIdeas = frontier.slice(0, options.ideaLimit || 4);

  for (const [ideaIndex, idea] of targetIdeas.entries()) {
    const literatureQueries = buildMutationQuerySpecs(idea, state, paperMap);
    const trace = traceLiteratureQueries(papers, literatureQueries, {
      perQueryLimit: options.perQueryLimit || 4,
      limit: options.limit || 6,
      strategy: options.strategy || "hybrid"
    });
    const sourcePaperIds = trace.mergedHits.slice(0, 3).map((hit) => hit.paper.id);
    const focusTerms = extractFocusTerms(trace);
    const evidenceHints = inferEvidenceHints(trace, [
      idea.evidence.kind,
      ...(state.constraints?.evidenceKinds || [])
    ]);
    const mutationContrast = selectMutationContrast(idea, state, ideaIndex);
    const anchorTitle = trace.mergedHits[0]?.paper?.title || idea.title;
    const persona = {
      id: idea.origin?.personaId || "literature_mutation",
      label: idea.origin?.personaLabel || "Literature Mutation"
    };
    const suggestedPuzzles = unique([idea.puzzle.id, ...(PUZZLE_MUTATIONS[idea.puzzle.id] || [])]);
    const suggestedClaims = unique([idea.claim.id, ...(CLAIM_MUTATIONS[idea.claim.id] || [])]);

    traces.push({
      ideaId: idea.id,
      familyId: idea.familyId,
      queries: trace.queries.map((query) => ({
        label: query.label,
        query: query.query,
        topPaperIds: query.hits.slice(0, 3).map((hit) => hit.paper.id)
      })),
      topPaperIds: sourcePaperIds
    });

    seeds.push(
      createBrainstormSeed({
        persona,
        object: idea.object,
        hook: `A second-pass search around "${anchorTitle}" suggests the live disagreement may sit in ${mutationContrast.comparison}, not only ${idea.contrast.comparison}.`,
        pivot: `branch the first-pass family by following adjacent literature rather than polishing the original framing`,
        questionStem: `What changes if ${idea.object} is reopened through ${mutationContrast.comparison} rather than ${idea.contrast.comparison}?`,
        noveltyAngle: `Use a second literature pass to shift the project toward a neighboring contrast that the first round did not foreground.`,
        suggestedPuzzles,
        suggestedClaims,
        contrastSuggestions: dedupeContrasts([mutationContrast, idea.contrast, ...(state.contrasts || [])]),
        evidenceHints,
        sourcePaperIds,
        literatureQueries,
        focusTerms,
        round: "mutation",
        stage: "mutate",
        parentIdeaId: idea.id,
        tags: [state.focus?.domain, idea.familyId, "mutation_contrast"]
      })
    );

    seeds.push(
      createBrainstormSeed({
        persona,
        object: idea.object,
        hook: `The papers adjacent to "${anchorTitle}" point to ${focusTerms.join(", ") || "a different evidence base"} as the sharper way to reopen the ${idea.puzzle.label.toLowerCase()} question.`,
        pivot: `change the evidence bridge and mechanism target instead of staying inside the same empirical template`,
        questionStem: `Which ${idea.puzzle.label.toLowerCase()} question about ${idea.object} becomes newly testable once the literature around ${focusTerms.join(", ") || anchorTitle} is taken seriously?`,
        noveltyAngle: `Follow the adjacent literature to mutate the evidence bridge and empirical mechanism, not just the wording of the idea.`,
        suggestedPuzzles: unique([idea.puzzle.id, "mechanism_unknown", "distortion"]),
        suggestedClaims: unique([idea.claim.id, "explain", "measure"]),
        contrastSuggestions: dedupeContrasts([idea.contrast, mutationContrast, ...(state.contrasts || [])]),
        evidenceHints,
        sourcePaperIds,
        literatureQueries,
        focusTerms,
        round: "mutation",
        stage: "mutate",
        parentIdeaId: idea.id,
        tags: [state.focus?.domain, idea.familyId, idea.id, "mutation_evidence"]
      })
    );
  }

  return {
    seeds,
    traces
  };
}
