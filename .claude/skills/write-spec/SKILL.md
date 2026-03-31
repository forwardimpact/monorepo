---
name: write-spec
description: >
  Write, review, and manage spec.md (WHAT and WHY) and plan.md (HOW) documents
  in the specs/ directory. Use when starting a new feature, proposing a change,
  documenting an implementation approach, or reviewing a spec for approval.
---

# Write and Review Specs

Create, review, and manage specification and implementation plan documents for
features, changes, and improvements. A spec defines WHAT to build and WHY. A
plan defines HOW to build it.

**Spec and plan are independent deliverables.** Only produce what the user asked
for. If they ask for a spec, write the spec and stop — do not continue to a
plan. If they ask for a plan (and a spec already exists), write the plan only.
Write both only when explicitly requested.

## When to Use

- Starting a new feature or significant change
- Documenting a proposed improvement with rationale
- Writing an implementation plan for an approved spec
- Reviewing a spec before implementation ("review spec NNN", "is spec NNN
  ready?")

## Directory Structure

```
specs/{NNN}-{kebab-case-name}/
  spec.md    WHAT and WHY
  plan.md    HOW
```

Number directories sequentially. Use the next available number. Check existing
directories to determine the next number.

When a spec has multiple competing plans, use numbered variants:
`plan-01-approach-a.md`, `plan-02-approach-b.md`.

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

## Status Lifecycle

Specs track progress in `specs/STATUS`. The lifecycle is:

```
draft → review → planned → active → done
```

| Status    | Meaning                                             | Set by           |
| --------- | --------------------------------------------------- | ---------------- |
| `draft`   | Spec or plan is being written, not ready for review | `write-spec`     |
| `review`  | Spec (and plan if present) is ready for evaluation  | `write-spec`     |
| `planned` | Spec and plan approved, ready for implementation    | `write-spec`     |
| `active`  | Implementation in progress                          | `implement-spec` |
| `done`    | Implemented                                         | `implement-spec` |

A spec without a plan can be reviewed and approved. If approved but no plan
exists, the status returns to `draft` — the spec content is approved but the
deliverable is incomplete. Add a plan and set status back to `review` when
ready. Only specs with both spec and plan approved advance to `planned`.

## Reviewing a Spec

Evaluate a specification and its plan against quality criteria, then advance it
toward implementation or send it back for revision. This is the gate between
writing and implementing.

### 1. Read the spec directory

Read every file in `specs/{NNN}-*/` — `spec.md`, all `plan*.md` files, and any
supporting documents.

### 2. Evaluate the spec

Assess `spec.md` against the same qualities listed in "Writing a Spec" above:
problem is clear with evidence, scope is specific, success is verifiable, and no
implementation details have leaked in.

### 3. Evaluate the plan (if present)

Assess `plan.md` against the same qualities listed in "Writing a Plan" above:
approach is stated, changes are concrete, blast radius is visible, ordering is
explicit, and decisions are explained.

### 4. Decide

If all criteria are met, approve. If any criterion falls short, request changes.

| Situation                  | Decision | Target status |
| -------------------------- | -------- | ------------- |
| Spec + plan approved       | Approve  | `planned`     |
| Spec approved, no plan yet | Approve  | `draft`       |
| Changes requested          | Revise   | `draft`       |

### 5. Update STATUS

Update `specs/STATUS` to reflect the decision from Step 4.

If you are operating in a context where you cannot commit changes (e.g.,
evaluating a spec PR for another workflow), report your decision and target
status clearly — the caller is responsible for acting on it.

## Process

### Writing a spec

1. **Clarify first.** Ask the user questions before writing anything. Understand
   the motivation, desired scope, constraints, and what success looks like to
   them. Don't assume — a brief conversation up front prevents major rewrites
   later.
2. **Research.** Read relevant code, data files, and existing specs. Understand
   the current state before proposing changes.
3. **Write the spec.** Focus on WHAT and WHY. Do not include implementation
   details — those go in the plan.
4. **Update STATUS.** Add the spec to `specs/STATUS` with status `draft`.
5. **Present the spec.** Share it with the user for feedback. Iterate until they
   are satisfied, then set status to `review` — signalling it is ready for
   formal evaluation. Stop here unless the user also asked for a plan.

### Writing a plan

1. **Find the spec.** A plan requires an existing spec in the same directory. If
   no spec exists yet, ask the user whether to write one first.
2. **Research.** Read the spec, relevant code, data files, and existing plans.
   Understand the current state before proposing changes.
3. **Write the plan.** Translate the approved spec into concrete steps. Each
   step should be independently verifiable.
4. **Present the plan.** Share it with the user for feedback.
5. **Update STATUS.** When the user is satisfied with both spec and plan, set
   the spec's status to `review` in `specs/STATUS` — signalling it is ready for
   formal evaluation. Do not set `review` while the plan is still being iterated
   on.

## What NOT to Do

- **Do not approve without reading.** Every criterion must be checked against
  the actual content.
- When reviewing, **do not rewrite the spec or plan.** The review evaluates — it
  does not author. If changes are needed, return the status to `draft`.
