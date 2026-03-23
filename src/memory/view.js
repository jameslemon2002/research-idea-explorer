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

function truncateLabel(value, maxLength = 84) {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function compactObjectEntries(input) {
  return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJson(value) {
  return String(value || "").replace(/</g, "\\u003c");
}

function nodeRadius(node) {
  if (node.kind === "query") {
    return 20;
  }

  if (node.kind === "idea") {
    return {
      accepted: 18,
      frontier: 17,
      candidate: 15,
      rejected: 15
    }[node.status] || 16;
  }

  if (node.kind === "paper") {
    return 12;
  }

  if (node.kind === "persona") {
    return 10;
  }

  return 10;
}

function nodeFill(node) {
  const palette = {
    query: "#0f766e",
    idea: "#f59e0b",
    paper: "#2563eb",
    persona: "#7c3aed"
  };
  return palette[node.kind] || "#475569";
}

function nodeStroke(node) {
  if (node.kind !== "idea") {
    return "#0f172a";
  }

  return {
    accepted: "#166534",
    frontier: "#92400e",
    candidate: "#334155",
    rejected: "#b91c1c"
  }[node.status] || "#334155";
}

function edgeStyle(edge) {
  const palette = {
    retrieved: { stroke: "#94a3b8", width: 1.4, dasharray: "" },
    generated: { stroke: "#0f766e", width: 1.8, dasharray: "" },
    proposed: { stroke: "#f59e0b", width: 1.6, dasharray: "5 4" },
    nearest_literature: { stroke: "#2563eb", width: 1.6, dasharray: "" },
    similar_to: { stroke: "#dc2626", width: 1.5, dasharray: "3 3" }
  };
  return palette[edge.relation] || { stroke: "#94a3b8", width: 1.2, dasharray: "" };
}

function nodeTooltip(node) {
  const lines = [node.label];

  if (node.kind === "idea" && node.status) {
    lines.push(`status: ${node.status}`);
  }

  if (node.kind === "idea" && node.payload?.origin?.personaLabel) {
    lines.push(`persona: ${node.payload.origin.personaLabel}`);
  }

  if (node.kind === "paper" && node.payload?.year) {
    lines.push(`year: ${node.payload.year}`);
  }

  return lines.join(" | ");
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

function mermaidNodeRef(id) {
  return `n_${String(id).replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

function mermaidLabel(node) {
  const prefix = {
    query: "Query",
    idea: "Idea",
    paper: "Paper",
    persona: "Persona"
  }[node.kind] || "Node";
  return `${prefix}: ${truncateLabel(node.label, 68)}`.replace(/"/g, "'");
}

function collectDefaultMermaidSubgraph(graph, options = {}) {
  const limit = options.limit || 6;
  const nodes = Object.values(graph.nodes || {});
  const queries = nodes.filter((node) => node.kind === "query").sort(byUpdatedDesc);
  const ideas = nodes
    .filter((node) => node.kind === "idea")
    .sort((left, right) => {
      const statusOrder = {
        accepted: 0,
        frontier: 1,
        candidate: 2,
        rejected: 3
      };
      const score = (node) => statusOrder[node.status] ?? 4;
      return score(left) - score(right) || byUpdatedDesc(left, right);
    })
    .slice(0, limit);

  const selectedIds = new Set([...queries.slice(0, 1).map((node) => node.id), ...ideas.map((node) => node.id)]);
  const selectedEdges = [];

  for (const edge of graph.edges || []) {
    if (selectedIds.has(edge.source) || selectedIds.has(edge.target)) {
      selectedEdges.push(edge);
      selectedIds.add(edge.source);
      selectedIds.add(edge.target);
    }
  }

  const selectedNodes = [...selectedIds].map((id) => graph.nodes?.[id]).filter(Boolean);
  return {
    nodes: selectedNodes,
    edges: selectedEdges
  };
}

function collectGraphSubgraph(graph, options = {}) {
  const neighborhood = options.ideaId || options.nodeId ? getGraphNeighborhood(graph, options) : null;
  return neighborhood?.center
    ? {
        nodes: [neighborhood.center, ...neighborhood.relatedNodes],
        edges: neighborhood.edges,
        centerId: neighborhood.center.id
      }
    : {
        ...collectDefaultMermaidSubgraph(graph, options),
        centerId: null
      };
}

function initialNodePosition(node, index, total, width, height, centerId) {
  const centerX = width / 2;
  const centerY = height / 2;

  if (node.id === centerId) {
    return { x: centerX, y: centerY };
  }

  const kindRadius = {
    query: 90,
    idea: 200,
    paper: 300,
    persona: 380
  };

  const baseRadius = kindRadius[node.kind] || 260;
  const angle = (Math.PI * 2 * index) / Math.max(total, 1);
  return {
    x: centerX + Math.cos(angle) * baseRadius,
    y: centerY + Math.sin(angle) * baseRadius
  };
}

function layoutSubgraph(subgraph, options = {}) {
  const width = options.width || 1200;
  const height = options.height || 760;
  const padding = options.padding || 70;
  const centerX = width / 2;
  const centerY = height / 2;
  const nodes = subgraph.nodes.map((node, index) => ({
    ...node,
    x: initialNodePosition(node, index, subgraph.nodes.length, width, height, subgraph.centerId).x,
    y: initialNodePosition(node, index, subgraph.nodes.length, width, height, subgraph.centerId).y
  }));
  const edges = subgraph.edges.filter(
    (edge) =>
      nodes.find((node) => node.id === edge.source) &&
      nodes.find((node) => node.id === edge.target)
  );
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  for (let iteration = 0; iteration < 180; iteration += 1) {
    const forces = new Map(nodes.map((node) => [node.id, { x: 0, y: 0 }]));

    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
        const left = nodes[leftIndex];
        const right = nodes[rightIndex];
        let dx = right.x - left.x;
        let dy = right.y - left.y;
        const distance = Math.max(Math.hypot(dx, dy), 1);
        dx /= distance;
        dy /= distance;
        const strength = 12000 / (distance * distance);
        forces.get(left.id).x -= dx * strength;
        forces.get(left.id).y -= dy * strength;
        forces.get(right.id).x += dx * strength;
        forces.get(right.id).y += dy * strength;
      }
    }

    for (const edge of edges) {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) {
        continue;
      }

      let dx = target.x - source.x;
      let dy = target.y - source.y;
      const distance = Math.max(Math.hypot(dx, dy), 1);
      dx /= distance;
      dy /= distance;
      const desired = edge.relation === "similar_to" ? 180 : 130;
      const strength = (distance - desired) * 0.015 * (edge.weight || 1);
      forces.get(source.id).x += dx * strength;
      forces.get(source.id).y += dy * strength;
      forces.get(target.id).x -= dx * strength;
      forces.get(target.id).y -= dy * strength;
    }

    for (const node of nodes) {
      const force = forces.get(node.id);
      const gravity = node.id === subgraph.centerId ? 0.08 : 0.02;
      force.x += (centerX - node.x) * gravity;
      force.y += (centerY - node.y) * gravity;

      if (node.kind === "paper") {
        force.x += (centerX - node.x) * 0.004;
        force.y += (centerY - node.y) * 0.004;
      }

      if (node.id === subgraph.centerId) {
        node.x = centerX;
        node.y = centerY;
        continue;
      }

      node.x = clamp(node.x + force.x, padding, width - padding);
      node.y = clamp(node.y + force.y, padding, height - padding);
    }
  }

  return {
    width,
    height,
    nodes,
    edges
  };
}

function renderLegendSvg(width) {
  const items = [
    { label: "Query", fill: "#0f766e", stroke: "#0f172a" },
    { label: "Idea", fill: "#f59e0b", stroke: "#334155" },
    { label: "Paper", fill: "#2563eb", stroke: "#0f172a" },
    { label: "Persona", fill: "#7c3aed", stroke: "#0f172a" }
  ];

  const lines = [];
  let x = 24;
  for (const item of items) {
    lines.push(`<circle cx="${x}" cy="24" r="7" fill="${item.fill}" stroke="${item.stroke}" stroke-width="1.5" />`);
    lines.push(
      `<text x="${x + 14}" y="28" font-size="13" fill="#0f172a" font-family="ui-sans-serif, system-ui, sans-serif">${escapeHtml(
        item.label
      )}</text>`
    );
    x += 110;
  }

  lines.push(
    `<text x="${width - 330}" y="28" font-size="12" fill="#475569" font-family="ui-sans-serif, system-ui, sans-serif">solid: retrieved/generated/nearest | dashed: proposed/similar</text>`
  );
  return lines.join("\n");
}

export function buildSvgNetwork(graph, options = {}) {
  const layout = layoutSubgraph(collectGraphSubgraph(graph, options), options);
  const edgeLines = [];
  const nodeLines = [];
  const labels = [];

  for (const edge of layout.edges) {
    const source = layout.nodes.find((node) => node.id === edge.source);
    const target = layout.nodes.find((node) => node.id === edge.target);
    if (!source || !target) {
      continue;
    }
    const style = edgeStyle(edge);
    edgeLines.push(
      `<line x1="${source.x.toFixed(2)}" y1="${source.y.toFixed(2)}" x2="${target.x.toFixed(2)}" y2="${target.y.toFixed(
        2
      )}" stroke="${style.stroke}" stroke-width="${style.width}" stroke-opacity="0.55"${
        style.dasharray ? ` stroke-dasharray="${style.dasharray}"` : ""
      } />`
    );
  }

  for (const node of layout.nodes) {
    const radius = nodeRadius(node);
    nodeLines.push(
      `<g class="node node-${escapeHtml(node.kind)}">` +
        `<title>${escapeHtml(nodeTooltip(node))}</title>` +
        `<circle cx="${node.x.toFixed(2)}" cy="${node.y.toFixed(2)}" r="${radius}" fill="${nodeFill(node)}" fill-opacity="0.92" stroke="${nodeStroke(
          node
        )}" stroke-width="2.5" />` +
        `</g>`
    );

    labels.push(
      `<text x="${node.x.toFixed(2)}" y="${(node.y + radius + 15).toFixed(
        2
      )}" text-anchor="middle" font-size="12" fill="#0f172a" font-family="ui-sans-serif, system-ui, sans-serif">${escapeHtml(
        truncateLabel(node.label, 34)
      )}</text>`
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}" role="img" aria-label="Research memory network">`,
    `<rect width="${layout.width}" height="${layout.height}" fill="#f8fafc" rx="18" ry="18" />`,
    `<rect x="12" y="12" width="${layout.width - 24}" height="${layout.height - 24}" fill="none" stroke="#e2e8f0" stroke-width="1.5" rx="14" ry="14" />`,
    renderLegendSvg(layout.width),
    `<g class="edges">${edgeLines.join("\n")}</g>`,
    `<g class="nodes">${nodeLines.join("\n")}</g>`,
    `<g class="labels">${labels.join("\n")}</g>`,
    `</svg>`
  ].join("\n");
}

export function buildNetworkHtml(graph, options = {}) {
  const layout = layoutSubgraph(collectGraphSubgraph(graph, options), options);
  const serialized = escapeJson(
    JSON.stringify({
      width: layout.width,
      height: layout.height,
      nodes: layout.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        status: node.status || null,
        label: node.label,
        x: Number(node.x.toFixed(2)),
        y: Number(node.y.toFixed(2)),
        radius: nodeRadius(node),
        fill: nodeFill(node),
        stroke: nodeStroke(node),
        tooltip: nodeTooltip(node)
      })),
      edges: layout.edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        relation: edge.relation,
        weight: edge.weight || 1,
        ...edgeStyle(edge)
      }))
    })
  );

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Research Memory Network</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f8fafc;
      --panel: #ffffff;
      --ink: #0f172a;
      --muted: #475569;
      --line: #dbe4ee;
      --shadow: 0 18px 45px rgba(15, 23, 42, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(15, 118, 110, 0.12), transparent 28%),
        radial-gradient(circle at top right, rgba(37, 99, 235, 0.12), transparent 24%),
        var(--bg);
      color: var(--ink);
    }
    .shell {
      padding: 24px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 300px;
      gap: 18px;
      min-height: 100vh;
    }
    .stage, .panel {
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(219, 228, 238, 0.95);
      border-radius: 20px;
      box-shadow: var(--shadow);
    }
    .stage {
      padding: 14px;
      overflow: hidden;
      position: relative;
    }
    .panel {
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .panel h1 {
      margin: 0;
      font-size: 1.1rem;
    }
    .panel p, .panel li {
      margin: 0;
      color: var(--muted);
      line-height: 1.5;
    }
    .legend {
      display: grid;
      gap: 8px;
      font-size: 0.95rem;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .dot {
      width: 12px;
      height: 12px;
      border-radius: 999px;
      border: 2px solid #0f172a;
      flex: 0 0 auto;
    }
    .edge-key {
      font-family: ui-monospace, "SFMono-Regular", monospace;
      font-size: 0.85rem;
      color: var(--muted);
    }
    .hint {
      font-size: 0.85rem;
      color: var(--muted);
    }
    .node-title {
      font-weight: 700;
    }
    .meta {
      display: grid;
      gap: 6px;
      font-size: 0.92rem;
    }
    svg {
      width: 100%;
      height: auto;
      display: block;
      cursor: grab;
      user-select: none;
    }
    .edge-label {
      font-size: 10px;
      fill: #64748b;
      pointer-events: none;
    }
    .node-label {
      font-size: 12px;
      fill: #0f172a;
      pointer-events: none;
    }
    .node:hover circle {
      filter: drop-shadow(0 0 10px rgba(15, 23, 42, 0.18));
    }
    @media (max-width: 1100px) {
      .shell {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="stage">
      <svg id="graph" viewBox="0 0 ${layout.width} ${layout.height}" aria-label="Research memory network"></svg>
    </section>
    <aside class="panel">
      <div>
        <h1>Research Memory Network</h1>
        <p class="hint">Drag to pan, scroll to zoom, click a node to inspect its role in the current exploration path.</p>
      </div>
      <div class="legend">
        <div class="legend-item"><span class="dot" style="background:#0f766e"></span><span>Query</span></div>
        <div class="legend-item"><span class="dot" style="background:#f59e0b;border-color:#334155"></span><span>Idea</span></div>
        <div class="legend-item"><span class="dot" style="background:#2563eb"></span><span>Paper</span></div>
        <div class="legend-item"><span class="dot" style="background:#7c3aed"></span><span>Persona</span></div>
      </div>
      <div class="edge-key">Edges: retrieved / generated / proposed / nearest_literature / similar_to</div>
      <div class="meta">
        <div class="node-title" id="node-title">No node selected</div>
        <div id="node-kind" class="hint">Click a node to inspect it.</div>
        <div id="node-extra"></div>
      </div>
    </aside>
  </div>
  <script>
    const graph = ${serialized};
    const svg = document.getElementById("graph");
    const nodeTitle = document.getElementById("node-title");
    const nodeKind = document.getElementById("node-kind");
    const nodeExtra = document.getElementById("node-extra");

    const ns = "http://www.w3.org/2000/svg";
    const root = document.createElementNS(ns, "g");
    const edgeLayer = document.createElementNS(ns, "g");
    const nodeLayer = document.createElementNS(ns, "g");
    const labelLayer = document.createElementNS(ns, "g");
    root.append(edgeLayer, nodeLayer, labelLayer);
    svg.append(root);

    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

    for (const edge of graph.edges) {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (!source || !target) continue;
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", source.x);
      line.setAttribute("y1", source.y);
      line.setAttribute("x2", target.x);
      line.setAttribute("y2", target.y);
      line.setAttribute("stroke", edge.stroke);
      line.setAttribute("stroke-width", edge.width);
      line.setAttribute("stroke-opacity", "0.55");
      if (edge.dasharray) line.setAttribute("stroke-dasharray", edge.dasharray);
      edgeLayer.append(line);
    }

    for (const node of graph.nodes) {
      const group = document.createElementNS(ns, "g");
      group.setAttribute("class", "node");
      group.dataset.id = node.id;

      const circle = document.createElementNS(ns, "circle");
      circle.setAttribute("cx", node.x);
      circle.setAttribute("cy", node.y);
      circle.setAttribute("r", node.radius);
      circle.setAttribute("fill", node.fill);
      circle.setAttribute("stroke", node.stroke);
      circle.setAttribute("stroke-width", "2.5");
      circle.setAttribute("fill-opacity", "0.92");

      const title = document.createElementNS(ns, "title");
      title.textContent = node.tooltip;
      circle.append(title);

      group.append(circle);
      group.addEventListener("click", () => {
        nodeTitle.textContent = node.label;
        nodeKind.textContent = [node.kind, node.status].filter(Boolean).join(" | ");
        nodeExtra.textContent = node.tooltip;
      });
      nodeLayer.append(group);

      const label = document.createElementNS(ns, "text");
      label.setAttribute("x", node.x);
      label.setAttribute("y", node.y + node.radius + 15);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("class", "node-label");
      label.textContent = node.label.length > 34 ? node.label.slice(0, 33) + "…" : node.label;
      labelLayer.append(label);
    }

    let scale = 1;
    let originX = 0;
    let originY = 0;
    let dragging = false;
    let startX = 0;
    let startY = 0;

    function paint() {
      root.setAttribute("transform", "translate(" + originX + " " + originY + ") scale(" + scale + ")");
    }

    svg.addEventListener("wheel", (event) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.08 : 0.92;
      scale = Math.max(0.45, Math.min(2.4, scale * factor));
      paint();
    });

    svg.addEventListener("pointerdown", (event) => {
      dragging = true;
      startX = event.clientX - originX;
      startY = event.clientY - originY;
      svg.style.cursor = "grabbing";
    });

    window.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      originX = event.clientX - startX;
      originY = event.clientY - startY;
      paint();
    });

    window.addEventListener("pointerup", () => {
      dragging = false;
      svg.style.cursor = "grab";
    });

    paint();
  </script>
</body>
</html>`;
}

export function buildMermaidGraph(graph, options = {}) {
  const subgraph = collectGraphSubgraph(graph, options);

  const lines = ["```mermaid", "flowchart TD"];

  for (const node of subgraph.nodes) {
    lines.push(`  ${mermaidNodeRef(node.id)}["${mermaidLabel(node)}"]`);
  }

  for (const edge of subgraph.edges) {
    if (!subgraph.nodes.find((node) => node.id === edge.source) || !subgraph.nodes.find((node) => node.id === edge.target)) {
      continue;
    }
    const label = `${edge.relation}${edge.weight && edge.weight !== 1 ? ` (${edge.weight})` : ""}`.replace(/"/g, "'");
    lines.push(`  ${mermaidNodeRef(edge.source)} -->|${label}| ${mermaidNodeRef(edge.target)}`);
  }

  lines.push("```");
  return lines.join("\n");
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
    const edge = neighborhood.edges.find((item) => item.source === neighborhood.center.id && item.target === node.id) ||
      neighborhood.edges.find((item) => item.target === neighborhood.center.id && item.source === node.id);
    lines.push(`- ${node.id}: ${node.label}`);
    lines.push(`  kind=${node.kind}; relation=${edge?.relation || "n/a"}; weight=${edge?.weight || 1}`);
  }

  return lines.join("\n");
}
