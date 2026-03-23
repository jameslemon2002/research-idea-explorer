import test from "node:test";
import assert from "node:assert/strict";

import { samplePapers } from "../src/data/sample-papers.js";
import { sampleSeed } from "../src/data/sample-seed.js";
import { brainstormSeeds } from "../src/engine/brainstorm.js";
import { critiqueIdeas } from "../src/engine/critic.js";
import { crystallizeSeeds } from "../src/engine/crystallize.js";
import { runIdeaPipeline } from "../src/engine/pipeline.js";
import {
  buildLiteratureIndex,
  getGraphNeighbors,
  searchEmbedding,
  searchLiterature
} from "../src/retrieval/literature.js";
import { createResearchState } from "../src/schema.js";

test("brainstorm creates one seed per persona", () => {
  const state = createResearchState(sampleSeed);
  const seeds = brainstormSeeds(state, buildLiteratureIndex(samplePapers));
  assert.equal(seeds.length, sampleSeed.constraints.personaIds.length);
  assert.ok(seeds.every((seed) => seed.persona.id));
});

test("crystallization turns brainstorm seeds into structured ideas", () => {
  const state = createResearchState(sampleSeed);
  const seeds = brainstormSeeds(state, buildLiteratureIndex(samplePapers));
  const ideas = crystallizeSeeds(seeds, state, { limit: 24 });
  assert.ok(ideas.length > 0);
  assert.ok(ideas.every((idea) => idea.origin.personaId));
});

test("literature search surfaces relevant papers", () => {
  const index = buildLiteratureIndex(samplePapers);
  const results = searchLiterature(index, "heat sensor measurement", 2);
  assert.equal(results.length, 2);
  assert.ok(results[0].score >= results[1].score);
});

test("embedding retrieval returns ranked results", () => {
  const index = buildLiteratureIndex(samplePapers);
  const results = searchEmbedding(index, "equity and cooling center access", 2);
  assert.equal(results.length, 2);
  assert.ok(results[0].score >= results[1].score);
});

test("similarity graph exposes neighbors", () => {
  const index = buildLiteratureIndex(samplePapers);
  const neighbors = getGraphNeighbors(index, "paper-1", 3);
  assert.ok(Array.isArray(neighbors));
  assert.ok(neighbors.every((hit) => hit.paper.id !== "paper-1"));
});

test("critic attaches penalties and summaries", () => {
  const state = createResearchState(sampleSeed);
  const seeds = brainstormSeeds(state, buildLiteratureIndex(samplePapers));
  const ideas = crystallizeSeeds(seeds, state, { limit: 24 });
  const critiqued = critiqueIdeas(ideas, {
    state,
    papers: buildLiteratureIndex(samplePapers)
  });
  assert.ok(typeof critiqued[0].critique.penalty === "number");
  assert.ok(typeof critiqued[0].critique.summary === "string");
});

test("pipeline frontier keeps persona diversity", () => {
  const pipeline = runIdeaPipeline(sampleSeed, buildLiteratureIndex(samplePapers), {
    frontierLimit: 6
  });
  const personaIds = pipeline.frontier.map((idea) => idea.origin.personaId);
  assert.equal(new Set(personaIds).size, pipeline.frontier.length);
  assert.ok(pipeline.frontier[0].scores.total >= pipeline.frontier[pipeline.frontier.length - 1].scores.total);
});
