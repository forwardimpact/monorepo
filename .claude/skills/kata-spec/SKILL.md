---
name: kata-spec
description: >
  Write specifications (WHAT/WHY) for features, changes, and improvements.
  Spec is approved when `wiki/STATUS.md` shows the spec row at `spec
  approved` — written there by a human signal (label, comment, APPROVED
  review, or in-session message) that `kata-dispatch` or the active agent
  propagates. Use when proposing changes, capturing findings as actionable
  specs, or evaluating spec quality. Pair with the `kata-plan` skill for
  the HOW side.
---

# Write and Review Specs

A spec defines WHAT to build and WHY. Spec sits in the spec →
[design](../kata-design/SKILL.md) → [plan](../kata-plan/SKILL.md) →
[implement](../kata-implement/SKILL.md) pipeline: the spec captures WHAT/WHY,
the design captures WHICH/WHERE, the plan captures HOW/WHEN, and implementation
executes the plan.

**Spec and plan are independent deliverables.** Only produce the one the user
asked for. If they ask for a spec, write the spec and stop.

## When to Use

- Capturing a finding (audit, kata walk, product feedback) as actionable work
- Documenting a proposed feature, change, or improvement with rationale
- Reviewing a spec before it advances to planning ("review spec NNN", "is spec
  NNN ready?")
- Co-running with `kata-design` when one prompt asks for both — see
  [lockstep co-execution](../kata-design/references/lockstep-co-execution.md)

## Checklists

<read_do_checklist goal="Ensure the WHAT/WHY boundary when writing a spec">

- [ ] Claim the spec number in `wiki/STATUS.md` as the first action — append a
      `{NNN}\tspec\tdraft` row before writing, so parallel sessions cannot
      claim the same id.
- [ ] Only produce the deliverable(s) asked for — never auto-advance to the
      plan. Spec+design in one prompt is a valid pairing: run
      [lockstep co-execution](../kata-design/references/lockstep-co-execution.md).
- [ ] No implementation details in the spec — file paths, function signatures,
      and code patterns belong in the plan.
- [ ] When reviewing: evaluate, do not rewrite. If changes are needed, return to
      `draft`.
- [ ] Clarify motivation, scope, and success criteria with the user before
      writing.

</read_do_checklist>

<do_confirm_checklist goal="Verify spec quality before recommending approval">

- [ ] Spec meets the criteria in § Writing a Spec.
- [ ] Clean sub-agent review panel of `spec.md` via
      [`kata-review`](../kata-review/SKILL.md) completed (fresh context, no
      prior bias, panel size per caller protocol) and every **blocker**,
      **high**, and **medium** finding addressed.

</do_confirm_checklist>

## Directory Structure

    specs/{NNN}-{kebab-case-name}/
      spec.md      WHAT and WHY      (this skill)
      design-a.md  WHICH and WHERE   (the `kata-design` skill)
      plan-a.md    HOW and WHEN      (the `kata-plan` skill)

Numbers are claimed in `wiki/STATUS.md` (see § Process Step 1) before any
content is written. The directory name pairs the claimed `NNN` with a
kebab-case slug.

## Writing a Spec (WHAT and WHY)

The spec answers two questions: what are we changing, and why does it matter?
Identify which persona and job from [JTBD.md](../../../JTBD.md) the spec serves.

- **Problem first.** Evidence before proposal — errors, metrics, examples.
- **Specific scope.** Name affected files, APIs, entities; state what is
  excluded.
- **Verifiable success.** Each criterion is a claim plus the command or path
  that verifies it. One sentence each. No rationale, no alternatives considered.
- **No HOW.** Name what each component does, not which mechanism implements it.
  Tool selection and sequencing belong in the design and plan. Cite evidence
  by entity or behaviour name, not by `file:line` pointer.
- **State the classification.** The spec carries a one-line
  product-vs-internal classification per the shared rubric in
  [work-definition.md § Product-aligned vs internal](../../agents/x-work-definition.md#product-aligned-vs-internal).

**Form follows content.** Prefer tables for lists with shared structure (files,
criteria, alternatives). Prefer bullets for flat facts. Use prose only for the
narrative thread between them. If a paragraph could be a row, make it a row. Do
not restate what the artifact already shows.

## Approval

A spec is approved when `wiki/STATUS.md` shows its row at `spec approved`. The
decision is **human-only**: agents never autonomously originate `spec approved`.
STATUS is written when a trusted human's signal is observed — `<phase>:approved`
label, APPROVED review, approval comment on the PR, or a direct message in an
interactive session. `kata-dispatch` validates trust and propagates PR-side
signals into STATUS; an in-session agent writes STATUS when the user explicitly
approves. See
[`approval-signals.md`](../../agents/x-approval-signals.md)
and
[`coordination-protocol.md` § Approval signal](../../agents/x-coordination-protocol.md#approval-signal).

Phase progression is derived from `main`: once the spec PR merges,
`specs/NNN/spec.md` exists on `main` and the next phase may begin. A STATUS
row at `spec approved` authorizes the merge but does not by itself advance
the phase.

## Reviewing a Spec

Evaluate `spec.md` against the qualities listed in "Writing a Spec" above,
then run the DO-CONFIRM checklist at the top of this skill. Report your
findings via PR comment so a trusted human reviewing the PR can act on
them.

**Do not recommend approval, and do not apply the `spec:approved` label.**
Deciding on approval is a human-only action. The release engineer detects
approval signals across multiple channels — labels, PR comments, APPROVED
reviews, in-session user messages — and reads `wiki/STATUS.md` as the
canonical record. Your job here is to evaluate quality and surface
findings, not to gate the approval signal.

If criteria fall short, request changes via PR comment.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`, then run `fit-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
The digest's `owned_priorities`, `claims`, and `storyboard_items` seed this
Process.
Extract specs previously written and any deferred work from prior entries.

### Step 1: Claim the spec number

Read `wiki/STATUS.md` and pick the next available id — the next multiple of 10
above the current highest. Append a `{NNN}\tspec\tdraft` row to STATUS.md and
commit the wiki. The Stop hook pushes wiki commits, so the claim becomes
visible to other sessions immediately and parallel PRs cannot collide on the
same number. If the spec is later abandoned, transition the row to
`{NNN}\tspec\tcancelled` rather than deleting it.

### Step 2: Clarify

Ask about motivation, scope, constraints, and success before writing.

### Step 3: Research

Read relevant code, data, and existing specs.

### Step 4: Write the spec

WHAT and WHY only. Write `specs/NNN/spec.md` locally using the id claimed in
Step 1; do not push yet.

### Step 5: Clean sub-agent review panel

Follow the [`kata-review` caller
protocol](../kata-review/references/caller-protocol.md), invoked on the local
`specs/NNN/spec.md` before push. Tell each reviewer not to invoke
`kata-spec`. Address every confirmed blocker/high/medium finding before
opening the PR — the PR should not become visible to `kata-dispatch` until the
panel is clean.

### Step 6: Open a spec PR

The PR title carries the spec id: `spec(NNN): …`. Merge of that PR is what
advances the phase. Apply the matching `product` / `internal` label per the
shared rubric when opening the PR. Do not apply the `spec:approved` label and
do not recommend approval — those are human-only actions; see § Approval.

Under
[lockstep co-execution](../kata-design/references/lockstep-co-execution.md), do
**not** open a separate spec PR — the spec ships inside the single combined PR
opened at the design stage.

Hold every published body to
[citation integrity](../../agents/x-citation-integrity.md).

## Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **Specs written** — Spec number, name, and status
- **Review results** — Specs reviewed and disposition (approved/changes needed)
- **Deferred work** — Findings not yet captured as specs
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/`
  per `references/metrics.md`. See KATA.md § Metrics for the
  recording-eligibility rule.
