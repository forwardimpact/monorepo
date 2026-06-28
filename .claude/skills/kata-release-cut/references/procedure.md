# Release-cut procedure tables

Lookup tables and edge-case notes for the release-cut procedure in SKILL.md.

## Tag prefix mapping

| Directory          | Tag prefix | Example tag       |
| ------------------ | ---------- | ----------------- |
| `libraries/libfoo` | `libfoo`   | `libfoo@v0.1.5`   |
| `products/foo`     | `foo`      | `foo@v0.25.0`     |
| `services/bar`     | `svcbar`   | `svcbar@v0.1.110` |

## Commit, tag, push (Steps 6–7)

```sh
git add <package>/package.json <lockfile>
git commit -m "chore(<pkg>): bump to <version>"
git tag <prefix>@v<version>            # one tag per package
git push origin main                   # commit first
git push origin <prefix>@v<version>    # then each tag — never --tags
gh run list --limit 10 --json name,conclusion,headBranch,event
```

For multiple packages: commit all bumps, then tag each. On a publish failure,
`gh run view <run-id> --log-failed`.

## Summary table format (Step 8)

```text
| Package  | Previous | New    | Tag             | Publish |
| -------- | -------- | ------ | --------------- | ------- |
| libskill | 4.0.3    | 4.0.4  | libskill@v4.0.4 | ✓       |
```

## Publish-class issues (Step 7)

A publish-class issue — one whose definition of done is a live artifact, not a
merged fix — auto-closes when its fix PR merges, before the publish outcome
exists. After verifying the publish, post a verification comment on each such
issue citing the green publish run and the live artifact; it stays closed only
with that comment. If the publish failed, reopen the issue.

## Edge cases

- **First release.** Skip packages with version `0.0.0` or `"private": true`.
- **Failed publish.** Don't delete the tag. Fix, bump patch, re-tag.

(The dependency-chain ordering hazard is stated inline in SKILL.md § Edge
Cases — release foundational packages before their consumers.)
