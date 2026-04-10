---
name: gemba-plan
description: >
  Write and review implementation plans (HOW) for approved specs. Translate
  an approved spec.md into concrete steps, files, tests, and risks for a
  trusted agent to execute. Advances status from review → planned.
---

# Write and Review Plans

A plan defines HOW to implement an approved spec. Pair with the
[`gemba-spec`](../gemba-spec/SKILL.md) skill — the spec captures WHAT/WHY, the
plan captures HOW.

**A plan requires an existing approved spec.** Without an approved spec there is
no commitment to implement, and a plan has nothing to translate.

## When to Use

- Turning an approved spec (`status: review` with content approved) into an
  execution-ready plan
- Reviewing a plan before it advances to `planned` ("review plan NNN", "is plan
  NNN ready?")
- Creating an alternative plan variant for the same spec

## Naming Convention

Plans live alongside their spec in `specs/{NNN}-{name}/`.

### Default plan

The first (and usually only) plan is always **`plan-a.md`**. Do not use
`plan.md` or other shorthands — the letter suffix keeps naming consistent
whether one plan or several exist.

### Alternative plans

When exploring competing approaches for the same spec, create additional
variants using sequential letters:

```
plan-a.md    ← default (always created first)
plan-b.md    ← alternative approach
plan-c.md    ← another alternative
```

Each variant should open with a brief rationale explaining how it differs from
plan-a. When the spec advances to `planned`, **plan-a is the plan that will be
implemented** unless the approver explicitly selects a different variant.

### Large plan decomposition

When a plan is too large to implement as a single unit — many files, multiple
independent phases, or risk of exceeding context — decompose it into numbered
parts:

```
plan-a.md       ← overview, strategy, and part index
plan-a-01.md    ← part 1 (independently executable)
plan-a-02.md    ← part 2 (independently executable)
plan-a-03.md    ← part 3 (independently executable)
```

**Rules for decomposition:**

- `plan-a.md` contains the overall approach, rationale, cross-cutting concerns,
  and a numbered index linking to each part with a one-line summary.
- Each part (`plan-a-NN.md`) is independently executable — it has its own scope,
  file list, ordering, and verification steps. The implementer can complete and
  commit each part without needing the others to be finished.
- Parts are numbered in execution order. State inter-part dependencies
  explicitly (e.g., "part 02 depends on part 01 for the new type definitions").
- A single-part plan does not need decomposition — only decompose when there is
  a concrete benefit (size, independence, parallelism).

Alternative plans can also be decomposed (`plan-b.md`, `plan-b-01.md`, etc.).

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

## Reviewing a Plan

Evaluate the plan against the qualities listed in "Writing a Plan" above:
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

When multiple plan variants exist (plan-a, plan-b, etc.), the review should
note which variant is approved. If no variant is explicitly selected, plan-a is
the default.

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
4. **Write the plan.** Create `plan-a.md`. Translate the approved spec into
   concrete steps. Each step should be independently verifiable. Surface risks
   explicitly. If the plan is large, decompose it into parts (see § Large plan
   decomposition).
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
- **Do not use `plan.md` as a filename.** Always use `plan-a.md` (or
  `plan-b.md`, etc.) for naming consistency.
