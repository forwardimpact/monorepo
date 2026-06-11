# Release Merge Templates

Comment templates and report formats for the merge gate.

## Skip Comments

### Untrusted Author

```sh
gh pr comment <number> --body "Release merge: skipping — author \`<login>\` is not in the top 7 contributors. Requires human review."
```

### Unsupported PR Type

```sh
gh pr comment <number> --body "Release merge: skipping — PR type \`<type>\` requires human review."
```

### Awaiting Approval Signal

```sh
gh pr comment <number> --body "Release merge: blocked — \`wiki/STATUS.md\` row for the spec does not yet show \`<phase>\tapproved\`. Apply \`<phase>:approved\` label, submit an APPROVED review, or post an approval comment from a trusted account; \`kata-dispatch\` will propagate it into STATUS."
```

### CI Failing

Comment with the specific failing checks from `gh pr checks`.

### Substantive Conflict

```sh
gh pr comment <number> --body "Release merge: blocked — substantive conflicts in <files>. Author judgement needed; aborting rebase."
```

## Announcement Cross-Link

Posted on the **coordinating issue** (not the PR) when Step 8 finds no comment
naming the PR. Adapt the verb to the PR's state at gate time:

```sh
gh issue comment <issue-number> --body "Release merge (announcement backstop): PR #<pr-number> — \`<title>\` — is in flight for this issue and has reached the merge gate. Cross-link posted by the gate because no prior comment here named the PR; recorded as an adherence miss per coordination-protocol.md fix-in-flight markers."
```

## Merge Comment

```sh
gh pr comment <number> --body "Release merge: all gates pass — type \`<type>\`, CI green, author trusted, STATUS row \`<phase>\tapproved\`. Merging."
gh pr merge <number> --merge --delete-branch
```

After merging, verify state:

```sh
gh pr view <number> --json state --jq '.state'
```

If still `OPEN`, note in the summary rather than reporting as merged.

## Report Summary

```
| PR     | Title                          | Type | Author | CI    | STATUS         | Action  | Reason                          |
| ------ | ------------------------------ | ---- | ------ | ----- | -------------- | ------- | ------------------------------- |
| #fix-a | fix(parser): schema validation | fix  | alice  | green | n/a            | merged  | All gates pass                  |
| #spec-b| spec(security): SSRF hardening | spec | bob    | green | spec draft     | blocked | STATUS row not at spec approved |
| #feat-c| feat(export): export feature   | feat | carol  | red   | plan approved  | blocked | CI failing: format check        |
| #fix-d | fix(ui): color contrast        | fix  | eve    | green | n/a            | blocked | Author not in top contributors  |
```

**Flag PRs blocked across 3+ consecutive runs** prominently above the table —
these may need human escalation.
