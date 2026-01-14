---
applyTo: "**"
---

# Git Workflow

## Conventional Commits

Format: `type(scope): subject`

**Types**: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`, `perf`

**Scope**: Use the most specific area changed (folder name, entity type, or
feature). Omit if change spans multiple areas.

**Breaking changes**: Add `!` after scope: `refactor(model)!: change API`

## Before Committing

1. Run `npm run check` and fix any issues related to your changes
2. Review with `git diff`
3. Stage and commit: `git commit -m "type(scope): subject"`

**Always commit your work before finishing a task.**
