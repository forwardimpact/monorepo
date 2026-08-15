---
name: kata-plan
description: >
  Write implementation plans (HOW/WHEN) for approved designs. Translate an
  approved design into concrete steps, file changes, sequence, and risks
  for a trusted agent to execute. A plan is approved when `wiki/STATUS.md`
  shows the spec row at `plan approved`. `staff-engineer` writes this row
  after a clean panel review (agents may approve plans).
---

# Write and Review Plans

A plan defines HOW to implement and WHEN to sequence changes. Plan sits in the
[spec](../kata-spec/SKILL.md) → [design](../kata-design/SKILL.md) → plan →
[implement](../kata-implement/SKILL.md) pipeline. The spec captures WHAT/WHY.
The design captures WHICH/WHERE. The plan captures HOW/WHEN. Implementation
executes the plan.

**A plan requires an existing approved design.** Without an approved design
there is no architectural direction to translate into implementation steps.

## When to Use

- Turn a merged design (`specs/NNN/design-a.md` on `origin/main`) into an
  execution-ready plan
- Review a plan before approval ("review plan NNN", "is plan NNN ready?")
- Create an alternative plan variant for the same spec

## Checklists

<read_do_checklist goal="Internalize plan-writing boundaries before starting">

- [ ] Confirm `specs/NNN/design-a.md` exists on `origin/main` after
      `git fetch origin main`. Wait for the design PR to merge before you
      start a plan.
- [ ] Do not write or revise the spec. Return it to `draft` if it needs
      changes.
- [ ] Do not implement. This skill writes the plan. `kata-implement` executes
      it.
- [ ] Write one plan per spec. Do not bundle multiple specs into one plan.
- [ ] Read the spec and design end-to-end before you write. Restate the
      problem, scope, success criteria, and architectural direction from
      memory.

</read_do_checklist>

<do_confirm_checklist goal="Verify plan quality before recommending approval">

- [ ] Plan meets the criteria in § Writing a Plan.
- [ ] Complete a clean sub-agent review panel of `plan-a.md` and parts
      through [`kata-review`](../kata-review/SKILL.md) (fresh context, panel
      size per caller protocol). Address every confirmed finding at or above
      the configured severity floor
      ([caller protocol](../kata-review/references/caller-protocol.md)).

</do_confirm_checklist>

## Naming Convention

Plans live alongside their spec in `specs/{NNN}-{name}/`. The first plan is
always **`plan-a.md`**. Alternative variants use sequential letters
(`plan-b.md`, `plan-c.md`). Each opens with a rationale. **Implement
plan-a** unless the approver selects a different variant.

### Large plan decomposition

When too large for a single unit, decompose into numbered parts:

    plan-a.md       ← overview, strategy, and part index
    plan-a-01.md    ← part 1 (independently executable)
    plan-a-02.md    ← part 2 (independently executable)

- `plan-a.md` holds approach, cross-cutting concerns, and a numbered index.
- Each `plan-a-NN.md` is independently executable. State inter-part
  dependencies.
- Decompose only when there is concrete benefit (size, independence,
  parallelism).
- Include an **Execution** section: parallel vs sequential, and agent routes.

You can also decompose alternative plans (`plan-b-01.md`, etc.).

## Writing a Plan (HOW + WHEN)

The plan translates an approved design into concrete implementation steps.

- **No re-introduction.** Let a trusted agent execute without a re-read of
  the spec or design. Reference them by link. Do not restate them. The
  "Approach" section is one paragraph. Further rationale belongs in the
  design.
- **Per-step shape.** Each step is a heading plus: one sentence of intent;
  a file list (created / modified / deleted); the concrete change (code
  block, table, or bullet list); one line of verification. Write no
  per-step rationale paragraphs. Decisions live in the Approach paragraph
  or the design.
- **Libraries used.** One line: `Libraries used: libfoo (a, b), libbar (c).` or
  `Libraries used: none.` Add no section heading and no paragraph.
- **Risks.** List risks the implementer cannot see in the plan. If the
  mitigation is "do the plan correctly", it is not a risk.
- **Execution recommendation.** Route parts to the most suitable agent. Use
  engineering agents for code and `technical-writer` for docs. For decomposed
  plans, state which parts can run in parallel vs sequentially.
- **Clean break.** The plan replaces the old path with no shims, aliases, or
  fallbacks. Every removal the design names lands in a step's deleted list.
  It does not land in follow-up work. Compat appears only when the design
  names it as a requirement. If a clean break cannot meet the design, revise
  the design. Do not plan around it.

**Form follows content.** Prefer tables for shared-structure lists, bullets
for flat facts, and prose only for narrative that connects them. If a
paragraph could be a row, make it a row.

## Approval

A plan is approved when `wiki/STATUS.md` shows the spec row at `plan approved`.
`staff-engineer` may approve a plan after a clean `kata-plan` panel review.
Alternatively, the same human-driven signals that gate spec/design (label, PR
comment, APPROVED review, in-session user message) also feed STATUS for plans.
See [`approval-signals.md`](../../agents/x-approval-signals.md) and
[`coordination-protocol.md` § Approval signal](../../agents/x-coordination-protocol.md#approval-signal).

**Post-panel coverage.** If commits land between the panel and the STATUS
write, record a scoped panel re-read on the PR. You can also record a
dual-SHA PR comment that names the panel-clean and amendment SHAs. The row
must not silently claim head coverage.

## Reviewing a Plan

Evaluate the plan against the DO-CONFIRM checklist. If the plan meets all
criteria, edit `wiki/STATUS.md` to set the spec's row to
`{NNN}\tplan\tapproved` and commit the wiki edit. The Stop hook pushes it.
`kata-release-merge` then merges the plan PR.

If any criterion falls short, request changes with a PR comment. Do not write
STATUS until the plan meets the criteria.

When multiple variants exist, note which you recommend (plan-a is the default).

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`, then run `gemba-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
The digest's `owned_priorities`, `claims`, and `storyboard_items` seed this
Process. Extract the specs you planned before and any deferred work from
prior entries.

### Step 1: Find the design

Run `git fetch origin main`. Then confirm `specs/NNN/design-a.md` exists on
`origin/main`. Wait for the design PR to merge before you start a plan.

### Step 2: Study the spec and design

Read both end to end.

### Step 3: Research the codebase

Read the files the plan will target. Before you draft, enumerate every
library or service primitive the design cites, plus the test files that will
host new assertions. Source-read each declaration before the first draft.

### Step 4: Write the plan

Create `plan-a.md` locally. Do not push yet. Make each step independently
verifiable. Decompose into parts if large (see § Large plan decomposition).

### Step 5: Clean sub-agent review panel

Follow the [`kata-review` caller
protocol](../kata-review/references/caller-protocol.md). Invoke it on the
local `plan-a.md` (and any parts) before you push. Tell each reviewer not to
invoke `kata-plan`. Address every confirmed finding at or above the
configured blocking severity floor (caller protocol) before you open the PR. The PR should not become visible to `kata-dispatch`
until the panel is clean.

### Step 6: Open a plan PR

The PR title carries the spec id: `plan(NNN): …`.

Hold every published body to
[citation integrity](../../agents/x-citation-integrity.md).

### Step 7: Write STATUS

When the panel passes and you meet the DO-CONFIRM checks, edit
`wiki/STATUS.md` to set the spec's row to `{NNN}\tplan\tapproved`. Commit the
wiki edit alongside any other wiki updates from this session. The Stop hook
pushes the wiki commit. `kata-release-merge` then merges the plan PR.

## Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **Specs planned** — Spec number, name, and status transition
- **Plan decisions** — Key approach choices and why (context for the
  implementer)
- **Deferred specs** — Specs skipped and why (not approved, missing info, etc.)
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/` per
  `references/metrics.md`. See KATA.md § Metrics for the recording-eligibility
  rule.
