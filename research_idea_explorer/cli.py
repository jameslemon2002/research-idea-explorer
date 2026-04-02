"""CLI entrypoints for the Python backend."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from .engine import build_query_seed, run_idea_pipeline
from .install import install_agent_surfaces, install_claude_command, install_codex_skill
from .memory import (
    collect_idea_nodes,
    create_memory_graph,
    format_graph_ideas_markdown,
    format_graph_neighborhood_markdown,
    format_graph_summary_markdown,
    get_graph_neighborhood,
    list_graph_ideas,
    load_memory_graph,
    record_idea_decision,
    save_memory_graph,
    summarize_memory_graph,
)
from .presentation import build_json_result, format_ideas_markdown
from .providers import search_literature_sources


def _pick_memory_path(memory: str | None) -> str:
    return memory or os.environ.get("RESEARCH_MEMORY_PATH") or "data/memory/cli-memory.json"


def _normalize_providers(args: argparse.Namespace) -> list[str] | None:
    if args.providers:
        return [item.strip() for item in args.providers.split(",") if item.strip()]
    if args.local_library_path or args.local_library:
        return ["local"]
    if args.web_url or args.web_urls:
        return ["web"]
    return None


def _as_array(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _write_output(output_path: str | None, content: str) -> None:
    if not output_path:
        return
    path = Path(output_path).expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def run_ideas_command(args: argparse.Namespace) -> str:
    query = args.query or " ".join(args.text or []).strip()
    if not query:
        raise SystemExit('Missing query. Pass --query "..." or provide positional text.')
    memory_path = _pick_memory_path(args.memory)
    memory_graph = load_memory_graph(memory_path) if Path(memory_path).exists() else create_memory_graph()
    providers = _normalize_providers(args)
    result = search_literature_sources(
        query,
        {
            "providers": providers,
            "perProviderLimit": args.per_provider_limit,
            "rankLimit": args.rank_limit,
            "timeoutMs": args.timeout_ms,
            "searchStrategy": args.search_strategy or "hybrid",
            "domain": args.domain,
            "localLibraryPath": args.local_library_path or args.local_library,
            "webUrls": _as_array(args.web_url) + _as_array(args.web_urls),
            "ssrnUrls": _as_array(args.ssrn_url) + _as_array(args.ssrn_urls),
            "semanticScholarApiKey": args.semantic_scholar_api_key,
            "elsevierApiKey": args.elsevier_api_key,
            "springerApiKey": args.springer_api_key,
        },
    )
    seed = build_query_seed(query, result, domain=args.domain)
    pipeline = run_idea_pipeline(
        seed,
        result["index"],
        frontier_limit=args.frontier_limit,
        memory_scope=args.memory_scope or "topic",
        memory_topic_threshold=args.memory_topic_threshold,
        rounds=args.rounds,
        query=query,
        memory_graph=memory_graph,
        search_strategy=args.search_strategy or "hybrid",
    )
    save_memory_graph(memory_path, pipeline["memoryGraph"])
    full_result = {**result, "pipeline": pipeline, "query": query}
    output = build_json_result(full_result, memory_path) if args.format == "json" else format_ideas_markdown(full_result, memory_path)
    _write_output(args.output, output)
    return f"{output}\n"


def run_feedback_command(args: argparse.Namespace) -> str:
    memory_path = _pick_memory_path(args.memory)
    graph = load_memory_graph(memory_path)
    if not args.idea_id:
        ideas = [
            {
                "id": node.get("payload", {}).get("id") or node["id"].removeprefix("idea:"),
                "title": node.get("label"),
                "status": node.get("status", "candidate"),
            }
            for node in collect_idea_nodes(graph)
        ]
        return json.dumps({"memoryPath": memory_path, "ideas": ideas}, indent=2) + "\n"
    updated = record_idea_decision(graph, args.idea_id, args.decision or "accepted", note=args.note or "", source="cli")
    if not updated:
        raise SystemExit(f"Unknown idea id: {args.idea_id}")
    save_memory_graph(memory_path, graph)
    return json.dumps({"memoryPath": memory_path, "ideaId": args.idea_id, "decision": args.decision or "accepted", "note": args.note or ""}, indent=2) + "\n"


def run_graph_command(args: argparse.Namespace) -> str:
    memory_path = _pick_memory_path(args.memory)
    graph = load_memory_graph(memory_path)
    view = args.view or "summary"
    if view == "summary":
        summary = summarize_memory_graph(graph)
        output = json.dumps({"memoryPath": memory_path, "summary": summary}, indent=2) if args.format == "json" else format_graph_summary_markdown(summary)
    elif view == "ideas":
        ideas = list_graph_ideas(graph, limit=args.limit)
        output = json.dumps({"memoryPath": memory_path, "ideas": ideas}, indent=2) if args.format == "json" else format_graph_ideas_markdown(ideas)
    elif view == "neighbors":
        neighborhood = get_graph_neighborhood(graph, idea_id=args.idea_id, node_id=args.node_id)
        output = json.dumps({"memoryPath": memory_path, "neighborhood": neighborhood}, indent=2) if args.format == "json" else format_graph_neighborhood_markdown(neighborhood)
    elif view == "json":
        output = json.dumps({"memoryPath": memory_path, "graph": graph}, indent=2)
    else:
        raise SystemExit(f"Unknown graph view: {view}. Supported views: summary, ideas, neighbors, json.")
    _write_output(args.output, output)
    return f"{output}\n"


def run_install_command(args: argparse.Namespace) -> str:
    if args.target == "codex-skill":
        result = install_codex_skill(home_dir=args.home)
        return "\n".join(["Installed Codex skill.", f"- Target: {result['targetDir']}", "", "Next step:", "- Restart Codex, then call `$research-idea-explorer` in a prompt.", ""])
    if args.target == "claude-command":
        result = install_claude_command(project_dir=args.project)
        return "\n".join(["Installed Claude Code command.", f"- Target: {result['targetFile']}", "", "Next step:", "- In that project, run `/research-idea-explorer`.", ""])
    if args.target == "all":
        result = install_agent_surfaces(home_dir=args.home, project_dir=args.project)
        return "\n".join(
            [
                "Installed agent surfaces.",
                f"- Codex skill: {result['codex']['targetDir']}",
                f"- Claude command: {result['claude']['targetFile']}",
                "",
                "Next steps:",
                "- Restart Codex, then call `$research-idea-explorer`.",
                "- In the target Claude Code project, run `/research-idea-explorer`.",
                "",
            ]
        )
    raise SystemExit("Unknown install target. Supported targets: codex-skill, claude-command, all.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="research-idea-explorer")
    subparsers = parser.add_subparsers(dest="command")

    ideas = subparsers.add_parser("ideas")
    ideas.add_argument("text", nargs="*")
    ideas.add_argument("--query")
    ideas.add_argument("--memory")
    ideas.add_argument("--providers")
    ideas.add_argument("--per-provider-limit", type=int, default=8)
    ideas.add_argument("--rank-limit", type=int, default=14)
    ideas.add_argument("--timeout-ms", type=int)
    ideas.add_argument("--search-strategy", default="hybrid")
    ideas.add_argument("--domain")
    ideas.add_argument("--local-library-path")
    ideas.add_argument("--local-library")
    ideas.add_argument("--web-url", action="append")
    ideas.add_argument("--web-urls", action="append")
    ideas.add_argument("--ssrn-url", action="append")
    ideas.add_argument("--ssrn-urls", action="append")
    ideas.add_argument("--semantic-scholar-api-key")
    ideas.add_argument("--elsevier-api-key")
    ideas.add_argument("--springer-api-key")
    ideas.add_argument("--frontier-limit", type=int, default=6)
    ideas.add_argument("--memory-scope", default="topic")
    ideas.add_argument("--memory-topic-threshold", type=float)
    ideas.add_argument("--rounds", type=int)
    ideas.add_argument("--format")
    ideas.add_argument("--output")

    feedback = subparsers.add_parser("feedback")
    feedback.add_argument("--memory")
    feedback.add_argument("--idea-id")
    feedback.add_argument("--decision", default="accepted")
    feedback.add_argument("--note")

    graph = subparsers.add_parser("graph")
    graph.add_argument("--memory")
    graph.add_argument("--view", default="summary")
    graph.add_argument("--format")
    graph.add_argument("--limit", type=int, default=12)
    graph.add_argument("--idea-id")
    graph.add_argument("--node-id")
    graph.add_argument("--output")

    install = subparsers.add_parser("install")
    install.add_argument("target")
    install.add_argument("--home")
    install.add_argument("--project")

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    command = args.command or "ideas"
    if args.command is None:
        args.text = getattr(args, "text", [])
    output = ""
    if command == "ideas":
        output = run_ideas_command(args)
    elif command == "feedback":
        output = run_feedback_command(args)
    elif command == "graph":
        output = run_graph_command(args)
    elif command == "install":
        output = run_install_command(args)
    else:
        parser.error(f"Unknown command: {command}")
    print(output, end="")


if __name__ == "__main__":
    main()
