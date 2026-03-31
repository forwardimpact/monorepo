---
name: implement-spec
description: >
  Implement a spec by studying its spec.md and plan.md, then executing the plan
  step by step. Use when a spec and plan are approved and ready for
  implementation.
---

# Implement Spec

Execute an approved implementation plan from the specs/ directory. Read the spec
to understand WHAT and WHY, read the plan to understand HOW, then implement the
changes methodically.

## When to Use

- A spec and plan exist with STATUS `planned` (has passed review)
- The user says "implement spec NNN" or "execute the plan for NNN"
- Resuming a partially completed implementation

## Process

### 1. Study the spec deeply

Read every file in the spec directory — `spec.md`, all `plan*.md` files, and any
supporting documents. Understand:

- **The problem.** What pain or gap does this address? What evidence supports
  it?
- **The scope.** Which files, APIs, entities, or behaviours are affected? What
  is explicitly out of scope?
- **Success criteria.** What does "done" look like? What can be tested or
  verified?

Do not start coding until you can explain the problem and its boundaries without
referring back to the spec.

### 2. Study the plan deeply

Read the plan (or the selected plan variant if multiple exist). Understand:

- **Overall strategy.** What is the approach and why was it chosen?
- **Every concrete change.** File paths, functions, before/after code, new
  files.
- **Blast radius.** What is created, modified, and deleted?
- **Ordering and dependencies.** Which changes must happen first? What blocks
  what?
- **Design decisions.** Why were non-obvious choices made?

If multiple plan variants exist, ask the user which one to implement.

### 3. Research the current codebase

Before making any change, read the files that the plan targets. Verify:

- Do the files still exist at the paths the plan references?
- Does the current code match the plan's assumptions (function signatures, data
  structures, imports)?
- Have there been changes since the plan was written that affect the approach?

If the codebase has diverged from the plan's assumptions, flag the discrepancies
to the user before proceeding. Adapt the implementation to the current state —
the plan describes intent, not a script to replay blindly.

### 4. Build a task list

Break the plan into ordered, atomic tasks. Each task should:

- Map to a specific change from the plan
- Be independently verifiable
- Respect the plan's stated ordering and dependencies

Use TodoWrite to track progress. Group related changes that must land together
(e.g., schema + data + code for the same feature).

### 5. Update STATUS

Set the spec's status to `active` in `specs/STATUS` before starting work.

### 6. Implement step by step

For each task:

1. **Make the change.** Follow the plan's concrete guidance — file paths,
   function signatures, code patterns. Adapt to current code when the plan's
   assumptions are stale.
2. **Verify immediately.** Run relevant tests, linters, or validation commands
   after each logical group of changes. Do not accumulate untested work.
3. **Commit atomically.** Group related changes into logical commits following
   the repository's git workflow (`type(scope): subject`). Commit after each
   verified step — do not batch unrelated changes.

### 7. Final verification

After all tasks are complete:

1. Run `bun run check` to verify formatting, lint, tests, and validation pass.
2. Run any spec-specific verification commands mentioned in the plan.
3. Review the full diff (`git diff` from the starting point) against the spec's
   success criteria. Confirm every criterion is met.
4. **Update STATUS.** Set the spec's status to `done` in `specs/STATUS`.
5. Push all commits to the remote branch.

## Handling Problems

- **Plan step is unclear.** Read the spec for intent, then use your judgement.
  Note what you decided and why in the commit message.
- **Plan step conflicts with current code.** Adapt to the current state. The
  plan describes what to achieve, not exact keystrokes. Flag significant
  deviations to the user.
- **A test fails after a change.** Fix the issue before moving on. If the fix
  requires deviating from the plan, note the deviation.
- **The plan is incomplete.** Some plans don't cover every detail. Fill gaps
  using the spec's intent, codebase conventions, and CLAUDE.md rules. Do not ask
  for permission on routine decisions — only flag genuine ambiguity.

## What NOT to Do

- **Do not skip the study phase.** Jumping to code without understanding the
  spec leads to rework. Read everything first.
- **Do not improve beyond the plan.** Implement what the plan describes. Do not
  refactor adjacent code, add features the spec didn't request, or "clean up"
  files you happen to touch. Scope discipline prevents scope creep.
- **Do not ignore ordering.** The plan's execution order exists for a reason.
  Follow it unless you have a concrete reason not to (and note why).
- **Do not batch all changes into one commit.** Atomic commits make review,
  bisection, and rollback possible.
