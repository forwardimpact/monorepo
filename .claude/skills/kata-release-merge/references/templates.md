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
gh pr comment <number> --body "Release merge: blocked — \`wiki/STATUS.md\` row for spec NNN does not yet show \`<phase>\tapproved\`. Apply \`<phase>:approved\` label, submit an APPROVED review, or post an approval comment from a trusted account; \`kata-dispatch\` will propagate it into STATUS."
```

### CI Failing

Comment with the specific failing checks from `gh pr checks`.

### Substantive Conflict

```sh
gh pr comment <number> --body "Release merge: blocked — substantive conflicts in <files>. Author judgement needed; aborting rebase."
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
| PR  | Title                          | Type | Author | CI    | STATUS         | Action  | Reason                          |
| --- | ------------------------------ | ---- | ------ | ----- | -------------- | ------- | ------------------------------- |
| #42 | fix(map): schema validation    | fix  | alice  | green | n/a            | merged  | All gates pass                  |
| #38 | spec(security): SSRF hardening | spec | bob    | green | spec draft     | blocked | STATUS row not at spec approved |
| #35 | feat(pathway): export feature  | feat | carol  | red   | plan approved  | blocked | CI failing: format check        |
| #31 | fix(libui): color contrast     | fix  | eve    | green | n/a            | blocked | Author not in top contributors  |
```

**Flag PRs blocked across 3+ consecutive runs** prominently above the table —
these may need human escalation.
