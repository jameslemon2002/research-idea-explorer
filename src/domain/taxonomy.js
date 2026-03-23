export const PUZZLES = [
  {
    id: "blind_spot",
    label: "Blind spot",
    question: "What population, setting, or material is being systematically overlooked?",
    preferredClaims: ["describe", "measure", "compare"]
  },
  {
    id: "conflict",
    label: "Conflict",
    question: "Which theories, observations, or findings are in tension?",
    preferredClaims: ["compare", "explain", "identify", "critique"]
  },
  {
    id: "distortion",
    label: "Distortion",
    question: "Where do current concepts, indicators, or narratives misrepresent reality?",
    preferredClaims: ["measure", "compare", "critique", "design"]
  },
  {
    id: "mechanism_unknown",
    label: "Mechanism unknown",
    question: "What process is generating the observed pattern?",
    preferredClaims: ["explain", "identify", "intervene"]
  },
  {
    id: "boundary_unknown",
    label: "Boundary unknown",
    question: "For whom, where, or when does an existing pattern hold or fail?",
    preferredClaims: ["compare", "measure", "predict", "identify"]
  },
  {
    id: "leverage_unknown",
    label: "Leverage unknown",
    question: "What intervention or design change could move the outcome?",
    preferredClaims: ["identify", "intervene", "design", "predict"]
  }
];

export const CLAIMS = [
  {
    id: "describe",
    label: "Describe",
    outcome: "map the shape, distribution, or experience of a phenomenon",
    defaultEvidence: ["observational_data", "survey", "archive"]
  },
  {
    id: "measure",
    label: "Measure",
    outcome: "turn a hard-to-observe construct into a usable variable",
    defaultEvidence: ["survey", "text_corpus", "sensor_data"]
  },
  {
    id: "compare",
    label: "Compare",
    outcome: "show how outcomes vary across groups, settings, or periods",
    defaultEvidence: ["observational_data", "survey", "administrative_data"]
  },
  {
    id: "explain",
    label: "Explain",
    outcome: "identify the process that links conditions to outcomes",
    defaultEvidence: ["interviews", "case_study", "administrative_data"]
  },
  {
    id: "identify",
    label: "Identify",
    outcome: "estimate a causal effect under explicit assumptions",
    defaultEvidence: ["administrative_data", "experiment", "quasi_experiment"]
  },
  {
    id: "predict",
    label: "Predict",
    outcome: "forecast risk, change, or future states",
    defaultEvidence: ["observational_data", "sensor_data", "administrative_data"]
  },
  {
    id: "intervene",
    label: "Intervene",
    outcome: "change a system and measure the downstream effect",
    defaultEvidence: ["experiment", "quasi_experiment", "field_trial"]
  },
  {
    id: "design",
    label: "Design",
    outcome: "propose and test a better procedure, institution, or tool",
    defaultEvidence: ["prototype", "simulation", "field_trial"]
  },
  {
    id: "critique",
    label: "Critique",
    outcome: "surface hidden assumptions, exclusions, or power effects",
    defaultEvidence: ["archive", "text_corpus", "interviews"]
  }
];

export const EVIDENCE_LIBRARY = {
  observational_data: "observational datasets or field records",
  survey: "survey responses or structured questionnaires",
  archive: "archival material, policy records, or historical documents",
  text_corpus: "text corpora, transcripts, or discourse data",
  administrative_data: "administrative or institutional records",
  interviews: "interviews, ethnographic notes, or process tracing material",
  case_study: "comparative case study material",
  experiment: "lab or online experiments",
  quasi_experiment: "quasi-experimental variation",
  field_trial: "field intervention or policy trial",
  sensor_data: "sensor, mobility, or environmental measurements",
  prototype: "prototypes, workflow artifacts, or design outputs",
  simulation: "simulation or scenario outputs"
};

export function getPuzzle(id) {
  return PUZZLES.find((item) => item.id === id);
}

export function getClaim(id) {
  return CLAIMS.find((item) => item.id === id);
}

