---
name: product-backlog
description: >
  Triage open pull requests for product alignment. Verify contributor trust
  (CI app identity or top-contributor lookup), check CI status, classify PR
  types, and merge fix, bug, and spec PRs that pass all gates.
---

# Product Backlog Triage

Triage all open pull requests for product alignment, verify contributor trust,
and merge PRs that pass all quality and security gates. The `bug` type is
treated as equivalent to `fix` — both represent corrections.

This workflow handles **all non-Dependabot PRs** — both external contributions
and PRs created by our own CI app (`forward-impact-ci`). For external
contributions it is the sole merge point, making contributor trust verification
the most critical gate. The improvement coach audits product-backlog traces to
confirm trust checks happened on every merged PR.

## When to Use

- Reviewing and actioning open PRs for product alignment
- Scheduled daily to keep the backlog moving
- On-demand when specific PRs need product review

## Prerequisites

The `gh` CLI must be installed and authenticated. Verify with `gh auth status`.

All comment templates and the report format are in `references/templates.md`.

## Gate Checklist

| #   | Gate                                  | Verification                     | On failure                                                           |
| --- | ------------------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| 1   | Author is trusted                     | CI app or top-20 lookup (Step 2) | **Skip** — comment that only trusted authors' PRs are auto-merged    |
| 2   | PR type is `fix`, `bug`, or `spec`    | Parse title prefix (Step 3)      | **Skip** — comment that the PR type is outside product-manager scope |
| 3   | All CI checks pass                    | `gh pr checks` (Step 4)          | **Skip** — comment that CI must be green                             |
| 4   | Spec quality approved (spec PRs only) | Apply `spec` review (Step 5)     | **Skip** — comment with review findings                              |

## Process

### Step 0: Read Memory

Read memory per the agent profile (your summary, the current week's log, and
teammates' summaries). From prior `product-manager` entries, extract PRs skipped
in previous runs with consecutive-skip counts and contributor trust decisions
carried forward.

### Step 1: List Open PRs

```sh
gh pr list --state open --base main \
  --json number,title,headRefName,author,updatedAt,mergeable,mergeStateStatus,labels
```

Skip PRs authored by `app/dependabot` — handled by `security-update`.

### Step 2: Verify Contributor Trust

Check whether the author is the CI app:

```sh
gh pr view <number> --json author --jq '.author.login'
```

If `app/forward-impact-ci`, the PR is **trusted by definition** — skip the
contributor lookup and proceed to Step 3.

For all other authors, look up the top 20 human contributors:

```sh
gh api repos/{owner}/{repo}/contributors \
  --jq '[.[] | select(.type == "User")] | .[0:20] | .[].login'
```

The PR author must appear in this list. If not, skip and comment (see
`references/templates.md`).

### Step 3: Classify PR Type

Parse the title using `type(scope): subject` convention:

- `fix` or `bug` → mergeable (bug treated as equivalent to fix)
- `spec` → mergeable (after spec review in Step 5)
- Breaking variants with `!` retain the base type
- Any other type (`feat`, `refactor`, `chore`, etc.) → skip and comment

### Step 4: Check CI Status

```sh
gh pr checks <number>
```

All checks must pass. If failing, identify specific failures:

```sh
gh pr checks <number> --json name,state,conclusion \
  --jq '.[] | select(.conclusion != "SUCCESS" and .conclusion != "") | {name, conclusion}'
```

Skip and comment with the specific failing checks.

### Step 5: Review Spec PRs

For `spec` PRs, apply the `spec` skill's review process:

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
   not update `specs/STATUS` directly
4. If spec fails review, skip and comment with findings
5. If spec passes, proceed to merge

### Step 6: Merge

When all gates pass, comment and merge. See `references/templates.md` § Merge
Comment for the template. Verify state changed to `MERGED`.

### Step 7: Report Summary

Produce a summary table (see `references/templates.md` § Report Summary).

### Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **PR triage table** — Each PR with type, author, outcome, and consecutive-skip
  count (carry forward, incrementing for PRs that remain skipped)
- **Contributor trust decisions** — Who was verified and the result
- **Spec review results** — Spec PRs and their assessment
