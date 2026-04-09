# GitHub Actions SHA Inventory

When evaluating SHA pinning (Policy Check 2), verify the PR updates **all**
workflow files and composite actions that reference the action.

## Third-Party Actions

| Action                            | Files                                                                                                                                                                                                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actions/checkout`                | check-quality.yml, check-test.yml, check-security.yml, publish-npm.yml, publish-macos.yml, publish-skills.yml (×2), website.yaml, guide-setup.yml, improvement-coach.yml, product-manager.yml, release-readiness.yml, release-review.yml, security-audit.yml, security-update.yml |
| `actions/create-github-app-token` | guide-setup.yml (×2), improvement-coach.yml, product-manager.yml, publish-skills.yml, release-readiness.yml, release-review.yml, security-audit.yml, security-update.yml                                                                                                          |
| `actions/setup-node`              | check-security.yml, publish-npm.yml, website.yaml                                                                                                                                                                                                                                 |
| `actions/cache`                   | check-test.yml                                                                                                                                                                                                                                                                    |
| `actions/upload-artifact`         | .github/actions/gemba-action/action.yml (×3)                                                                                                                                                                                                                                      |
| `actions/configure-pages`         | website.yaml                                                                                                                                                                                                                                                                      |
| `actions/upload-pages-artifact`   | website.yaml                                                                                                                                                                                                                                                                      |
| `actions/deploy-pages`            | website.yaml                                                                                                                                                                                                                                                                      |
| `oven-sh/setup-bun`               | website.yaml, .github/actions/bootstrap/action.yml                                                                                                                                                                                                                                |

## Composite Actions

Composite actions in `.github/actions/` are consumed by most agent workflows via
`uses: ./.github/actions/<name>` and inherit any third-party action references
they contain. When updating a SHA used inside a composite action, no workflow
file changes are needed — only the composite action's `action.yml`.

| Composite action               | Third-party actions used       |
| ------------------------------ | ------------------------------ |
| `.github/actions/bootstrap`    | `oven-sh/setup-bun`            |
| `.github/actions/gemba-action` | `actions/upload-artifact` (×3) |

## Verification

Before merging a Dependabot SHA bump, run:

```sh
grep -rn "<action>@" .github/workflows/ .github/actions/
```

Confirm every match has been updated to the new SHA.
