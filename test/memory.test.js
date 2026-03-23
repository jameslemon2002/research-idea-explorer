import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { samplePapers } from "../src/data/sample-papers.js";
import { sampleSeed } from "../src/data/sample-seed.js";
import { runIdeaPipeline } from "../src/engine/pipeline.js";
import { collectVisitedIdeas, createMemoryGraph, recordIdeaDecision } from "../src/memory/graph.js";
import { loadMemoryGraph, saveMemoryGraph } from "../src/memory/store.js";
import { buildLiteratureIndex } from "../src/retrieval/literature.js";

test("memory graph captures pipeline runs", () => {
  const graph = createMemoryGraph();
  const pipeline = runIdeaPipeline(sampleSeed, buildLiteratureIndex(samplePapers), {
    query: sampleSeed.focus.objects.join(" "),
    memoryGraph: graph,
    frontierLimit: 4
  });

  const visitedIdeas = collectVisitedIdeas(pipeline.memoryGraph);
  assert.ok(visitedIdeas.length >= 4);
  assert.ok(Object.values(pipeline.memoryGraph.nodes).some((node) => node.kind === "paper"));
  assert.ok(pipeline.memoryGraph.edges.length > 0);
});

test("memory graph persists to disk", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rse-memory-"));
  const filePath = path.join(tempDir, "graph.json");
  const graph = createMemoryGraph();

  const pipeline = runIdeaPipeline(sampleSeed, buildLiteratureIndex(samplePapers), {
    query: sampleSeed.focus.objects.join(" "),
    memoryGraph: graph,
    frontierLimit: 4
  });

  await saveMemoryGraph(filePath, pipeline.memoryGraph);
  const loaded = await loadMemoryGraph(filePath);

  assert.ok(Object.keys(loaded.nodes).length > 0);
  assert.ok(loaded.edges.length > 0);
});

test("memory graph records user decisions on ideas", () => {
  const graph = createMemoryGraph();
  const pipeline = runIdeaPipeline(sampleSeed, buildLiteratureIndex(samplePapers), {
    query: sampleSeed.focus.objects.join(" "),
    memoryGraph: graph,
    frontierLimit: 2
  });

  const idea = pipeline.frontier[0];
  recordIdeaDecision(graph, idea.id, "accepted", {
    note: "strong fit"
  });

  const node = graph.nodes[`idea:${idea.id}`];
  assert.equal(node.status, "accepted");
  assert.equal(node.payload.feedback.decision, "accepted");
  assert.equal(node.decisionHistory.length, 1);
});
