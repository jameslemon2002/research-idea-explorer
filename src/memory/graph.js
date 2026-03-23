import { ideaSimilarity } from "../engine/dedupe.js";
import { buildIdeaSignature, unique } from "../schema.js";

function nowIso() {
  return new Date().toISOString();
}

function edgeId(source, target, relation) {
  return `${source}|${relation}|${target}`;
}

export function createMemoryGraph(input = {}) {
  return {
    version: 1,
    createdAt: input.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso(),
    nodes: input.nodes || {},
    edges: input.edges || [],
    stats: input.stats || {
      runs: 0
    }
  };
}

function upsertNode(graph, node) {
  const existing = graph.nodes[node.id];
  graph.nodes[node.id] = existing
    ? {
        ...existing,
        ...node,
        updatedAt: nowIso()
      }
    : {
        ...node,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
  graph.updatedAt = nowIso();
  return graph.nodes[node.id];
}

function upsertEdge(graph, edge) {
  const id = edgeId(edge.source, edge.target, edge.relation);
  const existingIndex = graph.edges.findIndex((candidate) => candidate.id === id);
  const nextEdge = {
    id,
    weight: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...edge
  };

  if (existingIndex >= 0) {
    graph.edges[existingIndex] = {
      ...graph.edges[existingIndex],
      ...nextEdge,
      updatedAt: nowIso()
    };
  } else {
    graph.edges.push(nextEdge);
  }
}

function queryNodeId(query) {
  return `query:${String(query || "").toLowerCase().trim()}`;
}

function personaNodeId(personaId) {
  return `persona:${personaId}`;
}

function ideaNodeId(ideaId) {
  return `idea:${ideaId}`;
}

function paperNodeId(paperId) {
  return `paper:${paperId}`;
}

export function addPaperNode(graph, paper) {
  return upsertNode(graph, {
    id: paperNodeId(paper.id),
    kind: "paper",
    label: paper.title,
    payload: paper,
    signature: paper.id
  });
}

export function addIdeaNode(graph, idea, status = "candidate") {
  return upsertNode(graph, {
    id: ideaNodeId(idea.id),
    kind: "idea",
    label: idea.title,
    payload: idea,
    signature: idea.signature || buildIdeaSignature(idea),
    status
  });
}

export function addPersonaNode(graph, personaId, personaLabel) {
  return upsertNode(graph, {
    id: personaNodeId(personaId),
    kind: "persona",
    label: personaLabel || personaId,
    payload: {
      personaId,
      personaLabel
    },
    signature: personaId
  });
}

export function addQueryNode(graph, query) {
  return upsertNode(graph, {
    id: queryNodeId(query),
    kind: "query",
    label: query,
    payload: {
      query
    },
    signature: query
  });
}

export function collectVisitedIdeas(graph) {
  return Object.values(graph.nodes)
    .filter((node) => node.kind === "idea" && node.payload)
    .map((node) => node.payload);
}

export function collectIdeaNodes(graph) {
  return Object.values(graph.nodes).filter((node) => node.kind === "idea");
}

export function collectVisitedSignatures(graph) {
  return unique(
    Object.values(graph.nodes)
      .filter((node) => node.kind === "idea" && node.signature)
      .map((node) => node.signature)
  );
}

export function recordIdeaDecision(graph, ideaId, decision, meta = {}) {
  const node = graph.nodes[ideaNodeId(ideaId)];
  if (!node) {
    return null;
  }

  node.status = decision;
  node.payload = {
    ...(node.payload || {}),
    feedback: {
      decision,
      note: meta.note || "",
      source: meta.source || "user",
      decidedAt: nowIso()
    }
  };
  node.decisionHistory = [
    ...(node.decisionHistory || []),
    {
      decision,
      note: meta.note || "",
      source: meta.source || "user",
      decidedAt: nowIso()
    }
  ];
  node.updatedAt = nowIso();
  graph.updatedAt = nowIso();
  return node;
}

export function recordPipelineRun(graph, payload, options = {}) {
  const query = payload.query || payload.state?.focus?.objects?.join(" ") || payload.state?.focus?.domain || "query";
  const queryNode = addQueryNode(graph, query);
  const papers = Array.isArray(payload.paperIndex)
    ? payload.paperIndex
    : payload.paperIndex?.papers || payload.papers || [];
  const paperMap = new Map(papers.map((paper) => [paper.id, paper]));
  const rankedIdeas = payload.rankedIdeas || [];
  const frontierIds = new Set((payload.frontier || []).map((idea) => idea.id));

  for (const paper of papers.slice(0, options.paperLimit || 20)) {
    const paperNode = addPaperNode(graph, paper);
    upsertEdge(graph, {
      source: queryNode.id,
      target: paperNode.id,
      relation: "retrieved"
    });
  }

  for (const idea of rankedIdeas.slice(0, options.ideaLimit || 20)) {
    const ideaNode = addIdeaNode(graph, idea, frontierIds.has(idea.id) ? "frontier" : "candidate");
    upsertEdge(graph, {
      source: queryNode.id,
      target: ideaNode.id,
      relation: "generated"
    });

    if (idea.origin?.personaId) {
      const personaNode = addPersonaNode(graph, idea.origin.personaId, idea.origin.personaLabel);
      upsertEdge(graph, {
        source: personaNode.id,
        target: ideaNode.id,
        relation: "proposed"
      });
    }

    const linkedPaperIds = unique([
      idea.scores?.nearestPaperId,
      ...(idea.origin?.sourcePaperIds || [])
    ]).filter(Boolean);

    for (const linkedPaperId of linkedPaperIds) {
      const paper = paperMap.get(linkedPaperId);
      if (!paper) {
        continue;
      }

      const paperNode = addPaperNode(graph, paper);
      upsertEdge(graph, {
        source: ideaNode.id,
        target: paperNode.id,
        relation: "nearest_literature"
      });
    }
  }

  const ideas = rankedIdeas.slice(0, options.ideaLimit || 20);
  for (let leftIndex = 0; leftIndex < ideas.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ideas.length; rightIndex += 1) {
      const similarity = ideaSimilarity(ideas[leftIndex], ideas[rightIndex]);
      if (similarity < (options.similarityThreshold || 0.76)) {
        continue;
      }

      upsertEdge(graph, {
        source: ideaNodeId(ideas[leftIndex].id),
        target: ideaNodeId(ideas[rightIndex].id),
        relation: "similar_to",
        weight: Number(similarity.toFixed(3))
      });
    }
  }

  graph.stats.runs = (graph.stats.runs || 0) + 1;
  graph.updatedAt = nowIso();
  return graph;
}
