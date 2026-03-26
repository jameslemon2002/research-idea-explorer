import { formatIdeaMarkdown, buildIdeaCardView } from "./cards.js";

function buildPaperContext(result) {
  return {
    paperMap: result.index?.paperMap,
    papers: result.papers
  };
}

function formatSeed(seed) {
  return `- ${seed.questionStem}\n  Research move: ${seed.noveltyAngle}`;
}

function formatLiteratureLoop(pipeline) {
  const lines = ["## Literature Loop", ""];
  const mutation = pipeline.rounds?.mutation;
  const firstFocus = pipeline.rounds?.firstFocus?.frontier || [];
  const neighborhoods = pipeline.literatureMap?.neighborhoods || [];
  const effectiveRounds = pipeline.effectiveRounds || (mutation?.seeds?.length ? 2 : 1);

  lines.push(`- Search depth: ${effectiveRounds} round${effectiveRounds > 1 ? "s" : ""}`);
  lines.push(
    `- Initial map: ${pipeline.literatureMap?.queryCount || 0} queries -> ${neighborhoods.length} literature neighborhoods`
  );

  if (effectiveRounds >= 2) {
    lines.push(`- First focus: ${firstFocus.length} idea families retained for the second pass`);
    lines.push(
      `- Mutation pass: ${mutation?.traces?.length || 0} targeted literature probes -> ${mutation?.seeds?.length || 0} second-pass branches`
    );
    lines.push(`- Final search pool: ${pipeline.rankedIdeas.length} ranked ideas after two rounds`);
  } else {
    lines.push(`- First focus: ${firstFocus.length} idea families retained in the single-pass frontier`);
    lines.push(`- Final search pool: ${pipeline.rankedIdeas.length} ranked ideas after one round`);
  }
  lines.push("");

  return lines;
}

export function formatIdeasMarkdown(result, memoryPath) {
  const initialSeeds = result.pipeline.rounds?.initial?.brainstormSeeds || result.pipeline.brainstormSeeds || [];
  const mutationSeeds = result.pipeline.rounds?.mutation?.seeds || [];
  const effectiveRounds = result.pipeline.effectiveRounds || (mutationSeeds.length ? 2 : 1);
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

  lines.push(...formatLiteratureLoop(result.pipeline));

  lines.push(effectiveRounds >= 2 ? "## First-Pass Research Moves" : "## Research Moves", "");
  for (const seed of initialSeeds) {
    lines.push(formatSeed(seed));
  }
  lines.push("");

  if (mutationSeeds.length) {
    lines.push("## Second-Pass Literature Branches", "");
    for (const seed of mutationSeeds) {
      lines.push(formatSeed(seed));
    }
    lines.push("");
  }

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
      effectiveRounds: result.pipeline.effectiveRounds,
      memoryScope: result.pipeline.memoryScope,
      topicProfile: result.pipeline.topicProfile,
      errors: result.errors.map((item) => ({
        provider: item.provider,
        message: item.error.message
      })),
      topPapers: result.rankedHits.slice(0, 5).map((hit) => hit.paper),
      literatureMap: result.pipeline.literatureMap,
      brainstormSeeds: result.pipeline.brainstormSeeds,
      rounds: result.pipeline.rounds,
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
