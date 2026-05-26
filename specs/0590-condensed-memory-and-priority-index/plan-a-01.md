# Plan 0590-A Part 01 — Protocol, MEMORY.md Shape, Curate Skill

**Agent:** staff-engineer **Branch:** `spec/590-part-01-protocol` from `main`
**Depends on:** none (first part) **PR type:** `docs` (agent infrastructure — no
runtime code changes)

## Goal

Establish the three contracts (tiered memory load, summary contract, weekly log
contract), reshape `wiki/MEMORY.md` to hold the cross-cutting priority index,
and update `kata-wiki-curate/SKILL.md` so its Step 5 output target matches the
new shape. All three changes land in one PR because the design requires protocol
changes and the MEMORY.md shape to arrive together.

Summary files are _not_ migrated in this part. They become non-conforming at
merge — that is expected and is the measurable gap closed by parts 02 and 03.

## Files

| Action  | Path                                           | Notes                                                           |
| ------- | ---------------------------------------------- | --------------------------------------------------------------- |
| Rewrite | `.claude/agents/references/memory-protocol.md` | Tiered load + summary contract + weekly log contract            |
| Rewrite | `wiki/MEMORY.md`                               | Adds `## Cross-Cutting Priorities` section with empty-state row |
| Modify  | `.claude/skills/kata-wiki-curate/SKILL.md`     | Step 5 output target; Step 1 extended with contract check       |

No other files.

## Step 1 — Rewrite `memory-protocol.md`

Replace the entire file with the structure below. The current file is 39 lines;
the new one will be ~90 lines because it absorbs the summary contract and the
weekly log contract (which previously had no canonical home).

Current structure: a single `## Memory` H2 with three H3 subsections
(`### Before starting work`, `### During each run`, `### After each run`). The
new structure promotes the content of the latter two H3s to top-level H2s
(content preserved verbatim; only heading depth changes) and replaces the first
H3 with the new `## Memory Tiers` section.

Section order:

1. `# Shared Agent Protocol` (H1, unchanged)
2. `## Memory Tiers` — new; replaces today's `### Before starting work` H3.
   - **Tier 1 (always):** three files — `wiki/{agent}.md`, `wiki/MEMORY.md`,
     `wiki/storyboard-YYYY-MNN.md` (if exists).
   - **Tier 2 (opt-in):** teammate summaries, weekly logs. State conditions:
     teammate summary read only when coordinating with that agent or
     investigating a priority-index item that names them; weekly log read only
     when the skill is `kata-wiki-curate`, `kata-trace`, `kata-storyboard`, or
     when explicitly investigating a historical decision.
   - Include the mermaid diagram verbatim from `design-a.md` (the block
     currently between lines 37–46 of design-a.md at the time of writing; copy
     the fenced block by content, not by line number).
3. `## During Each Run` — content promoted from today's `### During each run` H3
   (keep the `### Decision` table and the weekly log path rule verbatim; only
   the heading level changes H3 → H2).
4. `## After Each Run` — content promoted from today's `### After each run` H3
   (three-item list: actions, observations, blockers; only the heading level
   changes H3 → H2).
5. `## Summary Contract` — new section.
   - **Permitted sections (in order):** H1 `# {Agent Title} — Summary`,
     `**Last run**:` line, agent-specific state section(s) using H2,
     `## Open Blockers`, `## Observations for Teammates`.
   - **Excluded content:** historical audit data, storyboard commitments, policy
     clarifications, metrics tables. Each exclusion names the correct home
     (weekly log, storyboard file, `CONTRIBUTING.md`/skill docs, CSV under
     `wiki/metrics/`).
   - **Line budget:** 80 lines, checked mechanically by `wc -l`.
   - **Rationale note** (one paragraph, no alternatives rehash): summaries are
     state, not history. The line budget forces the discipline.
6. `## Weekly Log Contract` — new section.
   - Append-only audit records; no edits to past entries except format fixes.
   - Tier 2 — not in the default startup load.
   - Named readers: `kata-wiki-curate` (always), `kata-storyboard` (for
     experiment verification), and agents explicitly investigating past
     decisions.
   - Format unchanged: `## YYYY-MM-DD` / `### {Subsection}` structure.
   - No line budget.
7. `## Cross-Cutting Priority Index` — new section.
   - States that `wiki/MEMORY.md` is the canonical location for cross-cutting
     items that affect multiple agents.
   - States the schema (fields: Item / Agents / Owner / Status / Added), maximum
     10 active entries, and the explicit empty-state row.
   - Names `kata-wiki-curate` as the authoritative writer. Any agent may propose
     an entry mid-run; the curator is the one verifier.

The `### Decision` table preserves today's wording verbatim — any rewording is
out of scope for this spec.

### Acceptance

- `wc -l .claude/agents/references/memory-protocol.md` returns a number ≤ 100
  (target ~90; the 10-line headroom covers formatter rewraps, not new content).
- File has H2 headings exactly: `## Memory Tiers`, `## During Each Run`,
  `## After Each Run`, `## Summary Contract`, `## Weekly Log Contract`,
  `## Cross-Cutting Priority Index`.
- `bunx fit-map validate` passes (file is not read by fit-map but the monorepo
  as a whole must still validate — smoke test only).

## Step 2 — Rewrite `wiki/MEMORY.md`

Current file is 20 lines of static navigation. New file adds a priority section
above the navigation. Keep the existing agent-summary links (they are still
useful for Tier 2 opt-in lookup) but demote them beneath the priorities.

Structure (in order):

1. `# Memory Index` (H1, unchanged).
2. `## Cross-Cutting Priorities` — new section. Introduces the table with a
   one-sentence description. Then a markdown table with columns **Item**,
   **Agents**, **Owner**, **Status**, **Added**. Empty-state row: a single row
   reading `| *None* | — | — | — | — |` so agents can tell "no items" apart from
   "not tracked yet." Cap: 10 active rows.
3. `## Storyboard` — unchanged link to the current month's storyboard file.
4. `## Agent Summaries` — unchanged list (note: Tier 2, opt-in).
5. `## Cross-Agent` — unchanged link to `downstream-skill.md`.

The priority table is seeded with the empty-state row only. Part 03
(technical-writer) populates the real cross-cutting items during migration.

### Acceptance

- File has the `## Cross-Cutting Priorities` section directly below the H1.
- Table header is `| Item | Agents | Owner | Status | Added |` with left-aligned
  separator (`| --- | --- | --- | --- | --- |`).
- Empty-state row present.
- `wc -l wiki/MEMORY.md` returns ≤ 40.

## Step 3 — Modify `kata-wiki-curate/SKILL.md`

Three localized edits. Do not rewrite the whole file.

**Edit 3a — Step 0 wording (lines 38–46).** The line "Read memory per the agent
profile (your summary, the current week's log, and teammates' summaries)" is
currently misaligned with the new tiered protocol (teammate summaries are Tier 2
for every skill except this one). Replace the parenthetical with: "(your
summary, the current week's log, and — because this skill is a named Tier 2
reader — all teammate summaries, all current-week logs, `wiki/MEMORY.md`, and
`wiki/Home.md`)." This states the curator's authority explicitly.

**Edit 3b — Step 1 adds contract enforcement.** After the existing four bullets
under "Summary accuracy", add a fifth bullet (phrased so the forward reference
is explicit and self-disabling if part 02 is reverted):

> - **Contract conformance** — When `just wiki-audit` is available (added by
>   spec 0590 part 02), run it and fix any summary failures directly in the
>   summary file. The curator is the only agent that rewrites summaries; other
>   agents propose edits via observations.

The forward reference is intentional: part 01 lands first, part 02 creates the
command. Between the two merges, the bullet reads as a conditional instruction
("when available"), not as a broken promise. The first curator invocation under
the new protocol is part 03, by which time part 02 has landed.

**Edit 3c — Step 5 output target (lines 105–116).** Rewrite Step 5 to state:

- The scan logic is unchanged (systemic blockers, breaking changes, policy
  changes).
- The **required destination** is `wiki/MEMORY.md`'s
  `## Cross-Cutting Priorities` table. Add an entry with the schema (Item /
  Agents / Owner / Status / Added).
- Mirroring into an affected agent's `Observations for Teammates` is
  **conditional** — only when the agent needs context beyond what the index
  entry conveys. State this explicitly.
- Resolved items: remove within one curation cycle.

### Acceptance

- Step 0 contains the new parenthetical stating "Tier 2 reader."
- Step 1 contains the new "Contract conformance" bullet referencing
  `just wiki-audit`.
- Step 5 heading unchanged; body contains the phrases "required destination",
  "`wiki/MEMORY.md`", and "conditional" in that order.
- No other edits to the file.

## Step 4 — Smoke checks

Run from the repo root:

```bash
bunx fit-map validate
bun run format
bun run lint
```

Commit only if all three pass.

## Blast Radius

- 3 files modified.
- No runtime code, no tests, no CI workflow, no public API.
- Documentation linters (`bun run format` / Prettier) apply.

## Commit + PR

- One commit, conventional commit message:
  `docs(protocol): condense agent memory and add cross-cutting priority index`
- PR body links to `specs/0590-condensed-memory-and-priority-index/spec.md`,
  `design-a.md`, and `plan-a-01.md`.
- Sign PR body with `— Staff Engineer 🛠️`.

## Risks specific to this part

- **Misalignment between protocol text and kata-wiki-curate Step 0.** Mitigated
  by editing both files in the same PR and by the review panel.
- **Agents miss the new Tier 1/2 split at runtime.** The protocol is declarative
  and agents read it at session start; no runtime change is required. The
  structural pressure to read teammate summaries drops in part 03 when the
  priority index is populated — not in this part.
