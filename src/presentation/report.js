import { formatIdeaMarkdown, buildIdeaCardView } from "./cards.js";

function buildPaperContext(result) {
  return {
    paperMap: result.index?.paperMap,
    papers: result.papers
  };
}

function formatSeed(seed) {
  return `- [${seed.persona.label}] ${seed.questionStem}\n  Move: ${seed.noveltyAngle}`;
}

export function formatIdeasMarkdown(result, memoryPath) {
  const lines = [
    "# Research Idea Explorer",
    "",
    `Query: ${result.query}`,
    `Providers: ${result.providers.join(", ")}`,
    `Memory: ${memoryPath}`,
    ""
  ];
  const paperContext = buildPaperContext(result);

  if (result.errors.length) {
    lines.push("## Provider Errors", "");
    for (const item of result.errors) {
      lines.push(`- ${item.provider}: ${item.error.message}`);
    }
    lines.push("");
  }

  lines.push("## Top Papers", "");
  for (const hit of result.rankedHits.slice(0, 5)) {
    lines.push(
      `- ${hit.paper.title} [${hit.paper.providers?.join("+") || hit.paper.provider}] (${hit.paper.year || "n.d."}) score=${hit.score.toFixed(3)}`
    );
  }
  lines.push("");

  lines.push("## Brainstorm Seeds", "");
  for (const seed of result.pipeline.brainstormSeeds) {
    lines.push(formatSeed(seed));
  }
  lines.push("");

  lines.push("## Frontier Ideas", "");
  for (const idea of result.pipeline.frontier) {
    lines.push(formatIdeaMarkdown(idea, paperContext));
    lines.push("");
  }

  return lines.join("\n").trim();
}

export function buildJsonResult(result, memoryPath) {
  const paperContext = buildPaperContext(result);

  return JSON.stringify(
    {
      query: result.query,
      providers: result.providers,
      errors: result.errors.map((item) => ({
        provider: item.provider,
        message: item.error.message
      })),
      topPapers: result.rankedHits.slice(0, 5).map((hit) => hit.paper),
      brainstormSeeds: result.pipeline.brainstormSeeds,
      frontier: result.pipeline.frontier.map((idea) => ({
        ...idea,
        cardView: buildIdeaCardView(idea, paperContext)
      })),
      memoryPath
    },
    null,
    2
  );
}
