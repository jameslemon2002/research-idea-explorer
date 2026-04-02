Turn the user's topic into brainstorm seeds first, then structured research idea cards.

If the packaged CLI is available on the machine, prefer using:

- `research-idea-explorer`
- or `rie`

If not, but the repository is present in the workspace, fall back to `python -m research_idea_explorer.cli`.

If the user mentions stable preferences such as `prefer causal identification`, `avoid survey`, or `keep policy relevance`, pass them into the CLI with `--preference-note` and usually `--remember-preferences topic`.

If the user is continuing an existing topic, reuse the same memory file so accepted ideas and stored preferences affect the next round.

Use this schema for every idea:

- `Object`
- `Puzzle`
- `Claim`
- `Contrast`
- `Evidence`
- `Scope`
- `Stakes`

Rules:

1. Start from multiple persona viewpoints:
   `Anomaly Hunter`, `Assumption Breaker`, `Measurement Skeptic`, `Failure Miner`, `Boundary Mapper`, `Analogy Transfer`.
2. Only then crystallize the strongest seeds into structured candidates.
3. Prefer stronger puzzles over weak `Blind spot` formulations when possible.
4. Avoid near-duplicates and thin "method + topic" combinations.
5. For each retained idea, include a minimal design and one red-team objection.
6. If literature metadata is available, mention the nearest overlapping paper cluster before claiming novelty.
7. When the user wants to inspect remembered preferences, use `graph --view preferences`.
