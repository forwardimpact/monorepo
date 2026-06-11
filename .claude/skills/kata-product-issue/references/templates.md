# Product Feedback Templates

Comment, PR, and issue body templates for triage and feedback processing. Every
comment and PR body is signed `— Product Manager 🌱`.

## Issue Comments

Use `gh issue comment <number> --body "<text>"` with the text below, selecting
the variant that matches the triage decision. For `wontfix` and duplicate
outcomes, chain `gh issue edit --add-label` and/or `gh issue close` after the
comment.

| Outcome             | Body text                                                                                                                                 | Follow-up                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Mechanical fix**  | Thanks for reporting this! I can see the problem — I'll put together a fix now.                                                           | —                                           |
| **Product-aligned** | Thanks for this suggestion! This aligns with our product direction. I'm going to write up a spec so we can plan the implementation.       | —                                           |
| **Out of scope**    | Thanks for taking the time to open this! After reviewing it against our product direction, this falls outside our current scope. _<why>_. | `--add-label wontfix`; `gh issue close`     |
| **Duplicate**       | Thanks for reporting this! This is already tracked in #<original>, so I'll close this one as a duplicate.                                 | `gh issue close --reason "not planned"`     |
| **Needs info**      | Thanks for opening this! I'd like to help, but I need a bit more context: _<specific questions>_.                                         | `--add-label needs-info` (do **not** close) |

### Adding Feedback to Existing Issues

```sh
gh issue comment <number> --body "$(cat <<'EOF'
Additional feedback observed during user testing of **<product>** in the
`<scenario>` evaluation scenario:

<description>

— Product Manager 🌱
EOF
)"
```

## Fix and Spec PRs

Both follow the same shape. Differences: branch prefix (`fix/` vs `spec/`),
commit type (`fix(<scope>)` vs `spec(<scope>)`), closing keyword (`Closes` vs
`Addresses`), and staged paths (code vs `specs/<NNN>-<name>/spec.md`).

### Branch and Commit

```sh
git checkout main && git pull origin main
git checkout -b <fix|spec>/issue-<number>-<short-description>
# ... implement fix or write spec ...
# Run the repository's check and test commands
git add <paths>
git commit -m "<fix|spec>(<scope>): <description>

<Closes|Addresses> #<number>"
git push -u origin <fix|spec>/issue-<number>-<short-description>
```

### PR Body

```sh
gh pr create \
  --title "<fix|spec>(<scope>): <description>" \
  --body "$(cat <<'EOF'
## Summary

<description>

<Closes|Addresses> #<number>

## Test plan

- [ ] Repository check command passes
- [ ] <specific verification>
EOF
)"
```

Spec PRs replace the Test plan with a Review section:

```markdown
## Review

Spec for issue #<number>. Needs review before implementation — see the
`kata-spec` skill for the review process.
```

## New Issues from User Testing

```sh
gh issue create \
  --title "<bug|docs|feat>(<product>): <concise description>" \
  --label "user-testing" \
  --body "$(cat <<'EOF'
## Context
Observed during user testing of **<product>** in the `<scenario>` scenario.

## Feedback
<detailed description>

## Expected vs Actual
Expected: <what the user expected>
Actual: <what happened>

— Product Manager 🌱
EOF
)"
```

## Report Summary Tables

Inbound triage (existing issues classified):

```
| Issue   | Title                           | Category        | Action       | Detail                     |
| ------- | ------------------------------- | --------------- | ------------ | -------------------------- |
| #bug-a  | Schema validation crash on null | mechanical fix  | PR #fix-a    | Fix null check in validate |
| #feat-b | Support custom skill levels     | product-aligned | spec PR #spec-b | Spec lives at specs/<slug>/ |
| #out-c  | Add dark mode                   | out of scope    | closed       | Not in product scope       |
```

Outbound feedback (from user testing):

```
| Item  | Feedback                          | Category      | Action               | Issue   |
| ----- | --------------------------------- | ------------- | -------------------- | ------- |
| Obs-a | Install docs missing Node version | documentation | commented on #docs-a | #docs-a |
| Obs-b | Crash on skill query              | bug           | issue #bug-b         | #bug-b  |
| Obs-c | Slow response in CI environment   | out of scope  | skipped              | —       |
```
