# Spec 0470 — Reframe kata-grasp as kata-trace

## Problem

The improvement coach's primary function is downloading agent execution traces
and analyzing them via grounded theory. On run 24418764670 (2026-04-14), the
improvement coach **bypassed kata-grasp entirely** and instead performed a
surface-level domain assessment — auditing open PRs, issues, tests, and specs —
which is product-manager behavior, not coaching behavior.

The trace shows the agent spawned general-purpose subagents for repo health
checks (seq 6, 23, 33), attempted PR classification (seq 125, 128), and fixed a
spec quality defect (seq 340+). It never invoked the Skill tool for kata-grasp,
never downloaded a trace artifact, and never performed grounded theory analysis.
The entire 10-minute session produced useful work (spec 0460 fix), but none of it
was the improvement coach's assigned function.

### Root cause: name and description use abstract jargon

The skill name `kata-grasp` and its description — "Grasp the current condition
of an agent workflow run" — use Toyota Kata vocabulary. "Grasp the current
condition" is meaningful to someone steeped in the improvement kata framework,
but to an LLM selecting among available skills, it reads as a generic directive
to understand the repo's state. The agent did exactly that: it "grasped the
current condition" by surveying PRs, tests, and specs — a literal interpretation
that misses the skill's actual function.

Compare how the skill description appears in the system-reminder skill list:

> `kata-grasp: Grasp the current condition of an agent workflow run. Select a trace, download it, observe the work as it actually happened, apply grounded theory analysis, and produce a structured findings report — step 2 of the improvement kata.`

The first sentence is abstract ("grasp the current condition"). The concrete
actions (select trace, download, observe, apply grounded theory) are buried in
the second sentence. Skill routing is dominated by the name and opening clause —
by the time the description reaches "download it," the agent has already
pattern-matched "grasp current condition" to "assess repo state."

### Evidence this is a recurring risk

The improvement coach's Assess section routes to kata-grasp with the phrase
"Grasp the current condition (`kata-grasp`)." This couples the routing
instruction to the same abstract jargon as the skill name. When the agent
reinterprets "grasp" as general assessment, the routing instruction reinforces
the misinterpretation rather than correcting it.

Prior runs successfully invoked kata-grasp — W15 analyzed runs 24120743042
(guide-setup), 24278652769 (implement-plans), and 24290929444 (summit-setup).
However, the W15 runs benefited from explicit user direction or fresh wiki
context naming specific trace IDs. The April 14 run had no such anchoring — the
agent was left to route on name and description alone, and it failed.

## Proposal

Rename `kata-grasp` to `kata-trace` and rewrite its description to lead with
concrete, unambiguous language about what the skill does: go and see the work
agents did by analyzing their execution traces.

### What changes

1. **Skill directory**: `.claude/skills/kata-grasp/` becomes
   `.claude/skills/kata-trace/`

2. **Skill frontmatter**: Name changes from `kata-grasp` to `kata-trace`.
   Description changes from "Grasp the current condition of an agent workflow
   run..." to language that leads with "Go and see the work agents did by
   analyzing their execution traces."

3. **SKILL.md title and opening**: Replace "Grasping the Current Condition" with
   a title that names the actual activity (trace analysis). The Toyota Kata
   framing can remain as context but should not be the lead.

4. **Agent profile** (`improvement-coach.md`): Update skill list reference and
   Assess routing text. Replace "Grasp the current condition (`kata-grasp`)"
   with "Go and see the work agents did by analyzing their traces
   (`kata-trace`)."

5. **Cross-references**: Update all files that reference `kata-grasp`:
   - `KATA.md` — skill table entry and accountability section
   - `kata-product-classify/SKILL.md` — invariant audit references
   - `kata-gh-cli/SKILL.md` — canonical query patterns section
   - `kata-gh-cli/references/commands.md` — invariant audit reference
   - `specs/0450-agent-centered-workflows/` — spec and plan references
   - `wiki/staff-engineer.md` — reference to kata-grasp analysis
   - Internal references within the skill's own `references/` directory

### What does NOT change

- **Grounded theory methodology**: The analysis process (open coding, axial
  coding, selective coding, memos, paradigm model) is unchanged. This spec
  renames and reframes — it does not alter the analytical method.
- **Invariant audit function**: The named per-agent invariants and their
  evidence requirements remain identical.
- **Scripts and references**: `scripts/find-runs.sh`,
  `scripts/trace-queries.sh`, `references/invariants.md`,
  `references/examples.md`, `references/report-template.md`,
  `references/run-selection.md` — content unchanged, only moved under the new
  directory name.
- **Checklist content**: Both the read-do and do-confirm checklists remain
  as-is.

## Scope

### Included

- Rename skill directory from `kata-grasp` to `kata-trace`
- Rewrite skill name, description, title, and opening paragraph
- Update improvement-coach agent profile routing text
- Update all cross-references across the repository (8 external files reference
  `kata-grasp` outside the skill's own directory)

### Excluded

- Changes to grounded theory methodology or analysis process
- Changes to invariant definitions or audit procedure
- Changes to the improvement-coach agent profile beyond skill routing
- Changes to other agent profiles or workflows
- Adding new functionality to the skill

## Success Criteria

1. `rg kata-grasp` returns zero matches across the repository — all references
   updated to `kata-trace`.
2. The skill description in the system-reminder skill list leads with "Go and
   see" language (not Toyota Kata jargon) when viewed by an agent.
3. The improvement-coach Assess section routes to trace analysis using "go and
   see the work agents did" language with an explicit `kata-trace` reference.
4. `bun run check` and `bun run test` pass — no broken references or imports.
5. All existing `kata-grasp` reference files (`references/`, `scripts/`) are
   present under `kata-trace/` with unchanged content.
