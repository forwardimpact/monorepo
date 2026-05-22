# GitHub Actions SHA Inventory

When evaluating SHA pinning (Policy Check 2), verify the PR updates **all**
workflow files and composite actions that reference the action.

## Third-Party Actions

| Action                            | Files                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actions/checkout`                | check-quality.yml, check-test.yml, check-security.yml, publish-npm.yml, publish-macos.yml, publish-skills.yml (x2), website.yaml, kata-dispatch.yml, agent-product-manager.yml, agent-release-engineer.yml, agent-security-engineer.yml, agent-staff-engineer.yml, agent-technical-writer.yml, kata-coaching.yml, kata-storyboard.yml, interview-\*-setup.yml (x4), kata-action-agent/action.yml, bootstrap/action.yml |
| `actions/create-github-app-token` | kata-dispatch.yml, interview-\*-setup.yml (x4), publish-skills.yml, kata-action-agent/action.yml                                                                                                                                                                                                                                                                                                                       |
| `actions/setup-node`              | check-security.yml, publish-npm.yml, website.yaml                                                                                                                                                                                                                                                                                                                                                                    |
| `actions/cache`                   | check-test.yml                                                                                                                                                                                                                                                                                                                                                                                                       |
| `actions/upload-artifact`         | kata-action-eval/action.yml (x5)                                                                                                                                                                                                                                                                                                                                                                                     |
| `actions/configure-pages`         | website.yaml                                                                                                                                                                                                                                                                                                                                                                                                         |
| `actions/upload-pages-artifact`   | website.yaml                                                                                                                                                                                                                                                                                                                                                                                                         |
| `actions/deploy-pages`            | website.yaml                                                                                                                                                                                                                                                                                                                                                                                                         |
| `oven-sh/setup-bun`               | website.yaml, bootstrap/action.yml                                                                                                                                                                                                                                                                                                                                                                                   |

## Composite Actions

Composite actions in `.github/actions/` are consumed by most agent workflows via
`uses: ./.github/actions/<name>` and inherit any third-party action references
they contain. When updating a SHA used inside a composite action, no workflow
file changes are needed — only the composite action's `action.yml`.

| Composite action                    | Third-party actions used                              |
| ----------------------------------- | ----------------------------------------------------- |
| `.github/actions/bootstrap`         | `oven-sh/setup-bun`                                   |
| `.github/actions/kata-action-eval`  | `actions/upload-artifact` (x5)                        |
| `.github/actions/kata-action-agent` | `actions/create-github-app-token`, `actions/checkout` |

## Verification

Before merging a Dependabot SHA bump, run:

```sh
grep -rn "<action>@" .github/workflows/ .github/actions/
```

Confirm every match has been updated to the new SHA.
