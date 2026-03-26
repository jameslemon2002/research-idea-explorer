import fs from "node:fs/promises";

import { runIdeaPipeline } from "./engine/pipeline.js";
import { collectIdeaNodes, createMemoryGraph, recordIdeaDecision } from "./memory/graph.js";
import { loadMemoryGraph, saveMemoryGraph } from "./memory/store.js";
import {
  formatGraphIdeasMarkdown,
  formatGraphNeighborhoodMarkdown,
  formatGraphSummaryMarkdown,
  getGraphNeighborhood,
  listGraphIdeas,
  summarizeMemoryGraph
} from "./memory/view.js";
import { buildQuerySeed } from "./query-seed.js";
import { searchLiteratureSources } from "./retrieval/live.js";

function parseArgs(argv) {
  const result = {
    _: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      result._.push(token);
      continue;
    }

    const stripped = token.slice(2);
    const [rawKey, rawInlineValue] = stripped.split("=");
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const nextValue = rawInlineValue ?? argv[index + 1];
    const shouldConsumeNext = rawInlineValue === undefined && nextValue && !nextValue.startsWith("--");

    if (rawInlineValue !== undefined || shouldConsumeNext) {
      const value = rawInlineValue ?? nextValue;
      if (shouldConsumeNext) {
        index += 1;
      }

      if (result[key] === undefined) {
        result[key] = value;
      } else if (Array.isArray(result[key])) {
        result[key].push(value);
      } else {
        result[key] = [result[key], value];
      }
      continue;
    }

    result[key] = true;
  }

  return result;
}

function splitList(value) {
  if (!value) {
    return undefined;
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNumber(value, fallback) {
  return value === undefined ? fallback : Number(value);
}

function pickMemoryPath(flags) {
  return flags.memory || process.env.RESEARCH_MEMORY_PATH || "data/memory/cli-memory.json";
}

function normalizeProviders(flags) {
  const providers = splitList(flags.providers);
  if (providers?.length) {
    return providers;
  }

  if (flags.localLibraryPath || flags.localLibrary) {
    return ["local"];
  }

  if (flags.webUrl || flags.webUrls) {
    return ["web"];
  }

  return undefined;
}

function asArray(value) {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function formatSeed(seed) {
  return `- [${seed.persona.label}] ${seed.hook} Pivot: ${seed.pivot}.`;
}

function buildMinimalDesign(idea) {
  return [
    `Use ${idea.evidence.detail.toLowerCase()}`,
    `compare ${idea.contrast.comparison}`,
    `within ${idea.scope.place}`
  ].join(", ");
}

function compactList(values = []) {
  return values.filter(Boolean).join(", ");
}

function buildAbstract(idea) {
  return `Treats ${idea.object} as a ${idea.puzzle.label.toLowerCase()} problem and aims to ${idea.claim.outcome} by focusing on ${idea.contrast.comparison}.`;
}

function buildDesign(idea) {
  return `${buildMinimalDesign(idea)}.`;
}

function buildDistinctiveness(idea) {
  const frame = `Uses a ${idea.puzzle.label.toLowerCase()} framing with ${idea.contrast.axis} as the main contrast`;
  const note =
    idea.critique?.summary && idea.critique.summary !== "No major template warning detected."
      ? ` ${idea.critique.summary}`
      : "";
  return `${frame} rather than a generic topic-method pairing.${note}`.trim();
}

function buildSignificance(idea) {
  const stakes = compactList(idea.stakes || []);
  const scope = compactList([idea.scope.population, idea.scope.place].filter(Boolean));
  if (stakes && scope) {
    return `Matters for ${stakes} in ${scope}.`;
  }
  if (stakes) {
    return `Matters for ${stakes}.`;
  }
  if (scope) {
    return `Matters within ${scope}.`;
  }
  return "Matters because it opens a concrete, testable research direction.";
}

function formatIdeaMarkdown(idea) {
  return [
    `### ${idea.title}`,
    `- Abstract: ${buildAbstract(idea)}`,
    `- Design: ${buildDesign(idea)}`,
    `- Distinctiveness: ${buildDistinctiveness(idea)}`,
    `- Significance: ${buildSignificance(idea)}`
  ].join("\n");
}

function formatIdeasMarkdown(result, memoryPath) {
  const lines = [
    "# Research Idea Explorer",
    "",
    `Query: ${result.query}`,
    `Providers: ${result.providers.join(", ")}`,
    `Memory: ${memoryPath}`,
    ""
  ];

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
      `- ${hit.paper.title} [${hit.paper.providers?.join("+") || hit.paper.provider}] (${hit.paper.year || "n.d."})`
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
    lines.push(formatIdeaMarkdown(idea));
    lines.push("");
  }

  return lines.join("\n").trim();
}

function buildJsonResult(result, memoryPath) {
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
        cardView: {
          title: idea.title,
          abstract: buildAbstract(idea),
          design: buildDesign(idea),
          distinctiveness: buildDistinctiveness(idea),
          significance: buildSignificance(idea)
        }
      })),
      memoryPath
    },
    null,
    2
  );
}

async function runIdeasCommand(flags) {
  const query = flags.query || flags._.join(" ").trim();
  if (!query) {
    throw new Error("Missing query. Pass --query \"...\" or provide positional text.");
  }

  const memoryPath = pickMemoryPath(flags);
  const memoryGraph = (await loadMemoryGraph(memoryPath).catch(() => createMemoryGraph())) || createMemoryGraph();
  const providers = normalizeProviders(flags);
  const result = await searchLiteratureSources(query, {
    providers,
    perProviderLimit: toNumber(flags.perProviderLimit, 5),
    rankLimit: toNumber(flags.rankLimit, 10),
    timeoutMs: toNumber(flags.timeoutMs, undefined),
    searchStrategy: flags.searchStrategy || "hybrid",
    domain: flags.domain,
    localLibraryPath: flags.localLibraryPath || flags.localLibrary,
    webUrls: asArray(flags.webUrl || flags.webUrls),
    ssrnUrls: asArray(flags.ssrnUrl || flags.ssrnUrls),
    semanticScholarApiKey: flags.semanticScholarApiKey,
    elsevierApiKey: flags.elsevierApiKey,
    springerApiKey: flags.springerApiKey
  });
  const seed = buildQuerySeed(query, result, {
    domain: flags.domain
  });

  const pipeline = runIdeaPipeline(seed, result.index, {
    frontierLimit: toNumber(flags.frontierLimit, 6),
    query,
    memoryGraph
  });

  await saveMemoryGraph(memoryPath, pipeline.memoryGraph);

  const fullResult = {
    ...result,
    pipeline,
    query
  };

  const output = flags.format === "json" ? buildJsonResult(fullResult, memoryPath) : formatIdeasMarkdown(fullResult, memoryPath);
  if (flags.output) {
    await fs.writeFile(flags.output, output);
  }
  process.stdout.write(`${output}\n`);
}

async function runFeedbackCommand(flags) {
  const memoryPath = pickMemoryPath(flags);
  const graph = await loadMemoryGraph(memoryPath);
  const ideaId = flags.ideaId;

  if (!ideaId) {
    const ideas = collectIdeaNodes(graph).map((node) => ({
      id: node.payload?.id || node.id.replace(/^idea:/, ""),
      title: node.label,
      status: node.status || "candidate"
    }));
    process.stdout.write(`${JSON.stringify({ memoryPath, ideas }, null, 2)}\n`);
    return;
  }

  const decision = flags.decision || "accepted";
  const updatedNode = recordIdeaDecision(graph, ideaId, decision, {
    note: flags.note || "",
    source: "cli"
  });
  if (!updatedNode) {
    throw new Error(`Unknown idea id: ${ideaId}`);
  }
  await saveMemoryGraph(memoryPath, graph);
  process.stdout.write(
    `${JSON.stringify({ memoryPath, ideaId, decision, note: flags.note || "" }, null, 2)}\n`
  );
}

async function runGraphCommand(flags) {
  const memoryPath = pickMemoryPath(flags);
  const graph = await loadMemoryGraph(memoryPath);
  const view = flags.view || "summary";
  const limit = toNumber(flags.limit, 12);

  let output;
  if (view === "summary") {
    const summary = summarizeMemoryGraph(graph);
    output =
      flags.format === "json"
        ? JSON.stringify({ memoryPath, summary }, null, 2)
        : formatGraphSummaryMarkdown(summary);
  } else if (view === "ideas") {
    const ideas = listGraphIdeas(graph, { limit });
    output =
      flags.format === "json"
        ? JSON.stringify({ memoryPath, ideas }, null, 2)
        : formatGraphIdeasMarkdown(ideas);
  } else if (view === "neighbors") {
    const neighborhood = getGraphNeighborhood(graph, {
      ideaId: flags.ideaId,
      nodeId: flags.nodeId
    });
    output =
      flags.format === "json"
        ? JSON.stringify({ memoryPath, neighborhood }, null, 2)
        : formatGraphNeighborhoodMarkdown(neighborhood);
  } else if (view === "json") {
    output = JSON.stringify({ memoryPath, graph }, null, 2);
  } else {
    throw new Error(`Unknown graph view: ${view}. Supported views: summary, ideas, neighbors, json.`);
  }

  if (flags.output) {
    await fs.writeFile(flags.output, output);
  }
  process.stdout.write(`${output}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const hasExplicitCommand = Boolean(args[0] && !args[0].startsWith("--"));
  const command = hasExplicitCommand ? args[0] : "ideas";
  const flags = parseArgs(hasExplicitCommand ? args.slice(1) : args);

  if (command === "ideas") {
    await runIdeasCommand(flags);
    return;
  }

  if (command === "feedback") {
    await runFeedbackCommand(flags);
    return;
  }

  if (command === "graph") {
    await runGraphCommand(flags);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
