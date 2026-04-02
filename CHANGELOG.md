# Changelog

This file is the canonical update history for major product changes in `Research Idea Explorer`.

Rule going forward:
- add a new top section for every major workflow, architecture, or product-facing release
- summarize user-visible changes, not every small commit
- if semantic versions are introduced later, keep the same file and switch section titles to version numbers

## Unreleased

- Reserve this section for the next major milestone before it ships.

## 2026-04-02 · Python Backend Refactor

Highlights:
- Rebuilt the runtime as a Python package with console entry points `research-idea-explorer` and `rie`.
- Migrated the CLI surface, pipeline, memory graph, literature retrieval, and installer flows from the previous Node implementation.
- Switched user-facing installation guidance to Python-first packaging instead of repo-local Node execution.
- Added Python test coverage for pipeline behavior, CLI output, and Codex / Claude surface installation.
- Reframed the docs so `Codex CLI` and `Claude Code` are the primary user entry points and the backend is the packaged Python command.

## 2026-03-27 · Lateral Reset Under Repeated Rejection

Commits:
- `1bc1d9a` Add lateral reset for repeated rejection

Highlights:
- Added a `lateral_reset` feedback mode so repeated rejection no longer pushes the system to keep narrowing the same idea lane.
- Expanded retrieval and mutation behavior under feedback pressure, with stronger preference for new contrasts, new idea families, and different evidence lanes.
- Added ranking signals such as `lateralEscape` and `rejectedLanePenalty` so scoring now rewards moving away from rejected directions.
- Exposed the new feedback strategy in output and memory, and documented the behavior in the main docs.

## 2026-03-26 · Topic-Scoped Memory And Stronger Default Loop

Commits:
- `d10473d` Scope memory history by topic
- `7f23a61` Refine literature search loop defaults
- `fb402f6` Improve idea presentation and feedback flow
- `7c59bcc` Rename project to Research Idea Explorer

Highlights:
- Made memory continuation topic-scoped by default, so related topics can continue while unrelated topics sharing one memory file do not cross-contaminate.
- Set the default generation path to a strong single-pass literature loop, while keeping two-round mutation available for deeper continuation.
- Improved the presentation layer so output reads more like research cards and less like internal schema fields.
- Strengthened the feedback loop so accepted and rejected ideas affect later ranking and continuation behavior.
- Renamed the project to `Research Idea Explorer` and aligned the docs around the new product framing.

## 2026-03-23 · Initial Release

Commits:
- `592a127` Initial release
- `e91d77b` Polish README for agent CLI onboarding
- `25cce25` Rename project to RQ-Explore

Highlights:
- Released the first local CLI workflow for literature-grounded research ideation.
- Added agent-oriented onboarding for Codex and Claude Code usage.
- Established the core loop: retrieve papers, generate research directions, rank them, and persist memory locally.
