---
name: kata-release-merge
description: >
  Merge gate for open pull requests. Verify contributor trust, classify PR
  type, rebase branches on main, fix mechanical CI failures, gate on the
  generalized approval signal (`<phase>:approved` label or APPROVED review),
  and merge PRs that pass all gates. Sole external merge point.
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
- [ ] Approval signal present: `<phase>:approved` label OR APPROVED review by a
      trusted account.
- [ ] For implementation PRs: parent spec's `plan-a.md` exists on `main`.

</do_confirm_checklist>

A PR that fails any gate is marked **blocked** with the reason. A PR that passes
all gates is merged in Step 8.

## Process

### Step 0: Read Memory

Read memory per the agent profile. Extract PRs blocked in previous runs with
consecutive-block counts.

Capture this run's start timestamp once at the top of the run:
`current_run_start=$(date -u +%FT%TZ)`. For the approval-throughput metric
(Step 8.5), also derive the previous run's start:

```sh
prev_run_start=$(gh run list --workflow=agent-team.yml --status=completed \
  --limit 2 --json startedAt --jq '.[1].startedAt // empty')
# First-ever recording falls back to current_run_start - 8h
# (median schedule gap of the 03:00/12:00/20:00 UTC cadence).
[ -z "$prev_run_start" ] && prev_run_start=$(date -u -d "$current_run_start - 8 hours" +%FT%TZ)
```

The window for approval-throughput counting is `[prev_run_start, current_run_start)`.

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

- `spec` → spec phase, gate label `spec:approved`
- `design` → design phase, gate label `design:approved`
- `plan` → plan phase, gate label `plan:approved`
- `feat`, `fix`, `bug`, `refactor`, `chore` → implementation phase
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

A PR passes when **at least one** holds:

1. The PR carries the matching phase label (`spec:approved` / `design:approved`
   / `plan:approved`).
2. The PR has at least one APPROVED review by a trusted account (top-7
   contributor or `kata-agent-team`):
   ```sh
   gh pr view <number> --json reviews \
     --jq '[.reviews[] | select(.state == "APPROVED")] | length'
   ```

If neither holds, mark **blocked** with reason `awaiting approval signal`.

### Step 7: Implementation PR Spec Check

For implementation PRs (`feat`/`fix`/`bug`/`refactor`/`chore`) referencing a
spec id (e.g. `feat(...): … (#NNN)` or "implements spec NNN"):

- Confirm `specs/NNN/plan-a.md` exists on `main`. If absent, mark **blocked**
  with reason `parent spec plan not on main`.
- Apply the terminal label before merging:
  ```sh
  gh pr edit <number> --add-label plan:implemented
  ```

PRs not referencing a spec (one-off mechanical fixes, doc patches) skip this
step.

### Step 8: Merge Mergeable PRs

1. Post the merge comment from `references/templates.md` § Merge Comment.
2. `gh pr merge <number> --merge --delete-branch`
3. Verify state is `MERGED`. On race or branch-protection failure, record and
   move on — do **not** retry without re-running Steps 1–7.

### Step 8.5: Collect approval-throughput count

Cohort: every PR seen in Step 1 (open phase PRs) plus every phase PR
merged this run (Step 8) — covers every phase PR with window-relevant
activity. For each cohort PR, fetch label-add events:

```sh
gh api repos/{owner}/{repo}/issues/<number>/timeline --paginate \
  --jq '.[] | select(.event=="labeled" and (.label.name|test("^(spec|design|plan):approved$"))) | {ts: .created_at, kind: "label", label: .label.name}'
```

And APPROVED reviews:

```sh
gh api repos/{owner}/{repo}/pulls/<number>/reviews --paginate \
  --jq '.[] | select(.state=="APPROVED") | {ts: .submitted_at, kind: "review"}'
```

Filter events to `ts ∈ [prev_run_start, current_run_start)` (half-open;
matches design-b § Approval-throughput metric). Sum the filtered events
to `approvals_recorded_per_run` — no per-event de-dup; the design
specifies a raw count. The Memory section appends one row per metric to
`wiki/metrics/kata-release-merge/{YYYY}.csv`; the row shape mirrors the
existing `prs_merged` rows with `metric=approvals_recorded_per_run`,
`unit=count`, and `note="window=[<prev>,<curr>)"`. Zero is recorded as `0`.

If any per-PR call fails (rate limit, scope), skip that PR, append
`;api_errors=N` to the row's `note` field, and proceed. A blanket-failure
case (every call errored) records `0` with a non-empty `api_errors=` so
the next storyboard meeting can see producer health.

### Step 9: Produce the Classification Report

Per PR record: number, title, type, author, trust check, CI, approval source
(label / review / blocked), final verdict.

## Memory: what to record

Append to the current week's log:

- **PR classification table** — type, author, trust, CI, approval source,
  verdict, consecutive-block count
- **Contributor trust decisions** — checked by the invariant audit (KATA.md
  § Invariants)
- **Approval signals consumed** — label vs APPROVED review
- **PRs merged this run** and **merge failures** with reasons
- **Metrics** — Append one row per metric per run to `wiki/metrics/{skill}/`
  per `references/metrics.md`. See KATA.md § Metrics for the
  recording-eligibility rule.

## Coordination Channels

Outputs (per
[coordination-protocol.md](../../agents/references/coordination-protocol.md)):
**PR comment** for trust-check rationale, gate-failure explanations, merge
decisions; **PR thread escalation** for cross-agent expertise requests addressed
by name. Ambiguous inbound comments → follow
[coordination-protocol.md § Inbound: unclear addressed comments](../../agents/references/coordination-protocol.md#inbound-unclear-addressed-comments).
