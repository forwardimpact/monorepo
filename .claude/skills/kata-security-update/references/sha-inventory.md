# GitHub Actions SHA Inventory

When you evaluate SHA pinning (Policy Check 2), verify the PR updates **all**
workflow files and composite actions that reference the action. Derive the
inventory live. Never rely on a remembered or written-down mapping.

## Derive the Inventory

List every reference to the bumped action across workflows and composite
actions:

```sh
grep -rn "<action>@" .github/workflows/ .github/actions/
```

Confirm the PR updates every match to the new SHA. A PR that updates some
references but not others leaves the repository split across two pins. Align
the stragglers to **fix** it.

## Composite Actions

Workflows consume composite actions in `.github/actions/` through
`uses: ./.github/actions/<name>`. Those composite actions inherit any
third-party action references they contain. When you update a SHA inside a
composite action, no workflow file needs a change. Only the composite action's
`action.yml` changes.

Actions consumed from external repositories (e.g. published composite actions)
pin their own third-party refs in their home repos. Those refs are out of scope
for this inventory.
