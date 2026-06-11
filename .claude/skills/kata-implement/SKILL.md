---
name: kata-implement
description: >
  Implement a spec by studying its spec.md and plan, then executing the plan
  step by step. Use when a spec and plan are approved and ready for
  implementation. Triggers: "implement spec NNN", "implement the plan for
  spec NNN", "execute plan NNN", "build spec NNN", "start implementation of
  NNN".
---

# Implement Spec

Execute an approved implementation plan from the specs/ directory. Read the spec
to understand WHAT and WHY, read the design to understand WHICH and WHERE, read
the plan to understand HOW and WHEN, then implement the changes methodically.

## When to Use

- Spec and plan are merged on `origin/main` (see READ-DO).
- The user says "implement spec NNN", "implement the plan for spec NNN",
  "execute the plan for NNN", "build spec NNN", or "start implementation of NNN"
- Resuming a partially completed implementation ("continue spec NNN", "finish
  implementing NNN")

## Checklists

Also run CONTRIBUTING.md § READ-DO before starting — universal rules apply
alongside the skill-specific ones below.

<read_do_checklist goal="Internalize scope and constraints before coding">

- [ ] Run `git fetch origin main`, then confirm `specs/NNN/plan-a.md` exists on
      `origin/main` — wait for the plan PR to merge before implementing.
- [ ] Enter a new worktree with `EnterWorktree` (e.g. name `impl/NNN`). All
      implementation work happens in the worktree — never on the main working
      tree.
- [ ] Claim before first code write — atomic `pull` → check → `claim` →
      `push` per
      [memory-protocol § Active Claims](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/memory-protocol.md#active-claims).
- [ ] Probe the remote of record: `git ls-remote origin
      "refs/heads/<branch>"`, `gh pr list --head <branch> --state all`,
      and `--search "<spec #>" --state all`
      ([§ Claim → probe → create](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/coordination-protocol.md#claim--probe--create)).
- [ ] Read the full spec and all plan files before writing any code.
- [ ] Implement plan-a unless explicitly directed to a different variant.
- [ ] Implement only what the plan describes — no unrequested refactors,
      features, or cleanup.
- [ ] Verify current codebase matches plan assumptions before each change.
- [ ] Follow the plan's execution order — dependencies exist for a reason.

</read_do_checklist>

<do_confirm_checklist goal="Confirm implementation is complete before pushing">

- [ ] `bun run check` and `bun run test` pass.
- [ ] Spec-specific verification commands from the plan pass.
- [ ] Full diff reviewed against the spec's success criteria — every criterion
      met.
- [ ] Clean sub-agent review panel of the full diff via
      [`kata-review`](../kata-review/SKILL.md) completed (fresh context, no
      prior bias, panel size per caller protocol) and every **blocker**,
      **high**, and **medium** finding addressed.

</do_confirm_checklist>

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md` then run `Bash: fit-wiki boot` (per [Memory Protocol § On-Boot Read Set](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/memory-protocol.md#on-boot-read-set)). The boot digest's `owned_priorities`, `claims`, and (when this skill reads Tier-2 surfaces) `storyboard_items` seed the rest of this skill's Process. Extract previously implemented specs
and blockers.

> **Writing under `.claude/`:** If the plan targets files there, follow
> [self-improvement.md](../../agents/references/self-improvement.md).

### Step 1: Study the spec deeply

Read every file in the spec directory — `spec.md`, all `plan-*.md` files, and
any supporting documents. Understand the **problem** (the gap and its
evidence), the **scope** (files, APIs, entities, behaviours affected; what is
out of scope), and the **success criteria** (what "done" looks like and how it
is verified). Do not start coding until you can explain the problem and its
boundaries without referring back to the spec.

### Step 2: Select and study the plan

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
  agent, or parallel engineering agents for independent parts?

**Multi-part plans.** If the plan is decomposed into parts (`plan-a.md` +
`plan-a-01.md`, `plan-a-02.md`, etc.), start by reading the overview in
`plan-a.md` for strategy, the part index, and the execution recommendation. Then
work through parts in numbered order. Each part is independently executable —
complete and verify each part before moving to the next. When the plan
recommends parallel execution for independent parts, the caller is responsible
for launching concurrent engineering agents — a single agent implements one
part at a time.

### Step 3: Research the current codebase

Before making any change, read the files that the plan targets. Verify:

- Do the files still exist at the paths the plan references?
- Does the current code match the plan's assumptions (function signatures, data
  structures, imports)?
- Have there been changes since the plan was written that affect the approach?
  On divergence, see Handling Problems.

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

1. **Make the change.** Follow the plan's concrete guidance — file paths,
   function signatures, code patterns. Adapt to current code when the plan's
   assumptions are stale.
2. **Verify immediately.** Run relevant tests, linters, or validation commands
   after each logical group of changes. Do not accumulate untested work.
3. **Commit atomically.** Before each commit, run the DO-CONFIRM checklist in
   CONTRIBUTING.md § Core Rules. Group related changes into logical commits
   following the repository's git workflow (`type(scope): subject`). Commit
   after each verified step — do not batch unrelated changes.

### Step 6: Final verification

After all tasks are complete, run the DO-CONFIRM checklist above.

### Step 7: Clean sub-agent review panel

Follow the [`kata-review` caller
protocol](../kata-review/references/caller-protocol.md). Tell each reviewer not
to invoke `kata-implement`. Address every confirmed blocker/high/medium finding
before advancing.

### Step 8: Open an implementation PR

Push all commits to the remote branch only after the panel review is clean.
Re-run the READ-DO freshness probe before `gh pr create`. The PR
title references the spec id: `feat(scope): ... (#NNN)`. After opening,
announce the PR and route on the coordinating issue per
[coordination-protocol § Claim → probe → create](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/coordination-protocol.md#claim--probe--create).

## Handling Problems

- **Plan step is unclear.** Read the spec for intent, then use your judgement.
  Note what you decided and why in the commit message.
- **Plan step conflicts with current code.** Adapt to the current state. The
  plan describes what to achieve, not exact keystrokes. Flag significant
  deviations to the user.
- **A test fails after a change.** Fix the issue before moving on. If the fix
  requires deviating from the plan, note the deviation.
- **The plan is incomplete.** Fill gaps
  using the spec's intent, codebase conventions, and CONTRIBUTING.md § Core
  Rules (Invariants and the READ-DO / DO-CONFIRM checklists). Do not ask for
  permission on routine decisions — only flag genuine ambiguity.

## Memory: what to record

Append to the current week's log (see agent profile for the file path):

- **Spec implemented** — Spec number, name, and branch
- **PR opened** — PR number and branch name
- **Blockers encountered** — Plan deviations, codebase divergences, test
  failures, and how they were resolved
- **Deferred specs** — Specs skipped and why (not ready, missing plan, etc.)
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/`
  per `references/metrics.md`. See KATA.md § Metrics for the
  recording-eligibility rule.
