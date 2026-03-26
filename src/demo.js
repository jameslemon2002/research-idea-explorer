import { samplePapers } from "./data/sample-papers.js";
import { sampleSeed } from "./data/sample-seed.js";
import { loadMemoryGraph, saveMemoryGraph } from "./memory/store.js";
import { updateFrontier } from "./engine/state.js";
import { runIdeaPipeline } from "./engine/pipeline.js";
import { buildIdeaCardView } from "./presentation/cards.js";
import { buildLiteratureIndex, getGraphNeighbors, searchLiterature } from "./retrieval/literature.js";

const memoryPath = process.env.RESEARCH_MEMORY_PATH || "data/memory/demo-memory.json";

const literatureIndex = buildLiteratureIndex(samplePapers);
const memoryGraph = await loadMemoryGraph(memoryPath);
const pipeline = runIdeaPipeline(sampleSeed, literatureIndex, {
  limit: 48,
  frontierLimit: 6,
  rounds: 2,
  query: sampleSeed.focus.objects.join(" "),
  memoryGraph
});
await saveMemoryGraph(memoryPath, pipeline.memoryGraph);

updateFrontier(pipeline.state, pipeline.frontier);

console.log("Top literature hits for the seed query:\n");
for (const result of searchLiterature(literatureIndex, "urban heat equity policy measurement", 3)) {
  console.log(`- ${result.paper.title} [score=${result.score.toFixed(3)}]`);
}

const topPaper = searchLiterature(literatureIndex, "urban heat equity policy measurement", 1)[0]?.paper;
if (topPaper) {
  console.log("\nGraph neighbors of the top literature hit:\n");
  for (const neighbor of getGraphNeighbors(literatureIndex, topPaper.id, 3)) {
    console.log(`- ${neighbor.paper.title} [edge=${neighbor.score.toFixed(3)}]`);
  }
}

console.log("\nResearch moves:\n");
for (const seed of pipeline.rounds.initial.brainstormSeeds) {
  console.log(`${seed.questionStem}`);
  console.log(`  research move: ${seed.noveltyAngle}`);
  console.log(`  pivot: ${seed.pivot}`);
  console.log("");
}

if (pipeline.rounds.mutation.seeds.length) {
  console.log("Second-pass literature branches:\n");
  for (const seed of pipeline.rounds.mutation.seeds) {
    console.log(`${seed.questionStem}`);
    console.log(`  research move: ${seed.noveltyAngle}`);
    console.log(`  pivot: ${seed.pivot}`);
    console.log("");
  }
}

console.log("Literature loop summary:\n");
console.log(
  `- initial map: ${pipeline.literatureMap.queryCount} queries -> ${pipeline.literatureMap.neighborhoods.length} neighborhoods`
);
console.log(`- search depth: ${pipeline.effectiveRounds} rounds`);
console.log(`- first focus: ${pipeline.rounds.firstFocus.frontier.length} families retained`);
if (pipeline.rounds.mutation.traces.length) {
  console.log(`- mutation pass: ${pipeline.rounds.mutation.traces.length} targeted probes`);
}
console.log("");

console.log("Frontier idea cards after critique and ranking:\n");
for (const idea of pipeline.frontier) {
  const card = buildIdeaCardView(idea, {
    paperMap: literatureIndex.paperMap
  });
  console.log(`${card.title}`);
  console.log(`  abstract: ${card.abstract}`);
  console.log(`  design: ${card.design}`);
  console.log(`  distinctiveness: ${card.distinctiveness}`);
  console.log(`  significance: ${card.significance}`);
  console.log(`  scores: ${JSON.stringify(idea.scores)}`);
  console.log("");
}

console.log("Frontier idea IDs:", pipeline.state.frontier.join(", "));
console.log(`Memory graph saved to: ${memoryPath}`);
