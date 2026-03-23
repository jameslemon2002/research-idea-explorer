function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const ANALOGY_PATTERNS = [
  "a queueing bottleneck rather than a simple capacity shortfall",
  "a feedback control problem rather than a static allocation problem",
  "a triage protocol rather than a universal service problem",
  "a signal detection problem rather than a pure information deficit",
  "a threshold effect rather than a smooth linear response"
];

function pickAnalogyPattern(object) {
  const clean = normalize(object);
  const score = [...clean].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return ANALOGY_PATTERNS[score % ANALOGY_PATTERNS.length];
}

export const PERSONAS = [
  {
    id: "anomaly_hunter",
    label: "Anomaly Hunter",
    principle: "Start from a stubborn fact that the dominant story does not explain.",
    preferredPuzzles: ["conflict", "mechanism_unknown"],
    preferredClaims: ["explain", "identify", "compare"],
    evidenceBias: ["administrative_data", "experiment", "case_study"],
    buildSeed({ object, anchorTitle, contrast }) {
      return {
        hook: `Widely repeated claims about ${object} may break once ${contrast.comparison} is examined closely.`,
        pivot: `look for a mismatch between the dominant account and what ${contrast.comparison} reveals`,
        questionStem: `Which accepted story about ${object} stops making sense when ${contrast.comparison} is compared?`,
        noveltyAngle: `Treat ${object} as a contradiction to explain rather than a settled success story.`,
        anchorNote: anchorTitle ? `Nearest literature anchor: ${anchorTitle}.` : ""
      };
    }
  },
  {
    id: "assumption_breaker",
    label: "Assumption Breaker",
    principle: "Replace a quiet background assumption with a deliberately hostile alternative.",
    preferredPuzzles: ["conflict", "leverage_unknown", "boundary_unknown"],
    preferredClaims: ["critique", "design", "compare"],
    evidenceBias: ["archive", "text_corpus", "case_study"],
    buildSeed({ object, contrast }) {
      return {
        hook: `Most work on ${object} assumes the main constraint is obvious, but ${contrast.comparison} suggests otherwise.`,
        pivot: `replace the default assumption about ${object} with a harder alternative explanation`,
        questionStem: `What if ${object} is constrained less by scarcity and more by hidden rules exposed by ${contrast.comparison}?`,
        noveltyAngle: `Break a default assumption and force the project to ask what everyone else is taking for granted.`,
        anchorNote: ""
      };
    }
  },
  {
    id: "measurement_skeptic",
    label: "Measurement Skeptic",
    principle: "Assume the key variable is being measured in a misleading way.",
    preferredPuzzles: ["distortion", "boundary_unknown"],
    preferredClaims: ["measure", "compare", "critique"],
    evidenceBias: ["sensor_data", "survey", "text_corpus"],
    buildSeed({ object, contrast, anchorTitle }) {
      return {
        hook: `The main metric used to study ${object} may hide the very difference that ${contrast.comparison} puts on the table.`,
        pivot: `treat the core variable as mismeasured rather than missing`,
        questionStem: `When do official measures of ${object} diverge from what ${contrast.comparison} actually captures?`,
        noveltyAngle: `Recast ${object} as a representation problem instead of a simple evidence problem.`,
        anchorNote: anchorTitle ? `Nearest literature anchor: ${anchorTitle}.` : ""
      };
    }
  },
  {
    id: "failure_miner",
    label: "Failure Miner",
    principle: "Start from breakdowns, reversals, and negative outcomes instead of successes.",
    preferredPuzzles: ["leverage_unknown", "mechanism_unknown", "conflict"],
    preferredClaims: ["identify", "intervene", "explain"],
    evidenceBias: ["field_trial", "administrative_data", "interviews"],
    buildSeed({ object, contrast }) {
      return {
        hook: `The most interesting thing about ${object} may be where it fails, stalls, or backfires under ${contrast.comparison}.`,
        pivot: `elevate failures and reversals from edge cases to the main research target`,
        questionStem: `Under what conditions does ${object} fail exactly where ${contrast.comparison} should have made it work best?`,
        noveltyAngle: `Mine failures and backfires rather than polishing a best-case account.`,
        anchorNote: ""
      };
    }
  },
  {
    id: "boundary_mapper",
    label: "Boundary Mapper",
    principle: "Find where a known claim stops traveling across people, places, times, or scales.",
    preferredPuzzles: ["boundary_unknown", "conflict"],
    preferredClaims: ["compare", "predict", "identify"],
    evidenceBias: ["administrative_data", "survey", "observational_data"],
    buildSeed({ object, contrast }) {
      return {
        hook: `Current findings about ${object} may look stable only because ${contrast.comparison} has not been used to map the edges.`,
        pivot: `shift the question from average effects to where claims stop holding`,
        questionStem: `For whom, where, or when do standard explanations of ${object} fail once ${contrast.comparison} is traced?`,
        noveltyAngle: `Push the project toward boundary conditions instead of average-case claims.`,
        anchorNote: ""
      };
    }
  },
  {
    id: "analogy_transfer",
    label: "Analogy Transfer",
    principle: "Import a problem structure from a distant field without copying its surface vocabulary.",
    preferredPuzzles: ["mechanism_unknown", "distortion", "leverage_unknown"],
    preferredClaims: ["design", "explain", "measure"],
    evidenceBias: ["simulation", "prototype", "text_corpus"],
    buildSeed({ object, contrast }) {
      const analogy = pickAnalogyPattern(object);
      return {
        hook: `Try treating ${object} like ${analogy}.`,
        pivot: `translate ${object} into a distant problem structure revealed by ${contrast.comparison}`,
        questionStem: `What changes if ${object} is approached like ${analogy} when ${contrast.comparison} is the key contrast?`,
        noveltyAngle: `Import a distant causal structure so the project changes shape rather than just topic.`,
        anchorNote: ""
      };
    }
  }
];

export function getPersona(id) {
  return PERSONAS.find((persona) => persona.id === id);
}

export function resolvePersonas(ids = []) {
  if (!ids.length) {
    return PERSONAS;
  }

  return ids.map(getPersona).filter(Boolean);
}

