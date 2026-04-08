# GitHub CLI Command Reference

Common `gh` operations used by CI agent workflows.

## Pull Requests

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

## Issues

```sh
# List issues
gh issue list

# View issue details
gh issue view <number>

# Create an issue
gh issue create --title "title" --body "description"
```

## API Access

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

## Releases

```sh
# List releases
gh release list

# Create a release
gh release create <tag> --title "title" --notes "description"
```

## PR Description Format

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
