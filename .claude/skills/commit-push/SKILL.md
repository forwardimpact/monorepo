---
name: commit-push
description:
  "Commit and push changes to remote. Use when finishing a task, grouping
  changes into logical commits, and pushing to the remote repository."
---

# Commit and Push Changes

Commit all staged and unstaged changes, then push to remote.

## When to Use

- Finishing a task and need to commit work
- Grouping related changes into logical, atomic commits
- Pushing completed work to the remote repository

## Process

1. Run `git diff` to review all changes
2. Group related changes into logical, atomic commits
3. Separate feature/logic changes from formatting changes
4. Run `npm run check` to validate changes
5. Assess version bump level for affected packages:
   - Breaking changes → major
   - New features → minor
   - Fixes/refactors → patch
6. Push all commits to remote

## Commit Format

Use conventional commits: `type(scope): subject`

**Types**: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`, `perf`

**Scope**: Use package name (`schema`, `model`, `pathway`) or specific area.
Omit if change spans multiple packages.

## Version Bumps

Assess version impact at each commit:

| Change Type               | Bump  |
| ------------------------- | ----- |
| Breaking API change (`!`) | Major |
| New feature (`feat`)      | Minor |
| Bug fix, refactor, other  | Patch |

**Dependency chain**: `schema` → `model` → `pathway`

When releasing a minor or major version, update dependent packages:

1. Bump version in `apps/{package}/package.json`
2. Update dependency version in downstream packages (minor/major only)
3. Commit: `chore({package}): bump to {version}`
4. Tag: `git tag {package}@v{version}`
5. Push commits: `git push origin main`
6. Push each tag individually: `git push origin {package}@v{version}`
