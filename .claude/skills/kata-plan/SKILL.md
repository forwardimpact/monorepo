---
name: kata-plan
description: >
  Write implementation plans (HOW/WHEN) for approved designs. Translate an
  approved design into concrete steps, file changes, sequencing, and risks
  for a trusted agent to execute. Plan is approved when `wiki/STATUS.md`
  shows the spec row at `plan approved` — `staff-engineer` writes this row
  after a clean panel review (plans may be approved by agents).
---

# Write and Review Plans

A plan defines HOW to implement and WHEN to sequence changes. Plan sits in the
[spec](../kata-spec/SKILL.md) → [design](../kata-design/SKILL.md) → plan →
[implement](../kata-implement/SKILL.md) pipeline: the spec captures WHAT/WHY,
the design captures WHICH/WHERE, the plan captures HOW/WHEN, and implementation
executes the plan.

**A plan requires an existing approved design.** Without an approved design
there is no architectural direction to translate into implementation steps.

## When to Use

- Turning a merged design (`specs/NNN/design-a.md` on `origin/main`) into an
  execution-ready plan
- Reviewing a plan before approval ("review plan NNN", "is plan NNN ready?")
- Creating an alternative plan variant for the same spec

## Checklists

<read_do_checklist goal="Internalize plan-writing boundaries before starting">

- [ ] Confirm `specs/NNN/design-a.md` exists on `origin/main` after
      `git fetch origin main` — wait for the design PR to merge before
      starting a plan.
- [ ] Do not write or revise the spec — return it to `draft` if it needs
      changes.
- [ ] Do not implement — this skill writes the plan; `kata-implement` executes
      it.
- [ ] One plan per spec — do not bundle multiple specs into one plan.
- [ ] Read the spec and design end-to-end before writing. Restate problem,
      scope, success criteria, and architectural direction without referring
      back.

</read_do_checklist>

<do_confirm_checklist goal="Verify plan quality before recommending approval">

- [ ] Plan meets the criteria in § Writing a Plan.
- [ ] Clean sub-agent review panel of `plan-a.md` (and any parts) via
      [`kata-review`](../kata-review/SKILL.md) completed (fresh context, no
      prior bias, panel size per caller protocol) and every **blocker**,
      **high**, and **medium** finding addressed.

</do_confirm_checklist>

## Naming Convention

Plans live alongside their spec in `specs/{NNN}-{name}/`. The first plan is
always **`plan-a.md`**. Alternative variants use sequential letters
(`plan-b.md`, `plan-c.md`); each opens with a rationale. **plan-a is
implemented** unless the approver selects a different variant.

### Large plan decomposition

When too large for a single unit, decompose into numbered parts:

    plan-a.md       ← overview, strategy, and part index
    plan-a-01.md    ← part 1 (independently executable)
    plan-a-02.md    ← part 2 (independently executable)

- `plan-a.md` holds approach, cross-cutting concerns, and a numbered index.
- Each `plan-a-NN.md` is independently executable; state inter-part
  dependencies.
- Decompose only when there is concrete benefit (size, independence,
  parallelism).
- Include an **Execution** section: parallel vs sequential, agent routing.

Alternative plans can also be decomposed (`plan-b-01.md`, etc.).

## Writing a Plan (HOW + WHEN)

The plan translates an approved design into concrete implementation steps.

- **No re-introduction.** Let a trusted agent execute without re-reading the
  spec or design. Reference them by link; do not restate them. The "Approach"
  section is one paragraph; further rationale belongs in the design.
- **Per-step shape.** Each step is a heading plus: one sentence of intent; a
  file list (created / modified / deleted); the concrete change (code block,
  table, or bullet list); one line of verification. No per-step rationale
  paragraphs — decisions live in the Approach paragraph or the design.
- **Libraries used.** One line: `Libraries used: libfoo (a, b), libbar (c).` or
  `Libraries used: none.` No section heading, no paragraph.
- **Risks.** List risks the implementer cannot see from reading the plan. If the
  mitigation is "do the plan correctly", it is not a risk.
- **Execution recommendation.** Route parts to the most suitable agent —
  engineering agents for code, `technical-writer` for docs. For decomposed
  plans, state which parts can run in parallel vs sequentially.
- **Clean break.** The plan replaces the old path — no shims, aliases, or
  fallbacks — and every removal the design names lands in a step's deleted
  list, not in follow-up work. Compat appears only when the design names it
  as a requirement; if a clean break can't meet the design, revise the
  design rather than planning around it.

**Form follows content.** Prefer tables for shared-structure lists, bullets for
flat facts, prose only for narrative connecting them. If a paragraph could be a
row, make it a row.

## Approval

A plan is approved when `wiki/STATUS.md` shows the spec row at `plan approved`.
Plans may be approved by `staff-engineer` after a clean `kata-plan` panel
review; alternatively, the same human-driven signals that gate spec/design
(label, PR comment, APPROVED review, in-session user message) also feed STATUS
for plans. See
[`approval-signals.md`](../../agents/x-approval-signals.md)
and
[`coordination-protocol.md` § Approval signal](../../agents/x-coordination-protocol.md#approval-signal).

**Post-panel coverage.** If commits land between the panel and the STATUS
write, record a scoped panel re-read on the PR, or a dual-SHA PR comment naming
the panel-clean and amendment SHAs — the row must not silently claim head
coverage.

## Reviewing a Plan

Evaluate the plan against the DO-CONFIRM checklist. If all criteria are
met, edit `wiki/STATUS.md` to set the spec's row to `{NNN}\tplan\tapproved`
and commit the wiki edit; the Stop hook pushes it. `kata-release-merge` will
then merge the plan PR.

If any criterion falls short, request changes via PR comment — do not write
STATUS until the criteria are met.

When multiple variants exist, note which is recommended (plan-a is the default).

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`, then run `fit-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
The digest's `owned_priorities`, `claims`, and `storyboard_items` seed this
Process.
Extract specs previously planned and any deferred work from prior entries.

### Step 1: Find the design

Run `git fetch origin main`, then confirm `specs/NNN/design-a.md` exists on
`origin/main` — wait for the design PR to merge before starting a plan.

### Step 2: Study the spec and design

Read both end to end.

### Step 3: Research the codebase

Read the files the plan will target. Before drafting, enumerate every library
or service primitive the design cites, plus the test files that will host new
assertions, and source-read each declaration before the first draft.

### Step 4: Write the plan

Create `plan-a.md` locally; do not push yet. Each step independently
verifiable. Decompose into parts if large (see § Large plan decomposition).

### Step 5: Clean sub-agent review panel

Follow the [`kata-review` caller
protocol](../kata-review/references/caller-protocol.md), invoked on the local
`plan-a.md` (and any parts) before push. Tell each reviewer not to invoke
`kata-plan`. Address every confirmed blocker/high/medium finding before
opening the PR — the PR should not become visible to `kata-dispatch` until the
panel is clean.

### Step 6: Open a plan PR

The PR title carries the spec id: `plan(NNN): …`.

Hold every published body to
[citation integrity](../../agents/x-citation-integrity.md).

### Step 7: Write STATUS

When the panel passes and the DO-CONFIRM checks are met, edit
`wiki/STATUS.md` to set the spec's row to `{NNN}\tplan\tapproved`. Commit the
wiki edit alongside any other wiki updates from this session; the Stop hook
pushes the wiki commit. `kata-release-merge` will then merge the plan PR.

## Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **Specs planned** — Spec number, name, and status transition
- **Plan decisions** — Key approach choices and why (context for the
  implementer)
- **Deferred specs** — Specs skipped and why (not approved, missing info, etc.)
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/` per
  `references/metrics.md`. See KATA.md § Metrics for the recording-eligibility
  rule.
