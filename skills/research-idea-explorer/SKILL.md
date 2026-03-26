---
name: research-idea-explorer
description: Use when the user wants cross-disciplinary research ideas generated as concise research cards with Title, Abstract, Design, Distinctiveness, and Significance rather than one-shot prompting.
---

# Research Idea Explorer Skill

Use this skill when the task is to generate, refine, or compare research ideas across disciplines.

## Default policy

Default to `literature-first` for every non-pure-functional invocation.

That means:

- If the user asks to generate, refine, compare, extend, red-team, or continue research ideas, search literature first.
- Treat literature retrieval as the default prelude, not an optional extra, unless the user explicitly says not to use it.
- Keep `hybrid` retrieval as the default strategy unless the user explicitly prefers `lexical`, `embedding`, or `graph`.
- Only skip retrieval for pure utility actions such as:
  - formatting an existing result
  - inspecting `graph`, `summary`, or `neighbors`
  - writing `feedback`
  - explaining the output schema or command usage

The workflow is:

1. Start with a brainstorm pass from multiple persona viewpoints:
   `Anomaly Hunter`, `Assumption Breaker`, `Measurement Skeptic`, `Failure Miner`, `Boundary Mapper`, and `Analogy Transfer`.
2. Convert only the strongest brainstorm seeds into the shared internal schema:
   `Object`, `Puzzle`, `Claim`, `Contrast`, `Evidence`, `Scope`, `Stakes`.
3. Reject ideas that are obvious near-duplicates or amount to a thin "method + topic" pairing.
4. Push each retained idea one step further by adding:
   data source, minimal runnable design, likely failure mode, and why the question matters now.
5. When available, use the persistent memory graph so the session does not keep revisiting the same research neighborhoods.

## Guardrails

- Do not output only titles. Output brainstorm seeds first when useful, then concise research cards.
- Do not overuse `Blind spot` if a stronger puzzle such as `Conflict`, `Distortion`, or `Mechanism unknown` is available.
- Treat `Scale` and `Counterfactual` as part of contrast and scope unless the user explicitly wants them foregrounded.
- Search literature by default before proposing ideas, and use metadata to identify crowded areas before proposing ideas.
- Prefer diversity of research moves over superficial variation in wording.

## Diagram provenance

If you produce a diagram, distinguish clearly between:

- a computed graph generated from stored nodes and edges
- a literature-derived map synthesized from retrieved papers
- a conceptual sketch synthesized by the agent

Do not present a hand-authored conceptual diagram as an automatically generated network graph.

## Output shape

Each default research card should contain:

- `Title`
- `Abstract`
- `Design`
- `Distinctiveness`
- `Significance`

The richer internal schema can still be used when deeper analysis is needed, but the default user-facing card should stay concise.

## References

Read [references/schema.md](references/schema.md) when you need the field meanings, persona set, or puzzle definitions.
Read [references/retrieval.md](references/retrieval.md) when literature retrieval is available and you need to decide between lexical, embedding, or graph expansion.
