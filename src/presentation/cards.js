import {
  buildClaimMethodFrame,
  buildIdeaTitle,
  buildProblemFrame,
  buildScopeSummary,
  buildSignificanceFrame,
  buildStudyContext,
  capitalizeSentence,
  joinReadable,
  stripTerminalPunctuation
} from "../idea-language.js";

function compactSentences(parts) {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

function lowerPhrase(value) {
  const text = stripTerminalPunctuation(value);
  if (!text) {
    return "";
  }

  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function resolvePaper(context, paperId) {
  if (!paperId) {
    return null;
  }

  if (context.paperMap?.get) {
    return context.paperMap.get(paperId) || null;
  }

  if (Array.isArray(context.papers)) {
    return context.papers.find((paper) => paper.id === paperId) || null;
  }

  return null;
}

function buildRiskNote(idea) {
  const notesByFlag = {
    crowded_literature: "the surrounding literature is already crowded, so the contribution depends on a sharper contrast or data advantage",
    weak_contrast: "the comparison may still be too broad and should be narrowed before execution",
    near_duplicate_cluster: "nearby ideas are close enough that this direction needs a clearer empirical edge",
    weak_brainstorm_signal: "the motivating research move is still under-specified"
  };

  const notes = (idea.critique?.flags || []).map((flag) => notesByFlag[flag]).filter(Boolean);
  if (!notes.length) {
    return "";
  }

  return `Main risk: ${joinReadable(notes)}.`;
}

export function buildIdeaCardView(idea, context = {}) {
  const literatureAnchor = resolvePaper(context, idea.scores?.nearestPaperId || idea.critique?.nearestPaperId);
  const studyContext = buildStudyContext(idea.scope);
  const scopeSummary = buildScopeSummary(idea.scope);
  const title = buildIdeaTitle(idea);
  const abstract = compactSentences([
    `This project treats ${idea.object} as a ${idea.puzzle.label.toLowerCase()} problem and ${buildProblemFrame(idea)}.`,
    `Using ${lowerPhrase(idea.evidence.detail)}, it studies ${idea.contrast.comparison}${studyContext ? ` ${studyContext}` : ""}, aiming to ${stripTerminalPunctuation(idea.claim.outcome)}.`
  ]);
  const design = compactSentences([
    `Collect ${lowerPhrase(idea.evidence.detail)}${studyContext ? ` ${studyContext}` : ""}.`,
    `${capitalizeSentence(buildClaimMethodFrame(idea))}.`,
    `Compare ${idea.contrast.comparison}.`,
    literatureAnchor ? `Use "${literatureAnchor.title}" as the nearest literature anchor, then push it toward the sharper comparison.` : ""
  ]);
  const distinctiveness = compactSentences([
    idea.origin?.personaLabel && idea.origin?.noveltyAngle
      ? `The core move comes from ${idea.origin.personaLabel}: ${stripTerminalPunctuation(idea.origin.noveltyAngle)}.`
      : idea.origin?.personaLabel
        ? `The core move comes from ${idea.origin.personaLabel}.`
        : "",
    literatureAnchor
      ? `It sits close to "${literatureAnchor.title}" in the retrieved literature but shifts attention toward ${idea.contrast.comparison}.`
      : `It foregrounds ${idea.contrast.comparison} instead of another average-case account of ${idea.object}.`,
    buildRiskNote(idea)
  ]);
  const significance = compactSentences([
    idea.stakes?.length
      ? `This matters for ${joinReadable(idea.stakes)} because ${buildSignificanceFrame(idea)}.`
      : `${capitalizeSentence(buildSignificanceFrame(idea))}.`,
    scopeSummary ? `The most concrete setting here is ${scopeSummary}.` : ""
  ]);

  return {
    title,
    abstract,
    design,
    distinctiveness,
    significance,
    literatureAnchor: literatureAnchor?.title || null
  };
}

export function formatIdeaMarkdown(idea, context = {}) {
  const card = buildIdeaCardView(idea, context);

  return [
    `### ${card.title}`,
    `- Abstract: ${card.abstract}`,
    `- Design: ${card.design}`,
    `- Distinctiveness: ${card.distinctiveness}`,
    `- Significance: ${card.significance}`
  ].join("\n");
}

