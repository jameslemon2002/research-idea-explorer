import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const SKILL_NAME = "research-idea-explorer";
const CLAUDE_COMMAND_NAME = "research-idea-explorer";

function resolvePathFromRoot(...segments) {
  return path.join(PACKAGE_ROOT, ...segments);
}

export function getPackageRoot() {
  return PACKAGE_ROOT;
}

export async function installCodexSkill(options = {}) {
  const homeDir = path.resolve(options.homeDir || os.homedir());
  const sourceDir = resolvePathFromRoot("skills", SKILL_NAME);
  const targetDir = path.join(homeDir, ".codex", "skills", SKILL_NAME);

  await fs.mkdir(path.dirname(targetDir), { recursive: true });
  await fs.cp(sourceDir, targetDir, { recursive: true, force: true });

  return {
    sourceDir,
    targetDir
  };
}

export async function installClaudeCommand(options = {}) {
  const projectDir = path.resolve(options.projectDir || process.cwd());
  const sourceFile = resolvePathFromRoot(".claude", "commands", `${CLAUDE_COMMAND_NAME}.md`);
  const targetFile = path.join(projectDir, ".claude", "commands", `${CLAUDE_COMMAND_NAME}.md`);

  await fs.mkdir(path.dirname(targetFile), { recursive: true });
  await fs.copyFile(sourceFile, targetFile);

  return {
    sourceFile,
    targetFile
  };
}

export async function installAgentSurfaces(options = {}) {
  const codex = await installCodexSkill(options);
  const claude = await installClaudeCommand(options);

  return {
    codex,
    claude
  };
}
