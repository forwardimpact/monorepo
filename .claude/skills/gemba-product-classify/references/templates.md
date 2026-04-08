# Product Backlog Templates

Comment templates and report formats for PR triage.

## Skip Comments

### Untrusted Author

```sh
gh pr comment <number> --body "Product backlog triage: skipping — author \`<login>\` is not in the top 20 contributors. Requires human review."
```

### Unsupported PR Type

```sh
gh pr comment <number> --body "Product backlog triage: skipping — PR type \`<type>\` requires human review."
```

### CI Failing

Comment with the specific failing checks from `gh pr checks`.

## Merge Comment

```sh
gh pr comment <number> --body "Product backlog triage: all gates pass — type is \`<type>\`, CI green, author is trusted contributor. Merging."
gh pr merge <number> --squash --auto
```

After merging, verify state:

```sh
gh pr view <number> --json state --jq '.state'
```

If still `OPEN` (auto-merge pending), note this in the summary rather than
reporting as merged.

## Report Summary

```
| PR  | Title                          | Type | Author | Action  | Reason                          |
| --- | ------------------------------ | ---- | ------ | ------- | ------------------------------- |
| #42 | fix(map): schema validation    | fix  | alice  | merged  | All gates pass                  |
| #38 | feat(pathway): export feature  | feat | bob    | skipped | Type outside scope              |
| #35 | spec(security): SSRF hardening | spec | carol  | skipped | Spec review: scope not specific |
| #31 | fix(libui): color contrast     | fix  | eve    | skipped | Author not in top contributors  |
```

**Flag PRs skipped across 3+ consecutive runs** — these may need escalation.
Call them out prominently above the table.
