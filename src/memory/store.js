import fs from "node:fs/promises";
import path from "node:path";

import { createMemoryGraph } from "./graph.js";

export async function loadMemoryGraph(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return createMemoryGraph(JSON.parse(raw));
  } catch (error) {
    if (error.code === "ENOENT") {
      return createMemoryGraph();
    }
    throw error;
  }
}

export async function saveMemoryGraph(filePath, graph) {
  const absolutePath = path.resolve(filePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, JSON.stringify(graph, null, 2));
  return absolutePath;
}

