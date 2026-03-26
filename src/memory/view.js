function byUpdatedDesc(left, right) {
  return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime();
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function compactObjectEntries(input) {
  return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)));
}

export function summarizeMemoryGraph(graph) {
  const nodes = Object.values(graph.nodes || {});
  const ideas = nodes.filter((node) => node.kind === "idea");
  const latestQuery = nodes.filter((node) => node.kind === "query").sort(byUpdatedDesc)[0] || null;

  return {
    version: graph.version,
    runs: graph.stats?.runs || 0,
    updatedAt: graph.updatedAt || null,
    latestQuery: latestQuery?.label || null,
    nodeCount: nodes.length,
    edgeCount: (graph.edges || []).length,
    nodeKinds: compactObjectEntries(countBy(nodes, (node) => node.kind || "unknown")),
    edgeRelations: compactObjectEntries(countBy(graph.edges || [], (edge) => edge.relation || "unknown")),
    ideaStatuses: compactObjectEntries(countBy(ideas, (node) => node.status || "candidate")),
    feedbackDecisions: compactObjectEntries(
      countBy(
        ideas.filter((node) => node.payload?.feedback?.decision),
        (node) => node.payload.feedback.decision
      )
    )
  };
}

export function listGraphIdeas(graph, options = {}) {
  const limit = options.limit || 12;
  return Object.values(graph.nodes || {})
    .filter((node) => node.kind === "idea")
    .sort(byUpdatedDesc)
    .slice(0, limit)
    .map((node) => ({
      id: node.payload?.id || node.id.replace(/^idea:/, ""),
      nodeId: node.id,
      title: node.label,
      status: node.status || "candidate",
      persona: node.payload?.origin?.personaLabel || null,
      nearestLiterature: node.payload?.scores?.nearestPaperId || node.payload?.critique?.nearestPaperId || null,
      feedback: node.payload?.feedback || null,
      updatedAt: node.updatedAt || null
    }));
}

function resolveNodeId(graph, options = {}) {
  if (options.nodeId) {
    return options.nodeId;
  }

  if (options.ideaId) {
    return `idea:${options.ideaId}`;
  }

  const latestIdea = Object.values(graph.nodes || {})
    .filter((node) => node.kind === "idea")
    .sort(byUpdatedDesc)[0];

  return latestIdea?.id || null;
}

export function getGraphNeighborhood(graph, options = {}) {
  const nodeId = resolveNodeId(graph, options);
  if (!nodeId) {
    return {
      center: null,
      edges: [],
      relatedNodes: []
    };
  }

  const center = graph.nodes?.[nodeId] || null;
  if (!center) {
    return {
      center: null,
      edges: [],
      relatedNodes: []
    };
  }

  const edges = (graph.edges || []).filter((edge) => edge.source === nodeId || edge.target === nodeId);
  const relatedIds = [...new Set(edges.map((edge) => (edge.source === nodeId ? edge.target : edge.source)))];
  const relatedNodes = relatedIds.map((id) => graph.nodes?.[id]).filter(Boolean).sort(byUpdatedDesc);

  return {
    center,
    edges,
    relatedNodes
  };
}

export function formatGraphSummaryMarkdown(summary) {
  return [
    "# Memory Graph",
    "",
    `- Runs: ${summary.runs}`,
    `- Updated at: ${summary.updatedAt || "n/a"}`,
    `- Latest query: ${summary.latestQuery || "n/a"}`,
    `- Nodes: ${summary.nodeCount}`,
    `- Edges: ${summary.edgeCount}`,
    `- Node kinds: ${Object.entries(summary.nodeKinds)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ") || "n/a"}`,
    `- Edge relations: ${Object.entries(summary.edgeRelations)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ") || "n/a"}`,
    `- Idea statuses: ${Object.entries(summary.ideaStatuses)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ") || "n/a"}`,
    `- Feedback decisions: ${Object.entries(summary.feedbackDecisions)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ") || "n/a"}`
  ].join("\n");
}

export function formatGraphIdeasMarkdown(ideas) {
  const lines = ["# Graph Ideas", ""];

  for (const idea of ideas) {
    lines.push(`- ${idea.id}: ${idea.title}`);
    lines.push(`  status=${idea.status}; persona=${idea.persona || "n/a"}; nearest=${idea.nearestLiterature || "n/a"}`);
    if (idea.feedback?.decision) {
      lines.push(`  feedback=${idea.feedback.decision}${idea.feedback.note ? ` (${idea.feedback.note})` : ""}`);
    }
  }

  return lines.join("\n");
}

export function formatGraphNeighborhoodMarkdown(neighborhood) {
  if (!neighborhood.center) {
    return "# Graph Neighborhood\n\nNo matching node found.";
  }

  const lines = [
    "# Graph Neighborhood",
    "",
    `- Center: ${neighborhood.center.id}`,
    `- Kind: ${neighborhood.center.kind}`,
    `- Label: ${neighborhood.center.label}`,
    ""
  ];

  if (!neighborhood.relatedNodes.length) {
    lines.push("No adjacent nodes.");
    return lines.join("\n");
  }

  lines.push("## Adjacent Nodes", "");
  for (const node of neighborhood.relatedNodes) {
    const edge =
      neighborhood.edges.find((item) => item.source === neighborhood.center.id && item.target === node.id) ||
      neighborhood.edges.find((item) => item.target === neighborhood.center.id && item.source === node.id);
    lines.push(`- ${node.id}: ${node.label}`);
    lines.push(`  kind=${node.kind}; relation=${edge?.relation || "n/a"}; weight=${edge?.weight || 1}`);
  }

  return lines.join("\n");
}
