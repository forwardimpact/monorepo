---
name: kata-release-merge
description: >
  Merge gate for open pull requests. Verify contributor trust, classify PR
  type, rebase branches on main, fix mechanical CI failures, gate on the
  approval state recorded in `wiki/STATUS.md`, and merge PRs that pass all
  gates. Sole external merge point.
---

# Release Merge

Verify every open non-Dependabot PR against five gates (trust, type, CI,
mechanical readiness, approval), produce a classification report, and merge
those that pass.

This skill handles **all non-Dependabot PRs** — both external contributions and
PRs from `kata-agent-team`. Contributor trust is the most critical gate; the
invariant audit (KATA.md § Invariants) confirms the trust check ran on every
advanced PR.

## When to Use

- A scheduled run finds open PRs awaiting merge
- A specific PR needs an on-demand mergeability decision
- Never for issues — issue triage is `kata-product-issue`

## Prerequisites

Comment templates and the report format are in `references/templates.md`.

## Checklists

<do_confirm_checklist goal="Verify all gates pass before merging a PR">

- [ ] Author is trusted — CI app identity or top-7 contributor lookup ran.
- [ ] PR type parsed from title prefix.
- [ ] All CI checks pass (after mechanical fixes if needed).
- [ ] `wiki/STATUS.md` row for the spec id shows the matching phase at
      `approved` (or `implemented` for the terminal plan row).
- [ ] For implementation PRs: parent spec's `plan-a.md` exists on `main`.

</do_confirm_checklist>

A PR that fails any gate is marked **blocked** with the reason. A PR that passes
all gates is merged in Step 8.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md` then run `Bash: fit-wiki boot` (per [Memory Protocol § On-Boot Read Set](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/memory-protocol.md#on-boot-read-set)). The boot digest's `owned_priorities`, `claims`, and (when this skill reads Tier-2 surfaces) `storyboard_items` seed the rest of this skill's Process. Extract PRs blocked in previous runs with
consecutive-block counts.

### Step 1: List Open PRs

```sh
gh pr list --state open --base main \
  --json number,title,headRefName,author,updatedAt,mergeable,mergeStateStatus,labels,reviews
```

Skip PRs authored by `app/dependabot` — handled by `kata-security-update`.

### Step 2: Verify Contributor Trust

```sh
gh pr view <number> --json author --jq '.author.login'
```

If `app/kata-agent-team`, the PR is **trusted by definition**. Otherwise, look
up the top 7 human contributors:

```sh
gh api repos/{owner}/{repo}/contributors \
  --jq '[.[] | select(.type == "User")] | .[0:7] | .[].login'
```

The PR author must appear in this list. If not, mark **blocked** (the invariant
audit — KATA.md § Invariants — checks this lookup happened on every classified
PR).

### Step 3: Classify PR Type

Parse the title using `type(scope): subject`. Each type maps to a phase:

- `spec` → spec phase, gate STATUS row `{NNN}\tspec\tapproved`
- `design` → design phase, gate STATUS row `{NNN}\tdesign\tapproved`
- `plan` → plan phase, gate STATUS row `{NNN}\tplan\tapproved`
- `feat`, `fix`, `bug`, `refactor`, `chore` → implementation phase
- `docs` → docs fast-path (Step 6, capped to `.md`/`.mdx` files)
- `!` breaking variants retain the base type
- Any other type → mark **blocked**

### Step 4: Assess Merge State

```sh
gh pr view <number> --json mergeable,mergeStateStatus
gh pr checks <number>
```

Clean (mergeable, CI green, up-to-date) → continue to Step 6. Behind, stale, or
conflicting → rebase (Step 5). CI failing → fix (Step 5) or block.

### Step 5: Rebase + Mechanical Fixes

```sh
git fetch origin main && git fetch origin <pr-branch>
git checkout <pr-branch> && git rebase origin/main
```

**Mechanical conflicts only** (lock file, generated files, formatting):

```sh
# Lock file: git checkout --theirs package-lock.json && bun install
# Generated:  bunx fit-codegen --all
# Formatting: bun run format:fix
git add <files> && git rebase --continue
```

**Substantive conflicts** (overlapping logic, renamed symbols,
deleted-vs-modified) — `git rebase --abort` and comment listing conflicting
files for the author.

After rebase, run `bun run check:fix` then `bun run check`. If checks still
fail, mark **blocked** with the failures and skip to Step 9.

```sh
git push --force-with-lease origin <pr-branch>
```

### Step 6: Approval Gate

**Docs fast-path**: A `docs`-typed PR whose changed files are all `.md` or
`.mdx` (`gh pr view <n> --json files`) passes on trust (Step 2) alone — skip
the STATUS check below. Any non-doc file falls through to the standard check.

Read `wiki/STATUS.md` for the PR's spec id (`grep -P "^${spec_id}\t"`). The
PR passes when the row shows the PR's classified phase at `approved` (or
`implemented` for the terminal plan row on implementation PRs). If absent
or `draft`/`cancelled`, mark **blocked** with reason `awaiting approval
signal`. Labels and APPROVED reviews are inputs to STATUS captured by
`kata-dispatch`; not consulted directly here. See
[`approval-signals.md`](../../agents/references/approval-signals.md).

### Step 7: Implementation PR Spec Check

For implementation PRs (`feat`/`fix`/`bug`/`refactor`/`chore`) referencing a
spec id (e.g. `feat(...): … (#NNN)` or "implements spec NNN"):

- Confirm `specs/NNN/plan-a.md` exists on `main`. If absent, mark **blocked**
  with reason `parent spec plan not on main`.
- Update `wiki/STATUS.md` before merging — set the spec's row to
  `{NNN}\tplan\timplemented`. Commit the wiki change; the Stop hook pushes it.

PRs not referencing a spec (one-off mechanical fixes, doc patches) skip this
step.

### Step 8: Merge Mergeable PRs

1. Post the merge comment from `references/templates.md` § Merge Comment.
2. `gh pr merge <number> --merge --delete-branch`
3. Verify state is `MERGED`. On race or branch-protection failure, record and
   move on — do **not** retry without re-running Steps 1–7.

### Step 9: Produce the Classification Report

Per PR record: number, title, type, author, trust check, CI, approval source
(label / review / blocked), final verdict.

## Memory: what to record

Append to the current week's log:

- **PR classification table** — type, author, trust, CI, STATUS row,
  verdict, consecutive-block count
- **Contributor trust decisions** — checked by the invariant audit (KATA.md
  § Invariants)
- **STATUS rows consumed and written** — gate reads and `plan implemented`
  writes
- **PRs merged this run** and **merge failures** with reasons
- **Metrics** — Append `prs_merged` and `approvals_recorded_per_run` rows per
  `references/metrics.md` (collection recipe included). See KATA.md § Metrics
  for the recording-eligibility rule.

## Coordination Channels

Outputs (per
[coordination-protocol.md](../../agents/references/coordination-protocol.md)):
**PR comment** for trust-check rationale, gate-failure explanations, merge
decisions; **PR thread escalation** for cross-agent expertise requests addressed
by name. Ambiguous inbound comments → follow
[coordination-protocol.md § Inbound: unclear addressed comments](../../agents/references/coordination-protocol.md#inbound-unclear-addressed-comments).
