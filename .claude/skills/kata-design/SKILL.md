---
name: kata-design
description: >
  Create design documents (WHICH/WHERE) for approved specs. A design is a
  max-200-line architectural sketch of components, interfaces, data flow, and
  key decisions with trade-offs. It gives reviewers a high-leverage point to
  redirect architecture before anyone writes the full plan. A design is
  approved when `wiki/STATUS.md` shows the spec row at `design approved`. A
  human signal writes that row, and `kata-dispatch` or the active agent
  propagates it.
---

# Write and Review Designs

A design defines WHICH components exist, WHERE they interact, and what
interfaces connect them. Design sits in the
[spec](../kata-spec/SKILL.md) → design → [plan](../kata-plan/SKILL.md) →
[implement](../kata-implement/SKILL.md) pipeline. The spec captures WHAT/WHY.
The design captures WHICH/WHERE. The plan captures HOW/WHEN. The implementation
executes the plan.

**A design requires an existing approved spec.** Without an approved spec there
is no commitment to implement. A design then has nothing to shape.

## When to Use

- You turn a merged spec (`specs/NNN/spec.md` on `origin/main`) into an
  architectural design
- You review a design before approval ("review design NNN", "is design NNN
  ready?")
- You revisit a design whose direction needs a rethink before the plan
- You co-run with `kata-spec` when one prompt asks for both. See
  [lockstep co-execution](references/lockstep-co-execution.md)

## Checklists

<read_do_checklist goal="Internalize design-writing boundaries before starting">

- [ ] Confirm `specs/NNN/spec.md` exists on `origin/main`
      (`git fetch origin main`) before you design.
      [Lockstep co-execution](references/lockstep-co-execution.md) is the one
      exception, and it drafts against the same-branch spec.
- [ ] Do not write or revise the spec. Return it to `draft` if it needs
      changes.
- [ ] Do not write the plan. This skill writes the design. `kata-plan`
      translates it into implementation steps.
- [ ] Write one design per spec. Do not bundle multiple specs into one design.
- [ ] Read the spec end-to-end before you write. Restate problem, scope, and
      success criteria from memory.

</read_do_checklist>

<do_confirm_checklist goal="Verify design quality before recommending approval">

- [ ] Keep the design under 200 lines.
- [ ] Confirm the design meets the criteria in § Writing a Design.
- [ ] Run the repository formatter and commit the changes.
- [ ] Complete a clean sub-agent review panel of `design-a.md` through
      [`kata-review`](../kata-review/SKILL.md) (fresh context, panel size per
      caller protocol). Address every blocker/high/medium finding.

</do_confirm_checklist>

## Naming Convention

Designs live alongside their spec in `specs/{NNN}-{name}/`.

### Default design

The first (and usually only) design is always **`design-a.md`**. Do not use
`design.md` or other shorthands. The letter suffix keeps the names consistent
whether one design or several exist.

### Alternative designs

When you explore more than one architectural approach for the same spec, create
additional variants with sequential letters:

    design-a.md    ← default (always created first)
    design-b.md    ← alternative approach
    design-c.md    ← another alternative

Open each variant with a brief rationale that explains how it differs from
design-a. When a human approves the design, **design-a is the design to plan**
unless the approver explicitly selects a different variant.

No decomposition. If a design cannot fit in 200 lines, narrow the spec instead.

## Writing a Design (WHICH + WHERE)

The design answers which components exist, where they interact, and what
interfaces connect them. It also answers why this architecture beats the
alternatives.

- **Architecture, no execution.** Name components, interfaces, data flow. Do
  not specify file-level changes or execution order. Those belong in the plan.
- **Decisions with trade-offs.** Each architectural choice names at least one
  rejected alternative and why.
- **One home per decision.** If a decision has a `## Key Decisions` table row,
  do not also write a `Rejected:` paragraph under its section. Use the table or
  the prose. Do not use both.
- **Visual when possible.** Mermaid diagrams for component relationships, data
  flow, state machines, sequence diagrams.
- **Scope-faithful.** Stay within the spec's scope. If scope should change,
  return the spec to draft. Do not expand it silently.
- **Clean break.** The design replaces the old path with no shims, aliases, or
  fallbacks. It names the components and interfaces it removes. A replacement
  that deletes nothing is incomplete. Compat appears only when the spec names
  it as a requirement. If a clean break cannot meet the spec, return the spec
  to `draft`. Do not design around it.

**Form follows content.** Prefer tables for lists with shared structure
(components, decisions). Prefer bullets for flat facts. Use prose only for the
narrative thread between them. If a paragraph could be a row, make it a row. Do
not restate what the artifact already shows.

## Approval

A design is approved when `wiki/STATUS.md` shows its row at `design
approved`. **Human-only**: agents never originate `design approved`. They only
propagate a signal a trusted human already expressed (label, APPROVED review,
approval comment, or in-session message). `kata-dispatch` or the active agent
writes that signal to STATUS. See
[`approval-signals.md`](../../agents/x-approval-signals.md).

## Reviewing a Design

Evaluate `design-a.md` against the qualities listed in "Writing a Design"
above, then run the DO-CONFIRM checklist. Report findings in a PR comment.

**Do not recommend approval, and do not apply the `design:approved` label.**
Only a human decides on approval. Your job is to evaluate quality and surface
findings. The release engineer reads `wiki/STATUS.md` to gate merge. If
criteria fall short, request changes in a PR comment.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`, then run `gemba-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
The digest's `owned_priorities`, `claims`, and `storyboard_items` seed this
Process.
Extract specs previously designed and any deferred work from prior entries.

### Step 1: Find the spec

Run `git fetch origin main`, then confirm `specs/NNN/spec.md` exists on
`origin/main`. Wait for the spec PR to merge before you start a design. Under
[lockstep co-execution](references/lockstep-co-execution.md) you draft the spec
in this session instead. Skip the wait.

### Step 2: Study the spec

Read `spec.md` end to end.

### Step 3: Research the codebase

Read the code areas the spec targets.

### Step 4: Write the design

Create `design-a.md` locally. Do not push yet. Stay under 200 lines. Each
architectural choice names a rejected alternative.

### Step 5: Clean sub-agent review panel

Follow the [`kata-review` caller
protocol](../kata-review/references/caller-protocol.md). Invoke it on the local
`design-a.md` before push. Tell each reviewer not to invoke `kata-design`.
Address every confirmed blocker/high/medium finding before you open the PR. The
PR must not become visible to `kata-dispatch` until the panel is clean.

### Step 6: Open a design PR

Before you push, verify the identifiers the design names still exist on
`origin/main`. Update any identifier renamed since the spec merged.

The PR title carries the spec id: `design(NNN): …`. Do not apply the
`design:approved` label and do not recommend approval. Those are human-only
actions. See § Approval. Under
[lockstep co-execution](references/lockstep-co-execution.md) this single
`design(NNN)` PR also carries `spec.md`. Do not open a separate spec PR.

Hold every published body to
[citation integrity](../../agents/x-citation-integrity.md).

## Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **Specs designed** — Spec number, name, and status transition
- **Design decisions** — Key architectural choices and why (planner context)
- **Deferred specs** — Specs skipped and why (not approved, missing info, etc.)
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/` per
  `references/metrics.md`. See KATA.md § Metrics for eligibility.
