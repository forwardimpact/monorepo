---
name: gemba-gh-cli
description: Install and use the GitHub CLI (gh). Use when interacting with GitHub issues, pull requests, releases, and API from the command line.
---

# GitHub CLI (gh)

Install and use the GitHub CLI for interacting with GitHub repositories, issues,
pull requests, and the GitHub API.

## When to Use

- Creating, viewing, or updating pull requests
- Managing GitHub issues
- Querying the GitHub API
- Viewing PR checks, comments, or review status
- Creating releases

## Installation

The `gh` CLI may not be pre-installed. Install from the official tarball:

```sh
bash .claude/skills/gemba-gh-cli/scripts/install.sh [version]
```

Default version is `2.63.2`. Pass a version argument to override.

**Note:** `apt-get install gh` often fails in sandboxed environments due to GPG
key issues. Always prefer the script above.

## Authentication

Check authentication status before use:

```sh
gh auth status
```

If authenticated via `GH_TOKEN` environment variable, no further setup is
needed. The token scope determines available operations.

## Command Reference

See `references/commands.md` for common operations: pull requests, issues, API
access, releases, and PR description formatting.

## Proxy Environments

When the git remote uses a local proxy (e.g., `http://local_proxy@127.0.0.1`),
`gh` commands that infer the repo from the remote may fail. Use `gh api`
directly with explicit repo paths instead of convenience commands.
