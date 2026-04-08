# Product Feedback Templates

Comment and PR body templates for issue triage and feedback processing.

## Issue Comments

### Acknowledging a Trivial Fix

```sh
gh issue comment <number> --body "Thanks for reporting this! I can see the problem — I'll put together a fix now.

— Product Manager 🌱"
```

### Acknowledging a Product-Aligned Issue

```sh
gh issue comment <number> --body "Thanks for this suggestion! This aligns with our product direction. I'm going to write up a spec so we can plan the implementation properly.

— Product Manager 🌱"
```

### Closing Out-of-Scope Issues

```sh
gh issue comment <number> --body "Thanks for taking the time to open this! After reviewing it against our product direction, this falls outside our current scope. <brief explanation of why>.

Closing for now — feel free to reopen with additional context if you think this assessment is off.

— Product Manager 🌱"
gh issue edit <number> --add-label "wontfix"
gh issue close <number>
```

### Closing Duplicate Issues

```sh
gh issue comment <number> --body "Thanks for reporting this! This is already tracked in #<original>, so I'll close this one as a duplicate.

— Product Manager 🌱"
gh issue close <number> --reason "not planned"
```

### Requesting More Information

```sh
gh issue comment <number> --body "Thanks for opening this! I'd like to help, but I need a bit more context to act on it. Could you provide <specific questions>?

— Product Manager 🌱"
gh issue edit <number> --add-label "needs-info"
```

Do **not** close unclear issues — leave them open for the reporter to respond.

### Adding Feedback to Existing Issues

```sh
gh issue comment <number> --body "$(cat <<'EOF'
Additional feedback observed during user testing of **<product>** in the
`<scenario>` evaluation scenario:

<description of the feedback item>

— Product Manager 🌱
EOF
)"
```

## Fix PRs

### Branch and Commit

```sh
git checkout main && git pull origin main
git checkout -b fix/issue-<number>-<short-description>
# ... implement fix ...
bun run check
bun run test
git add <changed-files>
git commit -m "fix(<scope>): <description>

Closes #<number>"
git push -u origin fix/issue-<number>-<short-description>
```

### PR Body

```sh
gh pr create \
  --title "fix(<scope>): <description>" \
  --body "$(cat <<'EOF'
## Summary

<description of the fix>

Closes #<number>

## Test plan

- [ ] `bun run check` passes
- [ ] <specific verification>
EOF
)"
```

## Spec PRs

### Branch and Commit

```sh
git checkout main && git pull origin main
git checkout -b spec/issue-<number>-<short-description>
# ... write spec using spec skill ...
bun run check
bun run test
git add specs/<NNN>-<name>/spec.md specs/STATUS
git commit -m "spec(<scope>): <description>

Addresses #<number>"
git push -u origin spec/issue-<number>-<short-description>
```

### PR Body

```sh
gh pr create \
  --title "spec(<scope>): <description>" \
  --body "$(cat <<'EOF'
## Summary

Spec for issue #<number>: <issue title>

<brief description of what the spec proposes>

Addresses #<number>

## Review

This spec needs review before implementation can begin. See the `gemba-spec`
skill for the review process.
EOF
)"
```

## New Issues from User Testing

```sh
gh issue create \
  --title "<type>(<product>): <concise description>" \
  --label "user-testing" \
  --body "$(cat <<'EOF'
## Context

Observed during user testing of the **<product>** product in the
`<scenario>` evaluation scenario.

## Feedback

<detailed description of the feedback item>

## Expected Behaviour

<what the user expected to happen>

## Actual Behaviour

<what actually happened>

— Product Manager 🌱
EOF
)"
```

Title prefixes: `bug(<product>):`, `docs(<product>):`, `feat(<product>):`.

## Report Summary Tables

### Inbound Triage

```
| Issue | Title                           | Category       | Action         | Detail                     |
| ----- | ------------------------------- | -------------- | -------------- | -------------------------- |
| #12   | Schema validation crash on null | trivial fix    | PR #45         | Fix null check in validate |
| #8    | Support custom skill levels     | product-aligned| spec PR #46    | specs/220-custom-levels/   |
| #5    | Add dark mode                   | out of scope   | closed         | Not in product scope       |
```

### Outbound Feedback

```
| # | Feedback                              | Category       | Action              | Issue |
|---|---------------------------------------|----------------|---------------------|-------|
| 1 | Install docs missing Node version     | documentation  | commented on #48    |  #48  |
| 2 | Crash on skill query                  | bug            | issue #53           |  #53  |
| 3 | Slow response in CI environment       | out of scope   | skipped             |  —    |
```
