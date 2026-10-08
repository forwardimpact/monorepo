# Template: Dependabot

The generated workflows pin each action to a commit SHA. This config opens bump
pull requests for those pins, so they do not rot. File name:
`.github/dependabot.yml`. Resolve `{{DEPENDABOT_INTERVAL}}` from
[`parameters-guard.md`](parameters-guard.md). When the file exists and has no
`github-actions` entry for directory `/`, add this entry under its `updates:`
list and keep every other entry. The sheet reads the interval of that entry.
A change rewrites only that entry, and the diff before the write covers only
that entry.

## Template

```yaml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "{{DEPENDABOT_INTERVAL}}"
```
