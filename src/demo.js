import { samplePapers } from "./data/sample-papers.js";
import { sampleSeed } from "./data/sample-seed.js";
import { loadMemoryGraph, saveMemoryGraph } from "./memory/store.js";
import { updateFrontier } from "./engine/state.js";
import { runIdeaPipeline } from "./engine/pipeline.js";
import { buildLiteratureIndex, getGraphNeighbors, searchLiterature } from "./retrieval/literature.js";

const memoryPath = process.env.RESEARCH_MEMORY_PATH || "data/memory/demo-memory.json";

const literatureIndex = buildLiteratureIndex(samplePapers);
const memoryGraph = await loadMemoryGraph(memoryPath);
const pipeline = runIdeaPipeline(sampleSeed, literatureIndex, {
  limit: 48,
  frontierLimit: 6,
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

console.log("\nBrainstorm seeds:\n");
for (const seed of pipeline.brainstormSeeds) {
  console.log(`${seed.persona.label}: ${seed.questionStem}`);
  console.log(`  novelty angle: ${seed.noveltyAngle}`);
  console.log(`  pivot: ${seed.pivot}`);
  console.log("");
}

console.log("Frontier idea cards after critique and ranking:\n");
for (const idea of pipeline.frontier) {
  console.log(`${idea.title}`);
  console.log(`  persona: ${idea.origin.personaLabel}`);
  console.log(`  puzzle: ${idea.puzzle.label}`);
  console.log(`  claim: ${idea.claim.label}`);
  console.log(`  contrast: ${idea.contrast.comparison}`);
  console.log(`  evidence: ${idea.evidence.kind}`);
  console.log(`  scores: ${JSON.stringify(idea.scores)}`);
  console.log(`  critique: ${idea.critique.summary}`);
  console.log(`  rationale: ${idea.rationale}`);
  console.log("");
}

console.log("Frontier idea IDs:", pipeline.state.frontier.join(", "));
console.log(`Memory graph saved to: ${memoryPath}`);
