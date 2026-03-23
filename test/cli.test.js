import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function runCli(args, options = {}) {
  return execFileAsync(process.execPath, ["src/cli.js", ...args], {
    cwd: "/Users/lemon/Desktop/ai_research_idea",
    env: {
      ...process.env,
      ...(options.env || {})
    }
  });
}

test("cli ideas command runs against a local library", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rse-cli-"));
  const libraryPath = path.join(tempDir, "library.json");
  const memoryPath = path.join(tempDir, "memory.json");

  await fs.writeFile(
    libraryPath,
    JSON.stringify([
      {
        id: "local-1",
        title: "Heat planning study",
        abstract: "Planning under extreme heat.",
        authors: ["Alice Smith"],
        year: 2025,
        keywords: ["heat", "planning"]
      }
    ])
  );

  const { stdout } = await runCli([
    "ideas",
    "--query",
    "heat planning",
    "--providers",
    "local",
    "--local-library-path",
    libraryPath,
    "--memory",
    memoryPath,
    "--format",
    "json"
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.providers[0], "local");
  assert.ok(result.frontier.length > 0);
  assert.ok(result.frontier[0].cardView.abstract);
});

test("cli feedback command records accept decisions", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rse-cli-feedback-"));
  const libraryPath = path.join(tempDir, "library.json");
  const memoryPath = path.join(tempDir, "memory.json");

  await fs.writeFile(
    libraryPath,
    JSON.stringify([
      {
        id: "local-1",
        title: "Reasoning study",
        abstract: "Reasoning support in teams.",
        authors: ["Rong Zhao"],
        year: 2026,
        keywords: ["reasoning", "teams"]
      }
    ])
  );

  const { stdout: ideaStdout } = await runCli([
    "ideas",
    "--query",
    "reasoning teams",
    "--providers",
    "local",
    "--local-library-path",
    libraryPath,
    "--memory",
    memoryPath,
    "--format",
    "json"
  ]);

  const generated = JSON.parse(ideaStdout);
  const ideaId = generated.frontier[0].id;

  const { stdout } = await runCli([
    "feedback",
    "--memory",
    memoryPath,
    "--idea-id",
    ideaId,
    "--decision",
    "accepted",
    "--note",
    "keep exploring this"
  ]);

  const feedback = JSON.parse(stdout);
  assert.equal(feedback.ideaId, ideaId);
  assert.equal(feedback.decision, "accepted");
});

test("cli feedback command fails on unknown idea ids", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rse-cli-feedback-miss-"));
  const memoryPath = path.join(tempDir, "memory.json");

  await assert.rejects(
    runCli(["feedback", "--memory", memoryPath, "--idea-id", "idea-missing", "--decision", "accepted"]),
    /Unknown idea id: idea-missing/
  );
});

test("cli markdown output uses the compact research card headings", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rse-cli-markdown-"));
  const libraryPath = path.join(tempDir, "library.json");
  const memoryPath = path.join(tempDir, "memory.json");

  await fs.writeFile(
    libraryPath,
    JSON.stringify([
      {
        id: "local-1",
        title: "Urban heat planning study",
        abstract: "Planning adaptation under heat stress.",
        authors: ["Alice Smith"],
        year: 2025,
        keywords: ["urban", "heat", "planning"]
      }
    ])
  );

  const { stdout } = await runCli([
    "ideas",
    "--query",
    "urban heat planning",
    "--providers",
    "local",
    "--local-library-path",
    libraryPath,
    "--memory",
    memoryPath
  ]);

  assert.match(stdout, /- Abstract:/);
  assert.match(stdout, /- Design:/);
  assert.match(stdout, /- Distinctiveness:/);
  assert.match(stdout, /- Significance:/);
  assert.doesNotMatch(stdout, /- Persona origin:/);
  assert.doesNotMatch(stdout, /- Why this is not a duplicate:/);
});

test("cli graph summary reports memory graph counts", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rse-cli-graph-summary-"));
  const libraryPath = path.join(tempDir, "library.json");
  const memoryPath = path.join(tempDir, "memory.json");

  await fs.writeFile(
    libraryPath,
    JSON.stringify([
      {
        id: "local-1",
        title: "Graph summary study",
        abstract: "A local paper.",
        authors: ["Alice Smith"],
        year: 2025,
        keywords: ["graph", "summary"]
      }
    ])
  );

  await runCli([
    "ideas",
    "--query",
    "graph summary",
    "--providers",
    "local",
    "--local-library-path",
    libraryPath,
    "--memory",
    memoryPath,
    "--format",
    "json"
  ]);

  const { stdout } = await runCli(["graph", "--memory", memoryPath]);
  assert.match(stdout, /# Memory Graph/);
  assert.match(stdout, /- Nodes:/);
  assert.match(stdout, /- Edge relations:/);
});

test("cli graph mermaid view renders a mermaid diagram", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rse-cli-graph-mermaid-"));
  const libraryPath = path.join(tempDir, "library.json");
  const memoryPath = path.join(tempDir, "memory.json");

  await fs.writeFile(
    libraryPath,
    JSON.stringify([
      {
        id: "local-1",
        title: "Graph mermaid study",
        abstract: "A local paper.",
        authors: ["Alice Smith"],
        year: 2025,
        keywords: ["graph", "mermaid"]
      }
    ])
  );

  const { stdout: ideaStdout } = await runCli([
    "ideas",
    "--query",
    "graph mermaid",
    "--providers",
    "local",
    "--local-library-path",
    libraryPath,
    "--memory",
    memoryPath,
    "--format",
    "json"
  ]);

  const generated = JSON.parse(ideaStdout);
  const ideaId = generated.frontier[0].id;
  const { stdout } = await runCli(["graph", "--memory", memoryPath, "--view", "mermaid", "--idea-id", ideaId]);

  assert.match(stdout, /```mermaid/);
  assert.match(stdout, /flowchart TD/);
  assert.match(stdout, /Idea:/);
});

test("cli graph svg view renders a standalone svg network", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rse-cli-graph-svg-"));
  const libraryPath = path.join(tempDir, "library.json");
  const memoryPath = path.join(tempDir, "memory.json");

  await fs.writeFile(
    libraryPath,
    JSON.stringify([
      {
        id: "local-1",
        title: "Graph svg study",
        abstract: "A local paper.",
        authors: ["Alice Smith"],
        year: 2025,
        keywords: ["graph", "svg"]
      }
    ])
  );

  const { stdout: ideaStdout } = await runCli([
    "ideas",
    "--query",
    "graph svg",
    "--providers",
    "local",
    "--local-library-path",
    libraryPath,
    "--memory",
    memoryPath,
    "--format",
    "json"
  ]);

  const generated = JSON.parse(ideaStdout);
  const ideaId = generated.frontier[0].id;
  const { stdout } = await runCli(["graph", "--memory", memoryPath, "--view", "svg", "--idea-id", ideaId]);

  assert.match(stdout, /<svg[\s\S]*Research memory network/i);
  assert.match(stdout, /<circle/);
  assert.match(stdout, /<line/);
});

test("cli graph network view renders a self-contained html network", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rse-cli-graph-network-"));
  const libraryPath = path.join(tempDir, "library.json");
  const memoryPath = path.join(tempDir, "memory.json");

  await fs.writeFile(
    libraryPath,
    JSON.stringify([
      {
        id: "local-1",
        title: "Graph network study",
        abstract: "A local paper.",
        authors: ["Alice Smith"],
        year: 2025,
        keywords: ["graph", "network"]
      }
    ])
  );

  const { stdout: ideaStdout } = await runCli([
    "ideas",
    "--query",
    "graph network",
    "--providers",
    "local",
    "--local-library-path",
    libraryPath,
    "--memory",
    memoryPath,
    "--format",
    "json"
  ]);

  const generated = JSON.parse(ideaStdout);
  const ideaId = generated.frontier[0].id;
  const { stdout } = await runCli(["graph", "--memory", memoryPath, "--view", "network", "--idea-id", ideaId]);

  assert.match(stdout, /<!doctype html>/i);
  assert.match(stdout, /Research Memory Network/);
  assert.match(stdout, /Drag to pan, scroll to zoom/i);
  assert.match(stdout, /const graph = /);
});
