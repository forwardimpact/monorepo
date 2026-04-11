---
name: gemba-spec
description: >
  Write and review specifications (WHAT/WHY) for features, changes, and
  improvements. Manage spec status in specs/STATUS through draft → review.
  Use when proposing changes, capturing findings as actionable specs, or
  evaluating spec quality. Pair with the `gemba-plan` skill for the HOW side.
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

## Checklists

<read_do_checklist goal="Ensure the WHAT/WHY boundary when writing a spec">

- [ ] Only produce the deliverable asked for — if asked for a spec, stop after
      the spec. Do not also write a plan.
- [ ] No implementation details in the spec — file paths, function signatures,
      and code patterns belong in the plan.
- [ ] When reviewing: evaluate, do not rewrite. If changes are needed, return to
      `draft`.
- [ ] Clarify motivation, scope, and success criteria with the user before
      writing.

</read_do_checklist>

<do_confirm_checklist goal="Verify spec quality before approving">

- [ ] Problem is stated first, backed by evidence (errors, metrics, examples).
- [ ] Scope names specific files, APIs, or entities — and states what is
      excluded.
- [ ] Success criteria are verifiable (a command, observable behaviour, or
      testable property).
- [ ] No implementation details have leaked in (HOW belongs in the plan).
- [ ] Clean sub-agent review of `spec.md` completed (fresh context, no prior
      bias) and every **blocker**, **high**, and **medium** finding addressed.

</do_confirm_checklist>

## Directory Structure

```
specs/{NNN}-{kebab-case-name}/
  spec.md      WHAT and WHY      (this skill)
  plan-a.md    HOW               (the `gemba-plan` skill)
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

Evaluate `spec.md` against the qualities listed in "Writing a Spec" above, then
run the DO-CONFIRM checklist at the top of this skill.

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
5. **Clean sub-agent review.** Before advancing status, launch a fresh sub-agent
   (via the `Agent` tool, no prior conversation context) and ask it to review
   `spec.md` against this skill's DO-CONFIRM checklist and the qualities in
   "Writing a Spec". The reviewer must **return findings only** — tell it
   explicitly not to invoke the `gemba-spec` skill or any other skill, and not
   to spawn its own sub-agents. This prevents recursion. Instruct it to grade
   each finding using the severity vocabulary in
   [Review Severity](#review-severity) below. Address every **blocker**,
   **high**, and **medium** finding before moving on. **Low** findings are
   optional. If the reviewer raises blockers you disagree with, resolve the
   disagreement explicitly (revise, or record the rationale for dismissal) —
   silent dismissal is not allowed.
6. **Present the spec.** Share it for feedback. Iterate until satisfied, then
   set status to `review` — signalling it is ready for formal evaluation. Stop
   here. The plan is the staff engineer's job.

## Review Severity

The clean sub-agent reviewer grades each finding using this vocabulary. It is
shared with [`gemba-plan`](../gemba-plan/SKILL.md#review-severity) and
[`gemba-implement`](../gemba-implement/SKILL.md#review-severity) so grading is
consistent across the spec → plan → implement arc.

- **Blocker** — The work is broken, dangerous, or materially wrong. Must fix
  before advancing (approving the spec, advancing status, merging code).
- **High** — A correctness or clarity problem that will cause rework, confusion,
  or bugs downstream if shipped. Fix before advancing.
- **Medium** — A real quality or consistency issue worth fixing now while the
  context is fresh. Fix before advancing.
- **Low** — Nit or preference. Optional; document if dismissed.

## What NOT to Do

The READ-DO checklist covers the core boundaries (spec only, no implementation
details, evaluate don't rewrite). Additionally:

- **Do not approve without reading.** Every criterion must be checked against
  the actual content.
