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

When ready to release, for each affected package:

1. Bump version in `apps/{package}/package.json`
2. Commit: `chore({package}): bump to {version}`
3. Tag: `git tag {package}@v{version}`
4. Push: `git push origin main --tags`

Tags trigger publish workflows automatically.
