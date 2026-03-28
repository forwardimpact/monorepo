---
name: write-spec
description: >
  Write spec.md (WHAT and WHY) and plan.md (HOW) documents in the specs/
  directory. Use when starting a new feature, proposing a change, or
  documenting an implementation approach.
---

# Write Spec and Plan

Create specification and implementation plan documents for features, changes,
and improvements. A spec defines WHAT to build and WHY. A plan defines HOW to
build it.

**Spec and plan are independent deliverables.** Only produce what the user asked
for. If they ask for a spec, write the spec and stop — do not continue to a
plan. If they ask for a plan (and a spec already exists), write the plan only.
Write both only when explicitly requested.

## When to Use

- Starting a new feature or significant change
- Documenting a proposed improvement with rationale
- Writing an implementation plan for an approved spec
- Reviewing or refining an existing spec or plan

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
4. **Review the spec.** Present it to the user for feedback. Stop here unless
   the user also asked for a plan.

### Writing a plan

1. **Find the spec.** A plan requires an existing spec in the same directory. If
   no spec exists yet, ask the user whether to write one first.
2. **Research.** Read the spec, relevant code, data files, and existing plans.
   Understand the current state before proposing changes.
3. **Write the plan.** Translate the approved spec into concrete steps. Each
   step should be independently verifiable.
4. **Review the plan.** Present it to the user for approval before implementing.
