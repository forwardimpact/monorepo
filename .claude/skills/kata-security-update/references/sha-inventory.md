# GitHub Actions SHA Inventory

When evaluating SHA pinning (Policy Check 2), verify the PR updates **all**
workflow files and composite actions that reference the action. Derive the
inventory live — never rely on a remembered or written-down mapping.

## Deriving the inventory

List every reference to the bumped action across workflows and composite
actions:

```sh
grep -rn "<action>@" .github/workflows/ .github/actions/
```

Confirm every match has been updated to the new SHA. A PR that updates some
references but not others leaves the repository split across two pins — **fix**
by aligning the stragglers.

## Composite Actions

Composite actions in `.github/actions/` are consumed by workflows via
`uses: ./.github/actions/<name>` and inherit any third-party action references
they contain. When updating a SHA used inside a composite action, no workflow
file changes are needed — only the composite action's `action.yml`.

Actions consumed from external repositories (e.g. published composite actions)
pin their own third-party refs in their home repos — out of scope for this
inventory.
