function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripTrailingPunctuation(value) {
  return cleanText(value).replace(/[.?!]+$/g, "");
}

function sentenceStart(value) {
  const text = cleanText(value);
  if (!text) {
    return "";
  }

  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function isSpecified(value) {
  const text = cleanText(value);
  return Boolean(text) && !text.startsWith("unspecified");
}

function parseComparison(comparison) {
  const text = cleanText(comparison);
  const versusMatch = text.match(/^(.*?)\s+versus\s+(.*?)$/i);
  if (versusMatch) {
    return {
      kind: "versus",
      left: cleanText(versusMatch[1]),
      right: cleanText(versusMatch[2])
    };
  }

  const withWithoutMatch = text.match(/^(.*?)\s+with and without\s+(.*?)$/i);
  if (withWithoutMatch) {
    return {
      kind: "with_without",
      base: cleanText(withWithoutMatch[1]),
      modifier: cleanText(withWithoutMatch[2])
    };
  }

  return {
    kind: "raw",
    value: text
  };
}

function looksLikeMeasurementTarget(value) {
  const text = cleanText(value).toLowerCase();
  return /(metric|measure|indicator|record|records|narrative|narratives|experience|reported|official)/.test(text);
}

export function joinReadable(values = [], conjunction = "and") {
  const items = values.map(cleanText).filter(Boolean);
  if (items.length === 0) {
    return "";
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} ${conjunction} ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, ${conjunction} ${items.at(-1)}`;
}

export function summarizeComparison(comparison, mode = "across") {
  const parsed = parseComparison(comparison);
  if (parsed.kind === "versus") {
    if (mode === "beyond") {
      return parsed.right;
    }

    return `${parsed.left} and ${parsed.right}`;
  }

  if (parsed.kind === "with_without") {
    return `${parsed.base} with and without ${parsed.modifier}`;
  }

  return parsed.value;
}

export function buildProblemFrame(idea) {
  const frames = {
    blind_spot: "asks what current work is systematically leaving out",
    conflict: "asks why dominant accounts and observed patterns pull apart",
    distortion: "treats current metrics or narratives as potentially misleading",
    mechanism_unknown: "asks which process links conditions to outcomes",
    boundary_unknown: "maps where an existing claim stops traveling",
    leverage_unknown: "looks for the intervention or design change that could move the outcome"
  };

  return frames[idea.puzzle?.id] || `treats this as a ${cleanText(idea.puzzle?.label).toLowerCase()} problem`;
}

export function buildClaimMethodFrame(idea) {
  const frames = {
    describe: "map the distribution of the phenomenon in a way the current literature does not",
    measure: "build an operational measure and test whether it changes how cases are ranked",
    compare: "compare outcomes across the focal contrast instead of relying on an average case",
    explain: "trace the process linking conditions to outcomes",
    identify: "estimate the effect under explicit assumptions",
    predict: "test whether the signal improves forecasting",
    intervene: "change the system and measure the downstream effect",
    design: "prototype an alternative procedure and benchmark it against current practice",
    critique: "read for exclusions, hidden assumptions, or power effects"
  };

  return frames[idea.claim?.id] || stripTrailingPunctuation(idea.claim?.outcome || "produce a concrete empirical test");
}

export function buildSignificanceFrame(idea) {
  const frames = {
    blind_spot: "headline findings can change once overlooked groups or settings are brought back in",
    conflict: "decision-makers need to know which competing story actually fits the evidence",
    distortion: "current indicators may misstate where the problem is most acute",
    mechanism_unknown: "without a mechanism, it is hard to know which intervention to trust",
    boundary_unknown: "average effects can hide where a claimed pattern stops holding",
    leverage_unknown: "current interventions may be targeting the wrong bottleneck"
  };

  return frames[idea.puzzle?.id] || "the contribution depends on specifying a sharper empirical question";
}

export function buildStudyContext(scope = {}) {
  const parts = [];
  if (isSpecified(scope.population)) {
    parts.push(`among ${cleanText(scope.population)}`);
  }
  if (isSpecified(scope.place)) {
    parts.push(`in ${cleanText(scope.place)}`);
  }
  if (isSpecified(scope.time)) {
    parts.push(`during ${cleanText(scope.time)}`);
  }

  return parts.join(" ");
}

export function buildScopeSummary(scope = {}) {
  const parts = [];
  if (isSpecified(scope.population)) {
    parts.push(cleanText(scope.population));
  }
  if (isSpecified(scope.place)) {
    parts.push(cleanText(scope.place));
  }
  if (isSpecified(scope.time)) {
    parts.push(cleanText(scope.time));
  }
  if (isSpecified(scope.scale)) {
    parts.push(`${cleanText(scope.scale)} scale`);
  }

  return joinReadable(parts);
}

export function buildIdeaTitle(idea) {
  const object = cleanText(idea.object);
  const across = summarizeComparison(idea.contrast?.comparison, "across");
  const beyond = summarizeComparison(idea.contrast?.comparison, "beyond");
  const parsedComparison = parseComparison(idea.contrast?.comparison);

  if (
    idea.puzzle?.id === "distortion" &&
    idea.claim?.id === "measure" &&
    parsedComparison.kind === "versus" &&
    looksLikeMeasurementTarget(parsedComparison.right)
  ) {
    return `Measuring ${object} beyond ${beyond}`;
  }

  if (idea.puzzle?.id === "distortion" && idea.claim?.id === "measure") {
    return `Measuring ${object} across ${across}`;
  }

  if (idea.puzzle?.id === "boundary_unknown") {
    return `Where does ${object} stop holding across ${across}?`;
  }

  if (idea.puzzle?.id === "conflict" && ["identify", "explain", "compare"].includes(idea.claim?.id)) {
    return `When does ${object} diverge across ${across}?`;
  }

  if (idea.claim?.id === "design") {
    return `Designing ${object} for ${across}`;
  }

  if (idea.claim?.id === "explain") {
    return `Explaining ${object} through ${across}`;
  }

  if (idea.claim?.id === "identify") {
    return `Estimating ${object} across ${across}`;
  }

  if (idea.claim?.id === "compare") {
    return `Comparing ${object} across ${across}`;
  }

  if (idea.claim?.id === "predict") {
    return `Predicting ${object} across ${across}`;
  }

  if (idea.claim?.id === "intervene") {
    return `Testing interventions for ${object} across ${across}`;
  }

  if (idea.claim?.id === "critique") {
    return `Rethinking ${object} through ${across}`;
  }

  if (idea.claim?.id === "measure") {
    return `Measuring ${object} across ${across}`;
  }

  if (idea.claim?.id === "describe") {
    return `Mapping ${object} across ${across}`;
  }

  return sentenceStart(`${cleanText(idea.claim?.label)} ${object} across ${across}`);
}

export function stripTerminalPunctuation(value) {
  return stripTrailingPunctuation(value);
}

export function capitalizeSentence(value) {
  return sentenceStart(value);
}
