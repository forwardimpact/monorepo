---
name: gemba-implement
description: >
  Implement a spec by studying its spec.md and plan, then executing the plan
  step by step. Use when a spec and plan are approved and ready for
  implementation. Triggers: "implement spec NNN", "implement the plan for
  spec NNN", "execute plan NNN", "build spec NNN", "start implementation of
  NNN".
---

# Implement Spec

Execute an approved implementation plan from the specs/ directory. Read the spec
to understand WHAT and WHY, read the plan to understand HOW, then implement the
changes methodically.

## When to Use

- A spec and plan exist with STATUS `planned` (has passed review)
- The user says "implement spec NNN", "implement the plan for spec NNN",
  "execute the plan for NNN", "build spec NNN", or "start implementation of NNN"
- Resuming a partially completed implementation ("continue spec NNN", "finish
  implementing NNN")

## Checklists

Also run the CONTRIBUTING.md § READ-DO before starting — those universal rules
apply alongside the skill-specific ones below.

<read_do_checklist goal="Internalize scope and constraints before coding">

- [ ] Read the full spec and all plan files before writing any code.
- [ ] Implement plan-a unless explicitly directed to a different variant.
- [ ] Implement only what the plan describes — no unrequested refactors,
      features, or cleanup.
- [ ] Verify current codebase matches plan assumptions before each change.
- [ ] Follow the plan's execution order — dependencies exist for a reason.

</read_do_checklist>

<do_confirm_checklist goal="Confirm implementation is complete before pushing">

- [ ] `bun run check` passes (format and lint).
- [ ] `bun run test` passes (unit tests).
- [ ] Spec-specific verification commands from the plan pass.
- [ ] Full diff reviewed against the spec's success criteria — every criterion
      met.
- [ ] Clean sub-agent review of the full diff via
      [`gemba-review`](../gemba-review/SKILL.md) completed (fresh context, no
      prior bias) and every **blocker**, **high**, and **medium** finding
      addressed.
- [ ] Spec status set to `done` in `specs/STATUS`.

</do_confirm_checklist>

## Process

### Step 0: Read Memory

Read memory per the agent profile (your summary, the current week's log, and
teammates' summaries). Extract specs previously implemented and any blockers
from prior `staff-engineer` entries.

### 1. Study the spec deeply

Read every file in the spec directory — `spec.md`, all `plan-*.md` files, and
any supporting documents. Understand:

- **The problem.** What pain or gap does this address? What evidence supports
  it?
- **The scope.** Which files, APIs, entities, or behaviours are affected? What
  is explicitly out of scope?
- **Success criteria.** What does "done" look like? What can be tested or
  verified?

Do not start coding until you can explain the problem and its boundaries without
referring back to the spec.

### 2. Select and study the plan

**Default rule: implement plan-a.** When multiple plan variants exist
(`plan-a.md`, `plan-b.md`, etc.), implement `plan-a.md` unless the user or the
plan review explicitly selects a different variant.

Read the selected plan thoroughly. Understand:

- **Overall strategy.** What is the approach and why was it chosen?
- **Every concrete change.** File paths, functions, before/after code, new
  files.
- **Blast radius.** What is created, modified, and deleted?
- **Ordering and dependencies.** Which changes must happen first? What blocks
  what?
- **Design decisions.** Why were non-obvious choices made?
- **Execution recommendation.** How does the plan recommend executing — single
  agent, or parallel `staff-engineer` agents for independent parts?

**Multi-part plans.** If the plan is decomposed into parts (`plan-a.md` +
`plan-a-01.md`, `plan-a-02.md`, etc.), start by reading the overview in
`plan-a.md` for strategy, the part index, and the execution recommendation. Then
work through parts in numbered order. Each part is independently executable —
complete and verify each part before moving to the next. When the plan
recommends parallel execution for independent parts, the caller is responsible
for launching concurrent `staff-engineer` agents — a single agent implements one
part at a time.

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

For multi-part plans, organize tasks by part — complete all tasks for part 01
before starting part 02, unless the plan explicitly allows parallel execution.

### 5. Update STATUS

Set the spec's status to `active` in `specs/STATUS` before starting work.

### 6. Implement step by step

For each task:

1. **Make the change.** Follow the plan's concrete guidance — file paths,
   function signatures, code patterns. Adapt to current code when the plan's
   assumptions are stale.
2. **Verify immediately.** Run relevant tests, linters, or validation commands
   after each logical group of changes. Do not accumulate untested work.
3. **Commit atomically.** Before each commit, run the DO-CONFIRM checklist in
   CONTRIBUTING.md § Core Rules. Group related changes into logical commits
   following the repository's git workflow (`type(scope): subject`). Commit
   after each verified step — do not batch unrelated changes.

### 7. Final verification

After all tasks are complete, run the DO-CONFIRM checklist above.

### 8. Clean sub-agent review

Follow the
[`gemba-review` caller protocol](../gemba-review/references/caller-protocol.md)
to launch a fresh sub-agent that grades the full diff
(`git diff origin/main...HEAD`). Provide spec path, plan path, and branch name
so the reviewer can act independently. Tell the reviewer not to invoke
`gemba-implement`. Verify findings, address all confirmed blocker/high/medium
issues before pushing.

Push all commits to the remote branch only after the review is clean.

## Handling Problems

- **Plan step is unclear.** Read the spec for intent, then use your judgement.
  Note what you decided and why in the commit message.
- **Plan step conflicts with current code.** Adapt to the current state. The
  plan describes what to achieve, not exact keystrokes. Flag significant
  deviations to the user.
- **A test fails after a change.** Fix the issue before moving on. If the fix
  requires deviating from the plan, note the deviation.
- **The plan is incomplete.** Some plans don't cover every detail. Fill gaps
  using the spec's intent, codebase conventions, and CONTRIBUTING.md § Core
  Rules (Invariants and the READ-DO / DO-CONFIRM checklists). Do not ask for
  permission on routine decisions — only flag genuine ambiguity.

## Memory: what to record

Append to the current week's log (see agent profile for the file path):

- **Spec implemented** — Spec number, name, and status transition (planned →
  active → done)
- **PR opened** — PR number and branch name
- **Blockers encountered** — Plan deviations, codebase divergences, test
  failures, and how they were resolved
- **Deferred specs** — Specs skipped and why (not ready, missing plan, etc.)

## What NOT to Do

The READ-DO checklist covers the core boundaries (read before coding, plan-only
scope, execution order, default to plan-a). Additionally:

- **Do not batch all changes into one commit.** Atomic commits make review,
  bisection, and rollback possible.
