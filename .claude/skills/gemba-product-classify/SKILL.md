---
name: gemba-product-classify
description: >
  Classify open pull requests for mergeability — verify contributor trust,
  parse PR type, check CI status, review spec quality on spec PRs, and merge
  PRs that pass all gates. Use when the user says "review open PRs", "which
  PRs are ready to merge", "triage pull requests", "classify PRs", or "check
  PR mergeability".
---

# Product PR Classification

Triage all open pull requests, verify contributor trust, run the gate checks,
produce a report stating which PRs are ready to merge, and merge those that pass
all gates.

This skill handles **all non-Dependabot PRs** — both external contributions and
PRs created by our own CI app (`forward-impact-ci`). Because external
contributions merge here, contributor trust verification is the most critical
gate. The improvement coach audits classification traces via the
[`gemba-walk`](../gemba-walk/SKILL.md) skill's invariant audit to confirm trust
checks happened on every PR that advanced to merge.

## When to Use

- Reviewing open PRs for product alignment on a schedule
- On-demand when specific PRs need a mergeability decision
- Before any merge is performed

## Prerequisites

See [`gemba-gh-cli`](../gemba-gh-cli/SKILL.md) for `gh` installation and the
canonical query shapes used in the steps below — in particular the contributor
trust lookup, which the `gemba-walk` invariant audit verifies against.

All comment templates and the report format are in `references/templates.md`.

## Gate Checklist

<do_confirm_checklist>

- [ ] **Author is trusted** — CI app or top-20 lookup (Step 2). On failure, mark
      **blocked** and comment that only trusted authors merge.
- [ ] **PR type is `fix`, `bug`, or `spec`** — parse title prefix (Step 3). On
      failure, mark **blocked** and comment that the PR type is outside scope.
- [ ] **All CI checks pass** — `gh pr checks` (Step 4). On failure, mark
      **blocked** and comment with the failing checks.
- [ ] **Spec quality approved** (spec PRs only) — apply `gemba-spec` review
      (Step 5). On failure, mark **blocked** and comment with review findings.

</do_confirm_checklist>

A PR that passes all four gates is merged in Step 7.

## Process

### Step 0: Read Memory

Read memory per the agent profile (your summary, the current week's log, and
teammates' summaries). From prior `product-manager` entries, extract PRs blocked
in previous runs with consecutive-block counts and contributor trust decisions
carried forward.

### Step 1: List Open PRs

```sh
gh pr list --state open --base main \
  --json number,title,headRefName,author,updatedAt,mergeable,mergeStateStatus,labels
```

Skip PRs authored by `app/dependabot` — handled by `gemba-security-update`.

### Step 2: Verify Contributor Trust

Check whether the author is the CI app:

```sh
gh pr view <number> --json author --jq '.author.login'
```

If `app/forward-impact-ci`, the PR is **trusted by definition** — skip the
contributor lookup and proceed to Step 3.

For all other authors, look up the top 20 human contributors (canonical shape:
[`gemba-gh-cli` § Contributor trust lookup](../gemba-gh-cli/SKILL.md#contributor-trust-lookup-top-20-gate)):

```sh
gh api repos/{owner}/{repo}/contributors \
  --jq '[.[] | select(.type == "User")] | .[0:20] | .[].login'
```

The PR author must appear in this list. If not, mark **blocked** and record the
decision (the `gemba-walk` invariant audit checks that this lookup happened on
every classified PR).

### Step 3: Classify PR Type

Parse the title using `type(scope): subject` convention:

- `fix` or `bug` → eligible (bug treated as equivalent to fix)
- `spec` → eligible (after spec review in Step 5)
- Breaking variants with `!` retain the base type
- Any other type (`feat`, `refactor`, `chore`, etc.) → mark **blocked**

### Step 4: Check CI Status

```sh
gh pr checks <number>
```

All checks must pass. If failing, identify specific failures:

```sh
gh pr checks <number> --json name,state,conclusion \
  --jq '.[] | select(.conclusion != "SUCCESS" and .conclusion != "") | {name, conclusion}'
```

Mark **blocked** with the specific failing checks.

### Step 5: Review Spec PRs

For `spec` PRs, apply the `gemba-spec` skill's review process:

1. Identify the spec directory from changed files:
   ```sh
   gh pr view <number> --json files --jq '.files[].path' | grep '^specs/'
   ```
2. Check out the spec files:
   ```sh
   git fetch origin <headRefName>
   git checkout origin/<headRefName> -- specs/<matched-directory>/
   ```
3. Evaluate against spec review criteria. Report decision and target status — do
   not update `specs/STATUS` directly.
4. If spec fails review, mark **blocked** with findings.
5. If spec passes, mark **mergeable**.

### Step 6: Produce the Classification Report

For each PR, record: number, title, type, author, trust check result, CI status,
spec review (if applicable), and final verdict — **mergeable** or **blocked**
with reason. The report drives Step 7.

### Step 7: Merge Mergeable PRs

For each PR marked **mergeable** in the report:

1. Post the merge comment from `references/templates.md` § Merge Comment.
2. Perform the merge:
   ```sh
   gh pr merge <number> --merge --delete-branch
   ```
3. Verify the new state:
   ```sh
   gh pr view <number> --json state --jq '.state'
   ```
   Confirm the state is `MERGED`.
4. If the merge fails (race condition, branch protection update, etc.), record
   the failure in the run report and move on — do **not** retry without
   re-running Steps 1–6, since the gate state may have changed.

## Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **PR classification table** — Each PR with type, author, trust check, CI,
  verdict, and consecutive-block count
- **Contributor trust decisions** — Who was verified and the result (this is the
  data the `gemba-walk` invariant audit checks)
- **Spec review results** — Spec PRs and their assessment
- **PRs merged this run** — number, title, and final state
- **Merge failures** — number and the reason (so the next run can revisit)
