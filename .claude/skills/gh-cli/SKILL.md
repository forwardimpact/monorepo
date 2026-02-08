---
name: gh-cli
description:
  "Install and use the GitHub CLI (gh). Use when interacting with GitHub issues,
  pull requests, releases, and API from the command line."
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
# Detect architecture and install
ARCH=$(dpkg --print-architecture 2>/dev/null || echo "amd64")
VERSION="2.63.2"
wget -q "https://github.com/cli/cli/releases/download/v${VERSION}/gh_${VERSION}_linux_${ARCH}.tar.gz" \
  -O /tmp/gh.tar.gz
tar -xzf /tmp/gh.tar.gz -C /tmp
cp "/tmp/gh_${VERSION}_linux_${ARCH}/bin/gh" /usr/local/bin/gh
```

Verify with `gh --version`.

**Note:** `apt-get install gh` often fails in sandboxed environments due to GPG
key issues. Always prefer the tarball method above.

## Authentication

Check authentication status before use:

```sh
gh auth status
```

If authenticated via `GH_TOKEN` environment variable, no further setup is
needed. The token scope determines available operations.

## Common Operations

### Pull Requests

```sh
# List open PRs
gh pr list

# View a specific PR
gh pr view <number>

# Create a PR
gh pr create --title "title" --body "description"

# Update PR description
gh pr edit <number> --body "new description"

# View PR diff
gh pr diff <number>

# Check PR status/checks
gh pr checks <number>
```

### Issues

```sh
# List issues
gh issue list

# View issue details
gh issue view <number>

# Create an issue
gh issue create --title "title" --body "description"
```

### API Access

Use `gh api` for any GitHub REST or GraphQL endpoint:

```sh
# REST API
gh api repos/{owner}/{repo}/pulls
gh api repos/{owner}/{repo}/pulls/{number}/comments

# With jq filtering
gh api repos/{owner}/{repo}/pulls --jq '.[] | {number, title, state}'

# GraphQL
gh api graphql -f query='{ viewer { login } }'
```

### Releases

```sh
# List releases
gh release list

# Create a release
gh release create <tag> --title "title" --notes "description"
```

## Proxy Environments

When the git remote uses a local proxy (e.g., `http://local_proxy@127.0.0.1`),
`gh` commands that infer the repo from the remote may fail. In these cases, use
`gh api` directly with explicit repo paths instead of convenience commands like
`gh pr list`.

## PR Description Format

When creating or updating PR descriptions, use this structure:

```sh
gh pr create --title "short title" --body "$(cat <<'EOF'
## Summary
- First change
- Second change

## Test plan
- [ ] Verify change A
- [ ] Verify change B
EOF
)"
```
