---
name: gemba-plan
description: >
  Write and review implementation plans (HOW) for approved specs. Translate
  an approved spec.md into concrete steps, files, tests, and risks for a
  trusted agent to execute. Advances status from review → planned.
phase: Plan
---

# Write and Review Plans

A plan defines HOW to implement an approved spec. Pair with the
[`gemba-spec`](../gemba-spec/SKILL.md) skill — the spec captures WHAT/WHY, the
plan captures HOW.

**A plan requires an existing approved spec.** Without an approved spec there is
no commitment to implement, and a plan has nothing to translate.

## When to Use

- Turning an approved spec (`status: review` with content approved) into an
  execution-ready `plan.md`
- Reviewing a plan before it advances to `planned` ("review plan NNN", "is plan
  NNN ready?")
- Choosing between competing plan variants for the same spec

## Writing a Plan (HOW)

The plan translates an approved spec into concrete implementation steps.

Structure and format are up to you — match the complexity of the change. Focus
on these qualities:

- **Approach before details.** Open with the overall strategy and rationale
  before diving into individual changes.
- **Concrete changes.** Name exact file paths, functions, and code. Show
  before/after when it clarifies intent. Each change should be independently
  verifiable.
- **Visible blast radius.** Make it easy to see which files are created,
  modified, or deleted.
- **Explicit ordering.** When changes have dependencies, state the order and why
  it matters.
- **Decisions explained.** When you make a non-obvious choice, say why briefly.
  This prevents future re-debate.
- **Risks surfaced.** Flag steps that require judgement, ambiguous decisions, or
  unknowns. The implementer should never be surprised by a step.

When a spec has multiple competing plans, use numbered variants:
`plan-01-approach-a.md`, `plan-02-approach-b.md`.

## Reviewing a Plan

Evaluate `plan.md` against the qualities listed in "Writing a Plan" above:
approach is stated, changes are concrete, blast radius is visible, ordering is
explicit, decisions are explained, and risks are surfaced.

If all criteria are met **and** the spec is also approved, advance the spec to
`planned` in `specs/STATUS`. If any criterion falls short, request changes and
return status to `draft`.

| Situation                                 | Decision | Target status |
| ----------------------------------------- | -------- | ------------- |
| Spec approved + plan approved             | Approve  | `planned`     |
| Plan approved but spec still under review | Wait     | (no change)   |
| Plan changes requested                    | Revise   | `draft`       |

The full status lifecycle lives in the
[`gemba-spec`](../gemba-spec/SKILL.md#status-lifecycle) skill — this skill owns
only the `review → planned` transition.

If you cannot commit changes (e.g., evaluating a plan PR for another workflow),
report your decision and target status clearly — the caller is responsible for
acting on it.

## Process

1. **Find the spec.** A plan requires an approved spec in the same directory. If
   no spec exists or the spec has not yet been approved, stop — the spec skill
   must run first.
2. **Study the spec.** Read `spec.md` end to end. You should be able to restate
   the problem, scope, and success criteria without referring back.
3. **Research the codebase.** Read the files the plan will target. Verify
   current state matches what the spec assumes.
4. **Write the plan.** Translate the approved spec into concrete steps. Each
   step should be independently verifiable. Surface risks explicitly.
5. **Present the plan.** Share it for feedback.
6. **Update STATUS.** When both spec and plan are approved, advance the spec's
   status from `review` to `planned`. Do not advance while the plan is still
   being iterated on.

## What NOT to Do

- **Do not write or revise the spec.** That belongs to the `gemba-spec` skill
  (Act phase). If the spec is wrong or unclear, return it to `draft` and let the
  spec author fix it.
- **Do not bundle multiple specs into one plan.** One plan per spec — even when
  specs share a theme. Bundling defeats independent review and rollback.
- **Do not implement.** This skill writes the plan; `gemba-implement` (Do phase)
  executes it.
- **Do not approve a plan whose spec is still under review.** Both must be
  approved before advancing to `planned`.
