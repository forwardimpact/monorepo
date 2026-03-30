---
name: product-backlog
description: >
  Triage open pull requests for product alignment. Verify contributor trust
  via top-contributor lookup, check CI status, classify PR types, and merge
  fix, bug, and spec PRs that pass all gates.
---

# Product Backlog Triage

Triage all open pull requests for product alignment, verify contributor trust,
and merge PRs that pass all quality and security gates. The `bug` type is
treated as equivalent to `fix` — both represent corrections.

This workflow is the **sole external merge point** in the CI system. All other
merge points operate on trusted sources (our own agents, Dependabot).
Contributor trust verification is therefore the most critical gate — the
improvement coach audits product-backlog traces to confirm it happened on every
merged PR.

## When to Use

- Reviewing and actioning open PRs for product alignment
- Scheduled daily to keep the backlog moving
- On-demand when specific PRs need product review

## Prerequisites

The `gh` CLI must be installed and authenticated. See the `gh-cli` skill for
installation instructions. Verify with:

```sh
gh auth status
```

## Gate Checklist

Each PR must pass all applicable gates before merge:

| #   | Gate                                  | Verification                         | On failure                                                           |
| --- | ------------------------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| 1   | Author is a top contributor           | `gh api` contributor lookup (Step 2) | **Skip** — comment that only top contributors' PRs are auto-merged   |
| 2   | PR type is `fix`, `bug`, or `spec`    | Parse title prefix (Step 3)          | **Skip** — comment that the PR type is outside product-manager scope |
| 3   | All CI checks pass                    | `gh pr checks` (Step 4)              | **Skip** — comment that CI must be green                             |
| 4   | Spec quality approved (spec PRs only) | Apply `review-spec` skill (Step 5)   | **Skip** — comment with review-spec findings                         |

## Process

### Step 1: List Open PRs

```sh
gh pr list --state open --base main \
  --json number,title,headRefName,author,updatedAt,mergeable,mergeStateStatus,labels
```

Skip PRs authored by `app/dependabot` — those are handled by the
`dependabot-triage` skill.

### Step 2: Verify Contributor Trust

Look up the repository's top contributors using the GitHub API. See the `gh-cli`
skill for CLI usage patterns.

```sh
gh api repos/{owner}/{repo}/contributors \
  --jq '[.[] | select(.type == "User")] | .[0:20] | .[].login'
```

This returns the top 20 human contributors by commit count (excluding bots like
`dependabot[bot]`). The `{owner}/{repo}` placeholder is resolved automatically
by `gh` when run inside the repository. The PR author must appear in this list:

```sh
gh pr view <number> --json author --jq '.author.login'
```

If the author is not in the top contributors list, skip the PR and comment:

```sh
gh pr comment <number> --body "Product backlog triage: skipping — author \`<login>\` is not in the top 20 contributors. Requires human review."
```

### Step 3: Classify PR Type

Extract the commit type from the PR title using the `type(scope): subject`
convention from CONTRIBUTING.md:

- `fix(...)` or `fix: ...` — classified as **fix**
- `bug(...)` or `bug: ...` — classified as **bug** (treated as equivalent to
  fix)
- `spec(...)` or `spec: ...` — classified as **spec**
- Breaking change variants with `!` (e.g. `fix!(scope):`) retain the base type

Any other type (`feat`, `refactor`, `chore`, `docs`, `style`, `test`, `perf`) is
outside scope. Skip the PR and comment:

```sh
gh pr comment <number> --body "Product backlog triage: skipping — PR type \`<type>\` requires human review."
```

### Step 4: Check CI Status

```sh
gh pr checks <number>
```

All checks must pass. If any check is failing or pending, identify the specific
failures:

```sh
gh pr checks <number> --json name,state,conclusion \
  --jq '.[] | select(.conclusion != "SUCCESS" and .conclusion != "") | {name, conclusion}'
```

Skip the PR and comment with the specific failing checks.

### Step 5: Review Spec PRs

For PRs classified as `spec`, apply the `review-spec` skill before merging:

1. Identify the spec directory from the changed files (look for
   `specs/{NNN}-*/spec.md`):

```sh
gh pr view <number> --json files --jq '.files[].path' | grep '^specs/'
```

2. Check out the PR branch to access the spec files:

```sh
git fetch origin <headRefName>
git checkout origin/<headRefName> -- specs/<matched-directory>/
```

3. Read the spec and evaluate it against the `review-spec` criteria. Since you
   cannot commit changes, report your decision and target status — do not
   attempt to update `specs/STATUS` directly
4. If the spec does not meet quality criteria, skip the PR and comment with
   findings (include the `review-spec` decision and note that status should
   remain `draft`)
5. If the spec passes review, proceed to merge. The spec will land on `main` at
   whatever status the spec PR branch contains (typically `review`). A plan must
   still be written and approved before implementation can begin

### Step 6: Merge

When all gates pass:

```sh
gh pr comment <number> --body "Product backlog triage: all gates pass — type is \`<type>\`, CI green, author is trusted contributor. Merging."
gh pr merge <number> --squash --auto
```

After merging, verify the PR state changed:

```sh
gh pr view <number> --json state --jq '.state'
```

The result should be `MERGED`. If the state is still `OPEN` (e.g. auto-merge was
enabled but hasn't triggered yet), note this in the summary rather than
reporting the PR as merged.

### Step 7: Report Summary

After processing all PRs, produce a summary table:

```
| PR  | Title                          | Type | Author | Action  | Reason                          |
| --- | ------------------------------ | ---- | ------ | ------- | ------------------------------- |
| #42 | fix(map): schema validation    | fix  | alice  | merged  | All gates pass                  |
| #38 | feat(pathway): export feature  | feat | bob    | skipped | Type outside scope              |
| #35 | spec(security): SSRF hardening | spec | carol  | skipped | Spec review: scope not specific |
| #31 | fix(libui): color contrast     | fix  | eve    | skipped | Author not in top contributors  |
```

Include any PRs that were skipped with a note explaining why.

## What NOT to Do

- **Do not merge PRs from untrusted authors** — the contributor trust gate is a
  security boundary, never override it
- **Do not merge `feat` PRs** — features require human product review
- **Do not make code changes** — do not fix CI failures, resolve conflicts, or
  modify PR content (that is the release-engineer's scope)
- **Do not skip the review-spec evaluation** for spec PRs
- **Do not merge PRs with failing CI** — all checks must be green
