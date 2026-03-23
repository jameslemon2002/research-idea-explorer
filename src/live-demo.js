import { runIdeaPipeline } from "./engine/pipeline.js";
import { loadMemoryGraph, saveMemoryGraph } from "./memory/store.js";
import { buildQuerySeed } from "./query-seed.js";
import { searchLiteratureSources } from "./retrieval/live.js";

const query = process.argv.slice(2).join(" ").trim() || "urban heat adaptation equity policy";
const memoryPath = process.env.RESEARCH_MEMORY_PATH || "data/memory/live-memory.json";

async function main() {
  const memoryGraph = await loadMemoryGraph(memoryPath);
  const result = await searchLiteratureSources(query, {
    perProviderLimit: 5
  });

  console.log(`Query: ${result.query}`);
  console.log(`Providers: ${result.providers.join(", ")}`);
  const providerCounts = result.papers.reduce((counts, paper) => {
    for (const provider of paper.providers || [paper.provider]) {
      counts[provider] = (counts[provider] || 0) + 1;
    }
    return counts;
  }, {});
  console.log(`Retrieved by provider: ${JSON.stringify(providerCounts)}`);

  if (result.errors.length) {
    console.log("\nProvider errors:");
    for (const item of result.errors) {
      console.log(`- ${item.provider}: ${item.error.message}`);
    }
  }

  console.log("\nTop retrieved papers:");
  for (const hit of result.rankedHits.slice(0, 6)) {
    console.log(`- ${hit.paper.title} [${hit.paper.providers?.join("+") || hit.paper.provider}]`);
  }

  const seed = buildQuerySeed(query, result);

  const pipeline = runIdeaPipeline(seed, result.index, {
    frontierLimit: 6,
    query,
    memoryGraph
  });
  const savedPath = await saveMemoryGraph(memoryPath, pipeline.memoryGraph);

  console.log("\nFrontier ideas:");
  for (const idea of pipeline.frontier) {
    console.log(`- ${idea.title}`);
    console.log(`  persona: ${idea.origin.personaLabel}`);
    console.log(`  nearest paper: ${idea.scores.nearestPaperId || "none"}`);
  }

  console.log(`\nMemory graph saved to: ${savedPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
