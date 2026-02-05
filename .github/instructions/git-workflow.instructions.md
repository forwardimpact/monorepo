---
applyTo: "**"
---

# Git Workflow

## Conventional Commits

Format: `type(scope): subject`

**Types**: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`, `perf`

**Scope**: Use package name (`schema`, `model`, `pathway`) or specific area.
Omit if change spans multiple packages.

**Breaking changes**: Add `!` after scope: `refactor(model)!: change API`

## Before Committing

1. Run `npm run check` and fix any issues related to your changes
2. Review with `git diff`
3. Assess version impact for affected packages (see below)
4. Stage and commit: `git commit -m "type(scope): subject"`

**Always commit your work before finishing a task.**

## Version Bumps

Assess version impact at each commit:

| Change Type               | Bump  |
| ------------------------- | ----- |
| Breaking API change (`!`) | Major |
| New feature (`feat`)      | Minor |
| Bug fix, refactor, other  | Patch |

**Dependency chain**: `schema` → `model` → `pathway`

Find dependents: `grep -l "@forwardimpact/{pkg}" apps/*/package.json`

When releasing a minor or major version, update dependent packages:

1. Bump version in `apps/{package}/package.json`
2. Update dependency version in downstream packages (minor/major only)
3. Commit: `chore({package}): bump to {version}`
4. Tag: `git tag {package}@v{version}`
5. Push commits: `git push origin main`
6. Push each tag individually: `git push origin {package}@v{version}`

**Push tags one at a time.** GitHub Actions triggers once per push event, so
`git push --tags` with multiple tags only triggers one workflow run. Push each
tag separately to trigger individual publish workflows.
