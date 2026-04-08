---
name: gemba-spec
description: >
  Write and review specifications (WHAT/WHY) for features, changes, and
  improvements. Manage spec status in specs/STATUS through draft → review.
  Use when proposing changes, capturing findings as actionable specs, or
  evaluating spec quality. Pair with the `gemba-plan` skill for the HOW side.
phase: Act
---

# Write and Review Specs

A spec defines WHAT to build and WHY. Pair with the
[`gemba-plan`](../gemba-plan/SKILL.md) skill — once a spec is approved, the
staff engineer turns it into a plan that translates the WHAT/WHY into HOW.

**Spec and plan are independent deliverables.** Only produce the one the user
asked for. If they ask for a spec, write the spec and stop.

## When to Use

- Capturing a finding (audit, gemba walk, product feedback) as actionable work
- Documenting a proposed feature, change, or improvement with rationale
- Reviewing a spec before it advances to planning ("review spec NNN", "is spec
  NNN ready?")

## Directory Structure

```
specs/{NNN}-{kebab-case-name}/
  spec.md    WHAT and WHY      (this skill)
  plan.md    HOW               (the `gemba-plan` skill)
```

Number directories sequentially. Use the next available number.

## Writing a Spec (WHAT and WHY)

The spec answers two questions: what are we changing, and why does it matter?

Structure and format are up to you — adapt to whatever best serves the content.
Focus on these qualities:

- **Problem first.** The reader should feel the pain or see the opportunity
  before encountering any proposal. Back it up with evidence — errors, metrics,
  audit findings, examples of current behaviour.
- **Specific scope.** Name the files, APIs, entities, or behaviours affected.
  Make clear what is and is not included. Vague specs produce vague work.
- **Verifiable success.** Define what "done" looks like in terms someone can
  test — a command to run, a behaviour to observe, a property to check.
- **No HOW.** If you find yourself describing implementation steps, stop and
  save it for the plan. The spec should remain stable as implementation details
  change.

## Status Lifecycle

Specs track progress in `specs/STATUS`. The lifecycle is:

```
draft → review → planned → active → done
```

| Status    | Meaning                                     | Set by            |
| --------- | ------------------------------------------- | ----------------- |
| `draft`   | Spec is being written, not ready for review | `gemba-spec`      |
| `review`  | Spec is ready for evaluation                | `gemba-spec`      |
| `planned` | Spec approved and a plan is approved        | `gemba-plan`      |
| `active`  | Implementation in progress                  | `gemba-implement` |
| `done`    | Implemented                                 | `gemba-implement` |

This skill owns the `draft` and `review` transitions. The `gemba-plan` skill
advances to `planned` once both spec and plan are approved. The
`gemba-implement` skill owns `active` and `done`.

## Reviewing a Spec

Evaluate `spec.md` against the qualities listed in "Writing a Spec" above:
problem is clear with evidence, scope is specific, success is verifiable, and no
implementation details have leaked in.

If all criteria are met, approve the spec. If any criterion falls short, request
changes and return status to `draft`.

| Situation                | Decision | Target status |
| ------------------------ | -------- | ------------- |
| Spec content is approved | Approve  | `review`\*    |
| Changes requested        | Revise   | `draft`       |

\*The spec stays at `review` until a plan is also approved — at which point the
`gemba-plan` skill advances it to `planned`.

If you are operating in a context where you cannot commit changes (e.g.,
evaluating a spec PR for another workflow), report your decision and target
status clearly — the caller is responsible for acting on it.

## Process

1. **Clarify first.** Ask the user (or upstream finding source) questions before
   writing anything. Understand the motivation, desired scope, constraints, and
   what success looks like. A brief conversation up front prevents major
   rewrites later.
2. **Research.** Read relevant code, data files, and existing specs. Understand
   the current state before proposing changes.
3. **Write the spec.** Focus on WHAT and WHY. Do not include implementation
   details — those go in the plan.
4. **Update STATUS.** Add the spec to `specs/STATUS` with status `draft`.
5. **Present the spec.** Share it for feedback. Iterate until satisfied, then
   set status to `review` — signalling it is ready for formal evaluation. Stop
   here. The plan is the staff engineer's job.

## What NOT to Do

- **Do not write the plan.** That belongs to the `gemba-plan` skill (Plan
  phase). Drafting implementation steps in the spec couples WHAT to HOW and
  forces rewrites whenever the implementation strategy changes.
- **Do not approve without reading.** Every criterion must be checked against
  the actual content.
- **Do not rewrite during review.** Reviews evaluate — they do not author. If
  changes are needed, return the status to `draft`.
