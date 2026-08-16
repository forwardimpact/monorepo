---
name: kata-spec
description: >
  Write specifications (WHAT/WHY) for features, changes, and improvements.
  A spec is approved when `wiki/STATUS.md` shows the spec row at `spec
  approved`. A human signal writes that row: a label, a comment, an APPROVED
  review, or an in-session message. `kata-dispatch` or the active agent
  propagates the signal. Use this skill to propose changes, to capture findings
  as actionable specs, or to evaluate spec quality. Pair it with the
  `kata-plan` skill for the HOW side.
---

# Write and Review Specs

A spec defines WHAT to build and WHY. The spec sits in the spec →
[design](../kata-design/SKILL.md) → [plan](../kata-plan/SKILL.md) →
[implement](../kata-implement/SKILL.md) pipeline. The spec captures WHAT/WHY.
The design captures WHICH/WHERE. The plan captures HOW/WHEN. Implementation
executes the plan.

**Spec and plan are independent deliverables.** Only produce the one the user
asked for. If they ask for a spec, write the spec and stop.

## When to Use

- Capture a finding (audit, kata walk, product feedback) as actionable work
- Document a proposed feature, change, or improvement with rationale
- Review a spec before it advances to the plan phase ("review spec NNN", "is
  spec NNN ready?")
- Co-run with `kata-design` when one prompt asks for both. See
  [lockstep co-execution](../kata-design/references/lockstep-co-execution.md)

## Checklists

<read_do_checklist goal="Ensure the WHAT/WHY boundary when writing a spec">

- [ ] Claim the spec number in `wiki/STATUS.md` as the first action. Append a
      `{NNN}\tspec\tdraft` row before you write, so parallel sessions cannot
      claim the same id.
- [ ] Only produce the deliverable(s) asked for. Never auto-advance to the
      plan. Spec+design in one prompt is a valid pair. Run
      [lockstep co-execution](../kata-design/references/lockstep-co-execution.md).
- [ ] Put no implementation details in the spec. File paths, function
      signatures, and code patterns belong in the plan.
- [ ] When you review, evaluate. Do not rewrite. If the spec needs changes,
      return it to `draft`.
- [ ] Clarify motivation, scope, and success criteria with the user before you
      write.

</read_do_checklist>

<do_confirm_checklist goal="Verify spec quality before recommending approval">

- [ ] Spec meets the criteria in § Writing a Spec.
- [ ] The clean sub-agent review panel of `spec.md` through
      [`kata-review`](../kata-review/SKILL.md) is complete (fresh context,
      panel size per caller protocol). Address every confirmed finding at or
      above the configured blocking severity floor
      ([caller protocol](../kata-review/references/caller-protocol.md)).

</do_confirm_checklist>

## Directory Structure

    specs/{NNN}-{kebab-case-name}/
      spec.md      WHAT and WHY      (this skill)
      design-a.md  WHICH and WHERE   (the `kata-design` skill)
      plan-a.md    HOW and WHEN      (the `kata-plan` skill)

Claim numbers in `wiki/STATUS.md` (see § Process Step 1) before you write any
content. The directory name pairs the claimed `NNN` with a kebab-case slug.

## Writing a Spec (WHAT and WHY)

The spec answers two questions: what the change is, and why it matters.
Identify which persona and job from [JTBD.md](../../../JTBD.md) the spec serves.

- **Problem first.** Give evidence before the proposal: errors, metrics,
  examples.
- **Specific scope.** Name affected files, APIs, and entities. State what is
  excluded.
- **Compatibility stance.** Write one line: a clean break, or a compat
  requirement with its why. Clean break is the default unless CONTRIBUTING.md
  states a different policy. Silence means clean break downstream. When you
  break compatibility, list old-path removal as a success criterion.
- **Verifiable success.** Each criterion is a claim plus the command or path
  that verifies it. Write one sentence each. Add no rationale and no
  alternatives.
- **No HOW.** Name what each component does. Do not name the mechanism that
  implements it. Tool selection and sequence belong in the design and plan.
  Cite evidence by entity or behaviour name. Do not cite a `file:line` pointer.
- **State the classification.** The spec carries a one-line
  product-vs-internal classification per the shared rubric in
  [work-definition.md § Product-aligned vs internal](../../agents/x-work-definition.md#product-aligned-vs-internal).

**Form follows content.** Prefer tables for lists with shared structure (files,
criteria, alternatives). Prefer bullets for flat facts. Use prose only for the
narrative thread between them. If a paragraph could be a row, make it a row. Do
not restate what the artifact already shows.

## Approval

A spec is approved when `wiki/STATUS.md` shows its row at `spec approved`. The
decision is **human-only**. Agents never autonomously originate
`spec approved`. Write STATUS when you observe a trusted human's signal. The
signal is a `<phase>:approved` label, an APPROVED review, an approval comment
on the PR, or a direct message in an interactive session. `kata-dispatch`
validates trust and propagates PR-side signals into STATUS. An in-session agent
writes STATUS when the user explicitly approves. See
[`approval-signals.md`](../../agents/x-approval-signals.md)
and
[`coordination-protocol.md` § Approval signal](../../agents/x-coordination-protocol.md#approval-signal).

Phase progression comes from `main`. Once the spec PR merges,
`specs/NNN/spec.md` exists on `main`. The next phase may then begin. A STATUS
row at `spec approved` authorizes the merge. It does not by itself advance the
phase.

## Reviewing a Spec

Evaluate `spec.md` against the qualities listed in "Writing a Spec" above.
Then run the DO-CONFIRM checklist at the top of this skill. Report your
findings in a PR comment so a trusted human who reviews the PR can act on
them.

**Do not recommend approval, and do not apply the `spec:approved` label.** The
approval decision is a human-only action. The release engineer detects approval
signals across multiple channels: labels, PR comments, APPROVED reviews, and
in-session user messages. The release engineer reads `wiki/STATUS.md` as the
canonical record. Your job here is to evaluate quality and surface findings. Do
not gate the approval signal.

If the criteria fall short, request changes in a PR comment.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`. Then run `gemba-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
The digest's `owned_priorities`, `claims`, and `storyboard_items` seed this
Process.
Extract the specs you wrote before and any deferred work from prior entries.

### Step 1: Claim the spec number

Read `wiki/STATUS.md`. Pick the next available id: the next multiple of 10
above the current highest. Append a `{NNN}\tspec\tdraft` row to STATUS.md.
Commit the wiki. The Stop hook pushes wiki commits, so other sessions see the
claim at once. Parallel PRs cannot collide on the same number. If you later
abandon the spec, transition the row to `{NNN}\tspec\tcancelled`. Do not delete
it.

### Step 2: Clarify

Ask about motivation, scope, constraints, and success before you write.

### Step 3: Research

Read relevant code, data, and existing specs.

### Step 4: Write the spec

Write WHAT and WHY only. Write `specs/NNN/spec.md` locally with the id you
claimed in Step 1. Do not push yet.

### Step 5: Clean sub-agent review panel

Follow the [`kata-review` caller
protocol](../kata-review/references/caller-protocol.md). Invoke it on the local
`specs/NNN/spec.md` before you push. Tell each reviewer not to invoke
`kata-spec`. Address every confirmed finding at or above the configured
blocking severity floor
([caller protocol](../kata-review/references/caller-protocol.md))
before you open the PR. The PR should not become visible to `kata-dispatch`
until the panel is clean.

### Step 6: Open a spec PR

The PR title carries the spec id: `spec(NNN): …`. The merge of that PR advances
the phase. Apply the matching `product` / `internal` label per the shared
rubric when you open the PR. Do not apply the `spec:approved` label. Do not
recommend approval. Those are human-only actions. See § Approval.

Under
[lockstep co-execution](../kata-design/references/lockstep-co-execution.md), do
**not** open a separate spec PR. The spec ships inside the single combined PR
that you open at the design stage.

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
