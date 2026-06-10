# GitHub Actions SHA Inventory

When evaluating SHA pinning (Policy Check 2), verify the PR updates **all**
workflow files and composite actions that reference the action.

## Third-Party Actions

| Action                            | Files                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actions/checkout`                | check-quality.yml, check-test.yml, check-security.yml, publish-npm.yml, publish-macos.yml, publish-skills.yml (x2), website.yaml, kata-dispatch.yml, agent-product-manager.yml, agent-release-engineer.yml, agent-security-engineer.yml, agent-staff-engineer.yml, agent-technical-writer.yml, kata-coaching.yml, kata-storyboard.yml, interview-\*-setup.yml (x4) |
| `actions/create-github-app-token` | kata-dispatch.yml, interview-\*-setup.yml (x4), publish-skills.yml                                                                                                                                                                                                                                                                                                |
| `actions/setup-node`              | check-security.yml, publish-npm.yml, website.yaml                                                                                                                                                                                                                                                                                                                |
| `actions/cache`                   | check-test.yml                                                                                                                                                                                                                                                                                                                                                    |
| `actions/upload-artifact`         | build-binaries.yml, outpost-determinism-probe.yml, website-monorepo.yaml, website-fit.yaml, website-kata.yaml, website-coaligned.yaml                                                                                                                                                                                                                             |
| `actions/configure-pages`         | website.yaml                                                                                                                                                                                                                                                                                                                                                      |
| `actions/upload-pages-artifact`   | website.yaml                                                                                                                                                                                                                                                                                                                                                      |
| `actions/deploy-pages`            | website.yaml                                                                                                                                                                                                                                                                                                                                                      |

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
