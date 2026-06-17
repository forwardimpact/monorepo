---
name: kata-design
description: >
  Create design documents (WHICH/WHERE) for approved specs. A design is a
  max-200-line architectural sketch — components, interfaces, data flow, and
  key decisions with trade-offs — that gives reviewers a high-leverage point
  to redirect architecture before the full plan is written. Design is approved
  when `wiki/STATUS.md` shows the spec row at `design approved` — written
  there by a human signal that `kata-dispatch` or the active agent propagates.
---

# Write and Review Designs

A design defines WHICH components exist, WHERE they interact, and what
interfaces connect them. Design sits in the
[spec](../kata-spec/SKILL.md) → design → [plan](../kata-plan/SKILL.md) →
[implement](../kata-implement/SKILL.md) pipeline: the spec captures WHAT/WHY,
the design captures WHICH/WHERE, the plan captures HOW/WHEN, and implementation
executes the plan.

**A design requires an existing approved spec.** Without an approved spec there
is no commitment to implement, and a design has nothing to shape.

## When to Use

- Turning a merged spec (`specs/NNN/spec.md` on `origin/main`) into an
  architectural design
- Reviewing a design before approval ("review design NNN", "is design NNN
  ready?")
- Revisiting a design whose direction needs rethinking before planning

## Checklists

<read_do_checklist goal="Internalize design-writing boundaries before starting">

- [ ] Confirm `specs/NNN/spec.md` exists on `origin/main` after
      `git fetch origin main` — wait for the spec PR to merge before
      starting a design.
- [ ] Do not write or revise the spec — return it to `draft` if it needs
      changes.
- [ ] Do not write the plan — this skill writes the design; `kata-plan`
      translates it into implementation steps.
- [ ] One design per spec — do not bundle multiple specs into one design.
- [ ] Read the spec end-to-end before writing. Restate problem, scope, and
      success criteria without referring back.

</read_do_checklist>

<do_confirm_checklist goal="Verify design quality before recommending approval">

- [ ] Under 200 lines.
- [ ] Design meets the criteria in § Writing a Design.
- [ ] Repository formatter run and changes committed.
- [ ] Clean sub-agent review panel of `design-a.md` via
      [`kata-review`](../kata-review/SKILL.md) completed (fresh context, panel
      size per caller protocol) and every blocker/high/medium finding addressed.

</do_confirm_checklist>

## Naming Convention

Designs live alongside their spec in `specs/{NNN}-{name}/`.

### Default design

The first (and usually only) design is always **`design-a.md`**. Do not use
`design.md` or other shorthands — the letter suffix keeps naming consistent
whether one design or several exist.

### Alternative designs

When exploring competing architectural approaches for the same spec, create
additional variants using sequential letters:

```
design-a.md    ← default (always created first)
design-b.md    ← alternative approach
design-c.md    ← another alternative
```

Each variant should open with a brief rationale explaining how it differs from
design-a. When the design is approved, **design-a is the design that will be
planned** unless the approver explicitly selects a different variant.

No decomposition — if a design cannot fit in 200 lines, narrow the spec instead.

## Writing a Design (WHICH + WHERE)

The design answers: which components exist, where they interact, and what
interfaces connect them — and why this architecture over alternatives.

- **Architecture, not execution.** Name components, interfaces, data flow. Do
  not specify file-level changes or execution ordering — those belong in the
  plan.
- **Decisions with trade-offs.** Each architectural choice names at least one
  rejected alternative and why.
- **One home per decision.** If a decision has a `## Key Decisions` table row,
  do not also write a `Rejected:` paragraph under its section. Table or prose,
  not both.
- **Visual when possible.** Mermaid diagrams for component relationships, data
  flow, state machines, sequence diagrams.
- **Scope-faithful.** Stay within the spec's scope. If scope should change,
  return the spec to draft rather than expanding silently.
- **Clean break.** Follow [§ Clean breaks](../../../CONTRIBUTING.md#read-do): the
  design replaces the old path, never wraps it in shims or fallbacks. Compat
  belongs in the design only when the spec names it as a requirement; if a clean
  break can't meet the spec, return the spec to `draft` rather than designing around it.

**Form follows content.** Prefer tables for lists with shared structure
(components, decisions). Prefer bullets for flat facts. Use prose only for the
narrative thread between them. If a paragraph could be a row, make it a row. Do
not restate what the artifact already shows.

## Approval

A design is approved when `wiki/STATUS.md` shows its row at `design
approved`. **Human-only**: agents never originate `design approved` — they
only propagate signals already expressed by a trusted human (label, APPROVED
review, approval comment, or in-session message), which `kata-dispatch` or
the active agent writes to STATUS. See
[`approval-signals.md`](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/approval-signals.md).

## Reviewing a Design

Evaluate `design-a.md` against the qualities listed in "Writing a Design"
above, then run the DO-CONFIRM checklist. Report findings via PR comment.

**Do not recommend approval, and do not apply the `design:approved` label.**
Deciding on approval is a human-only action. Your job is to evaluate quality
and surface findings; the release engineer reads `wiki/STATUS.md` to gate
merge. If criteria fall short, request changes via PR comment.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md` then run `Bash: fit-wiki boot --agent <self>` (per [Memory Protocol § On-Boot Read Set](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/memory-protocol.md#on-boot-read-set)). The boot digest's `owned_priorities`, `claims`, and (when this skill reads Tier-2 surfaces) `storyboard_items` seed the rest of this skill's Process. Extract specs previously designed and any deferred work
from prior entries.

### Step 1: Find the spec

Run `git fetch origin main`, then confirm `specs/NNN/spec.md` exists on
`origin/main` — wait for the spec PR to merge before starting a design.

### Step 2: Study the spec

Read `spec.md` end to end.

### Step 3: Research the codebase

Read the code areas the spec targets.

### Step 4: Write the design

Create `design-a.md` locally; do not push yet. Stay under 200 lines. Each
architectural choice names a rejected alternative.

### Step 5: Clean sub-agent review panel

Follow the [`kata-review` caller
protocol](../kata-review/references/caller-protocol.md), invoked on the local
`design-a.md` before push. Tell each reviewer not to invoke `kata-design`.
Address every confirmed blocker/high/medium finding before opening the PR —
the PR should not become visible to `kata-dispatch` until the panel is clean.

### Step 6: Open a design PR

Before pushing, verify identifiers the design names still exist on
`origin/main` — update any renamed since the spec merged.

The PR title carries the spec id: `design(NNN): …`. Do not apply the
`design:approved` label and do not recommend approval — those are human-only
actions; see § Approval.

## Memory: what to record

Append to the current week's log (see agent profile for the file path):

- **Specs designed** — Spec number, name, and status transition
- **Design decisions** — Key architectural choices and why (planner context)
- **Deferred specs** — Specs skipped and why (not approved, missing info, etc.)
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/` per
  `references/metrics.md`. See KATA.md § Metrics for eligibility.
