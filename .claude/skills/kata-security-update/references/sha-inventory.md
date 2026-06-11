# GitHub Actions SHA Inventory

When evaluating SHA pinning (Policy Check 2), verify the PR updates **all**
workflow files and composite actions that reference the action.

## Third-Party Actions

| Action                            | Files |
| --------------------------------- | ----- |
| `actions/checkout`                | build-binaries.yml (x2), check-context.yml (x5), check-data.yml (x2), check-quality.yml (x4), check-security.yml (x3), check-test.yml (x2), eval-guide.yml, eval-kata.yml, eval-wiki.yml, kata-dispatch.yml, kata-interview.yml, outpost-determinism-probe.yml, publish-brew.yml (x2), publish-macos.yml, publish-npm.yml, publish-skills.yml (x4), website-monorepo.yaml, website-fit.yaml, website-kata.yaml, website-coaligned.yaml |
| `actions/create-github-app-token` | eval-guide.yml, kata-dispatch.yml, kata-interview.yml, publish-brew.yml, publish-skills.yml (x2), website-monorepo.yaml, website-fit.yaml, website-kata.yaml, website-coaligned.yaml |
| `actions/setup-node`              | check-security.yml, publish-npm.yml, website-monorepo.yaml, website-fit.yaml, website-kata.yaml, website-coaligned.yaml |
| `actions/cache`                   | check-test.yml (x3) |
| `actions/upload-artifact`         | build-binaries.yml, outpost-determinism-probe.yml, website-monorepo.yaml, website-fit.yaml, website-kata.yaml, website-coaligned.yaml |
| `actions/download-artifact`       | publish-brew.yml, publish-macos.yml, publish-native.yml |

## Composite Actions

Composite actions in `.github/actions/` are consumed by most agent workflows via
`uses: ./.github/actions/<name>` and inherit any third-party action references
they contain. When updating a SHA used inside a composite action, no workflow
file changes are needed — only the composite action's `action.yml`.

| Composite action                  | Third-party actions used |
| --------------------------------- | ------------------------ |
| `.github/actions/audit`           | none                     |
| `.github/actions/coaligned-check` | none                     |

The former local `bootstrap`, `kata-action-agent`, and `kata-action-eval`
composites moved to the published siblings `forwardimpact/fit-bootstrap`,
`forwardimpact/kata-agent`, and `forwardimpact/fit-eval`; their third-party
refs are pinned in the sibling repos, not here.

## Verification

Before merging a Dependabot SHA bump, run:

```sh
grep -rn "<action>@" .github/workflows/ .github/actions/
```

Confirm every match has been updated to the new SHA.
