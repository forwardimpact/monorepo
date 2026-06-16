# Spec 2050 — Design-inputs enforcement across all specs

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
| --- | --- | --- |
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The team's delivery loop is spec → design → plan → implement. Scope a spec defers to design has no named home and no gate, so it drifts silently across the draft → design transition and surfaces, if at all, as rework after implementation rather than as a caught finding (see § Problem). |

## Problem

When a spec defers part of its scope to the design phase, the only thing
keeping that scope alive today is the wording of the individual spec. There is
no shared, named place for an author to record deferred scope, and no gate at
design or review that checks the deferred items were actually resolved.

The failure mode is **silent = incomplete**: a design that is silent on a
deferred input looks identical to a design that consciously resolved it. Both
pass review on appearance. The deferred decision is dropped without anyone
deciding to drop it.

This was met once with a per-spec carve-out, recorded in commit `e1f25bd6`
(`spec(1440): record PR-Status-table timestamp carve-out as must-address design
input`). At the Exp #1389 F1 reading the improvement coach flagged that a spec's
deferred fix was subsumed by the spec but not mandated by its committed scope,
and was therefore at risk of silent loss at the draft → design transition. The
fix added a `## Design inputs (must be addressed at design)` section to that one
spec, forcing design to choose between two paths and state which. The commit is
the demonstration; this spec does not depend on that spec reaching `main`.

That carve-out works for one spec only. It is a workaround applied one spec at a
time. Every future spec with deferred scope has to reinvent it, and any spec
whose author does not happen to know the pattern reopens the gap. The pattern
needs to become durable structural enforcement that holds for all specs, under a
single generalized section name: `## Design inputs`.

## What

Three process-only changes to published `kata-*` skill text turn the per-spec
carve-out into a structural convention: one place to declare deferred scope,
and two gates that fail a design which leaves a declared item unresolved.

1. **`kata-spec` documents the optional `## Design inputs` section.** The spec
   skill names `## Design inputs` as the optional, named section where a spec
   lists scope it defers to design. This makes the section discoverable: without
   it, no skill teaches authors to write the section the gates check for, and
   the gates would have nothing to bind to.

2. **`kata-design` DO-CONFIRM gains a conditional gate.** When a spec carries a
   `## Design inputs` section, the designer must verify that every listed input
   is explicitly resolved in the design — a design silent on a listed input is
   incomplete.

3. **`kata-review` gains a `design-a.md` delta.** When the spec carries a
   `## Design inputs` section, each listed input must be explicitly resolved;
   an unaddressed input is at minimum a **High** finding. This is the
   independent-reviewer counterpart to the author-side DO-CONFIRM gate, so the
   convention holds even if the designer's self-check misses.

Together these three give the loop a declare-once / check-twice shape: the spec
declares deferred scope in a named section, the design author confirms each item
is resolved, and an independent review confirms the same.

### Constraints

| Constraint | Requirement |
| --- | --- |
| Genericity | `kata-*` skills are published and sync unchanged into installations that have never seen this monorepo. The skill text states the principle only. No reference to spec 1440, Obstacle #1358, Exp #1389, or any experiment appears in the skill edits. Provenance lives in this spec body, not in the skill text. |
| No-op safety | Both gates are conditional on the section's presence. A spec that defers no scope carries no `## Design inputs` section, so neither gate has anything to check and the spec is unaffected. The change adds a gate for specs that opt in; it imposes nothing on specs that do not. |
| Process-only | All three edits are skill-text changes. No CLI, library, service, or data behaviour changes. |

## Out of scope

| Excluded | Why |
| --- | --- |
| Re-specifying or modifying the carve-out commit's spec | That commit is the prior art being generalised, not a target. This spec touches only the three skills; whether the carve-out's spec ever reaches `main` is independent of this structural change. |
| Mandating a `## Design inputs` section on every spec | The section is opt-in. Forcing it onto specs with no deferred scope would manufacture empty sections and dilute the signal. The gates fire only when an author chose to declare deferred inputs. |
| A machine-checked / CI-enforced gate | The two gates are human- and reviewer-facing checklist items, consistent with how the other DO-CONFIRM and `kata-review` deltas work. A mechanical linter for the section is a possible later spec, not this one. |
| Plan-phase or implement-phase enforcement | The deferred-scope risk is at the draft → design transition. Once design resolves a declared input, downstream phases inherit the resolved decision. Extending the gate further is unwarranted. |
| Exact wording, section placement, and insertion points in each skill | The principle each edit must express is fixed (§ What); the precise wording and where it lands in each `SKILL.md` are design / plan decisions. |

## Success criteria

| # | Claim | Verify |
| --- | --- | --- |
| 1 | `kata-spec`'s spec-authoring guidance names the literal section `## Design inputs` as the optional place to declare scope deferred to design | `.claude/skills/kata-spec/SKILL.md` contains the literal heading text `## Design inputs` and a sentence stating it is where a spec lists scope it defers to design |
| 2 | `kata-design` DO-CONFIRM requires every input listed in a spec's `## Design inputs` section to be explicitly resolved in the design, and states that silence on a listed input is incomplete | the DO-CONFIRM checklist in `.claude/skills/kata-design/SKILL.md` carries an item expressing both the resolution requirement and the silence-is-incomplete treatment, predicated on the section being present |
| 3 | `kata-review` makes an unaddressed input from a spec's `## Design inputs` section at minimum a **High** finding when reviewing a design | the `design-a.md` section in `.claude/skills/kata-review/SKILL.md` carries a delta stating the at-minimum-High severity, predicated on the section being present |
| 4 | The added skill lines name no spec, issue, or experiment | none of `1440`, `1358`, `1389`, `2050`, or any `#`-prefixed id appears in the lines added to the three skills |
| 5 | The gates are no-ops for a spec with no `## Design inputs` section | applying both gates to an existing spec that carries no such section yields no new checklist failure or review finding from these gates |
| 6 | The change is process-only | the changed-file set is exactly the three named `SKILL.md` files — no CLI, library, service, or data file is touched |

## Provenance

- Per-spec carve-out committed on spec 1440 — `e1f25bd6`
  (`spec(1440): record PR-Status-table timestamp carve-out as must-address
  design input`).
- Flagged by the improvement coach at the Exp #1389 F1 reading as at risk of
  silent loss at the draft → design transition.
- Carried against Obstacle #1358.
