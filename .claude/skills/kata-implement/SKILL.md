---
name: kata-implement
description: >
  Implement a spec. Study its spec.md and plan, then execute the plan step by
  step. Use when a spec and plan are approved and ready for implementation.
  Triggers: "implement spec NNN", "implement the plan for spec NNN", "execute
  plan NNN", "build spec NNN", "start implementation of NNN".
---

# Implement Spec

Execute an approved implementation plan from the specs/ directory. Read the spec
to understand WHAT and WHY. Read the design to understand WHICH and WHERE. Read
the plan to understand HOW and WHEN. Then implement the changes methodically.

## When to Use

- Spec and plan are merged on `origin/main` (see READ-DO).
- The user says "implement spec NNN", "implement the plan for spec NNN",
  "execute the plan for NNN", "build spec NNN", or "start implementation of NNN"
- You resume a partially completed implementation ("continue spec NNN", "finish
  implementing NNN")

## Checklists

Also run CONTRIBUTING.md § READ-DO before you start. The universal rules apply
alongside the skill-specific rules below.

<read_do_checklist goal="Internalize scope and constraints before coding">

- [ ] Run `git fetch origin main`. Confirm `specs/NNN/plan-a.md` exists on
      `origin/main`. Wait for the plan PR to merge before you implement.
- [ ] Enter a new worktree with `EnterWorktree` (e.g. name `impl/NNN`). All
      implementation work happens in the worktree. Never work on the main
      working tree.
- [ ] Claim before the first code write. Run the atomic `pull` → check →
      `claim` → `push` per
      [memory-protocol § Active Claims](../../agents/x-memory-protocol.md#active-claims).
- [ ] Probe the remote of record: `git ls-remote origin "refs/heads/<branch>"`
      and `list` changes by head branch and by spec number, any state
      ([work-trackers.md](../../agents/x-work-trackers.md);
      [§ Claim → probe → create](../../agents/x-coordination-protocol.md#claim--probe--create)).
- [ ] Read the full spec and all plan files before you write any code.
- [ ] Implement plan-a unless someone directs you to a different variant.
- [ ] Implement only what the plan describes. Add no unrequested refactors,
      features, or cleanup.
- [ ] Verify the current codebase matches the plan's assumptions before each
      change.
- [ ] Follow the plan's execution order. Dependencies exist for a reason.

</read_do_checklist>

<do_confirm_checklist goal="Confirm implementation is complete before pushing">

- [ ] The repository's check and test commands pass.
- [ ] Spec-specific verification commands from the plan pass.
- [ ] Review the full diff against the spec's success criteria. Confirm every
      criterion is met.
- [ ] Complete a clean sub-agent review panel of the full diff through
      [`kata-review`](../kata-review/SKILL.md) (fresh context, no prior bias,
      panel size per caller protocol). Address every **blocker**, **high**,
      and **medium** finding.

</do_confirm_checklist>

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`. Then run `gemba-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
The digest's `owned_priorities`, `claims`, and `storyboard_items` seed this
Process. Extract previously implemented specs and blockers.

> **Writing under `.claude/`:** If the plan targets files there, follow
> [self-improvement.md](../../agents/x-self-improvement.md).

### Step 1: Study the spec deeply

Read every file in the spec directory: `spec.md`, all `plan-*.md` files, and
any document that supports them. Understand the **problem**, which is the gap
and its evidence. Understand the **scope**: the files, APIs, entities, and
behaviours affected, and what is out of scope. Understand the
**success criteria**: what "done" looks like and how you verify it. Do not
start to code until you can explain the problem and its boundaries from memory.

### Step 2: Select and study the plan

**Default rule: implement plan-a.** When multiple plan variants exist
(`plan-a.md`, `plan-b.md`, etc.), implement `plan-a.md` unless the user or the
plan review explicitly selects a different variant.

Read the selected plan thoroughly. Understand:

- **Overall strategy.** Identify the approach and the reason for it.
- **Every concrete change.** File paths, functions, before/after code, new
  files.
- **Blast radius.** Identify what the plan creates, modifies, and deletes.
- **Ordering and dependencies.** Identify which changes must happen first.
  Identify what blocks what.
- **Design decisions.** Identify the reason for each non-obvious choice.
- **Execution recommendation.** Read how the plan recommends execution: a
  single agent, or parallel engineering agents for independent parts.

**Multi-part plans.** If the plan splits into parts (`plan-a.md` +
`plan-a-01.md`, `plan-a-02.md`, etc.), first read the overview in `plan-a.md`.
It holds the strategy, the part index, and the execution recommendation. Then
work through the parts in numbered order. Each part is independently
executable. Complete and verify each part before you move to the next. When the
plan recommends parallel execution for independent parts, the caller must
launch the concurrent engineering agents. A single agent implements one part at
a time.

### Step 3: Research the current codebase

Before you make any change, read the files that the plan targets. Verify:

- The files still exist at the paths the plan references.
- The current code matches the plan's assumptions (function signatures, data
  structures, imports).
- No change since the plan was written affects the approach. On divergence, see
  Handling Problems.

### Step 4: Build a task list

Break the plan into ordered, atomic tasks. Each task should:

- Map to a specific change from the plan
- Be independently verifiable
- Respect the plan's stated ordering and dependencies

Use TodoWrite to track progress. Group related changes that must land together
(e.g., schema + data + code for the same feature). For multi-part plans,
organize tasks by part, ordered as Step 2 describes.

### Step 5: Implement step by step

For each task:

1. **Make the change.** Follow the plan's concrete guidance: file paths,
   function signatures, and code patterns. Adapt to the current code when the
   plan's assumptions are stale.
2. **Verify immediately.** Run relevant tests, linters, or validation commands
   after each logical group of changes. Do not accumulate untested work.
3. **Commit atomically.** Before each commit, run the DO-CONFIRM checklist in
   CONTRIBUTING.md § Core Rules. Group related changes into logical commits that
   follow the repository's git workflow (`type(scope): subject`). Commit after
   each verified step. Do not batch unrelated changes.

### Step 6: Final verification

After all tasks are complete, run the DO-CONFIRM checklist above.

### Step 7: Clean sub-agent review panel

Follow the [`kata-review` caller
protocol](../kata-review/references/caller-protocol.md). Tell each reviewer not
to invoke `kata-implement`. Address every confirmed blocker/high/medium finding
before you advance.

### Step 8: Open an implementation PR

Push commits only after the panel is clean. Re-run the READ-DO freshness probe
before the `open-change`. Title the PR with the spec id:
`feat(scope): ... (#NNN)`. After you open it, announce and route on the
coordinating issue per
[coordination-protocol § Claim → probe → create](../../agents/x-coordination-protocol.md#claim--probe--create).
Hold the PR body to [Citation integrity](../../agents/x-citation-integrity.md).

## Handling Problems

- **Plan step is unclear.** Read the spec for intent. Then use your judgment.
  Note what you decided and why in the commit message.
- **Plan step conflicts with current code.** Adapt to the current state. The
  plan describes what to achieve. It does not describe exact keystrokes. Flag
  significant deviations to the user.
- **A test fails after a change.** Fix the issue before you move on. If the fix
  must deviate from the plan, note the deviation.
- **The plan is incomplete.** Fill gaps with the spec's intent, the codebase
  conventions, and CONTRIBUTING.md § Core Rules (Invariants and the READ-DO /
  DO-CONFIRM checklists). Do not ask for permission on routine decisions. Flag
  genuine ambiguity only.

## Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **Spec implemented** — Spec number, name, and branch
- **PR opened** — PR number and branch name
- **Blockers encountered** — Plan deviations, divergences, test failures, and
  fixes
- **Deferred specs** — Specs skipped and why
- **Metrics** — One row per run to `wiki/metrics/{skill}/` per
  `references/metrics.md` (eligibility in KATA.md § Metrics). The metric is
  route-bearing. Record the route taken and the routes eligible per
  [`references/route-decision.md`](references/route-decision.md).
