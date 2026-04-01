import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { installClaudeCommand, installCodexSkill } from "../src/install.js";

async function readFile(filePath) {
  return fs.readFile(filePath, "utf8");
}

test("installCodexSkill copies the packaged skill into the target home directory", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "rie-home-"));
  const result = await installCodexSkill({ homeDir });
  const skillFile = path.join(result.targetDir, "SKILL.md");

  const contents = await readFile(skillFile);

  assert.equal(result.targetDir, path.join(homeDir, ".codex", "skills", "research-idea-explorer"));
  assert.match(contents, /Research Idea Explorer Skill/);
});

test("installClaudeCommand copies the packaged Claude command into the target project", async () => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "rie-project-"));
  const result = await installClaudeCommand({ projectDir });
  const contents = await readFile(result.targetFile);

  assert.equal(
    result.targetFile,
    path.join(projectDir, ".claude", "commands", "research-idea-explorer.md")
  );
  assert.match(contents, /Turn the user's topic into brainstorm seeds first/);
});
