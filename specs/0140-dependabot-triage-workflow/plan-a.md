# 140: Implementation Plan

## Approach

Two new files:

1. A **reusable composite action** at `.github/actions/claude-prompt/action.yml`
   that handles Claude Code installation, git configuration, and prompt
   execution with configurable inputs.
2. A **workflow** at `.github/workflows/dependabot-triage.yml` that uses the
   composite action on a schedule.

No existing files change.

## New Files

### `.github/actions/claude-prompt/action.yml`

A composite action that any workflow can use to run a Claude Code prompt.

```yaml
name: Claude Prompt
description: Install Claude Code and run a prompt in non-interactive mode

inputs:
  prompt:
    description: The prompt to send to Claude Code
    required: true
  allowed-tools:
    description: Comma-separated list of tools to allow without prompting
    required: false
    default: "Bash,Read,Glob,Grep,Write,Edit"
  model:
    description: Claude model to use
    required: false
    default: "opus"
  max-turns:
    description: Maximum number of agentic turns
    required: false
    default: "50"

runs:
  using: composite
  steps:
    - name: Install Claude Code
      shell: bash
      run: npm install -g @anthropic-ai/claude-code

    - name: Configure Git identity
      shell: bash
      run: |
        git config user.name "github-actions[bot]"
        git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

    - name: Run Claude Code
      shell: bash
      run: |
        claude --print \
          --model "${{ inputs.model }}" \
          --max-turns "${{ inputs.max-turns }}" \
          --allowedTools "${{ inputs.allowed-tools }}" \
          "${{ inputs.prompt }}"
```

The action does **not** set environment variables for secrets
(`ANTHROPIC_API_KEY`, `GH_TOKEN`). The calling workflow passes these via `env:`
on the step or job that uses the action — composite actions cannot access
`secrets` context directly.

### `.github/workflows/dependabot-triage.yml`

```yaml
name: Dependabot Triage

on:
  schedule:
    # Every 3 days at 06:17 UTC (off-minute to avoid :00 stampede)
    - cron: "17 6 */3 * *"
  workflow_dispatch: # Manual trigger for testing or on-demand triage

concurrency:
  group: dependabot-triage
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  triage:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Triage Dependabot PRs
        uses: ./.github/actions/claude-prompt
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_TOKEN: ${{ secrets.CLAUDE_GH_PAT }}
          CLAUDE_CODE_USE_BEDROCK: "0"
        with:
          prompt: "/dependabot-triage"
          model: "opus"
          max-turns: "50"
```

## Design Decisions

### Why a reusable composite action

This is the first workflow running Claude Code. Future workflows (code review,
release notes, skill evaluation) will need the same setup: install Claude Code,
configure git, run a prompt with tool permissions. Extracting into
`.github/actions/claude-prompt/` avoids copy-paste and gives one place to update
the invocation pattern.

The action is deliberately minimal — it handles installation and invocation
only. Secrets are passed by the caller via `env:`, keeping the action generic.

### Why `claude --print`

The `--print` flag runs Claude Code in non-interactive mode — it accepts the
prompt, executes the task, prints the output, and exits. This is the correct
mode for CI where there is no interactive terminal.

### Why `--max-turns 25`

Without a turn limit, Claude could loop indefinitely on edge cases (retrying
failed merges, exploring irrelevant files). 50 turns gives ample room for
triaging many PRs (each requiring multiple tool calls) while still preventing
runaway sessions.

### Why `--allowedTools`

Explicitly listing allowed tools avoids interactive permission prompts that
would hang the CI runner. The triage skill needs `Bash` (for `gh` CLI commands,
`npm audit`, `git` operations), `Read`/`Glob`/`Grep` (for inspecting workflow
files and policy documents), and `Write`/`Edit` (for fixing policy violations on
fix branches).

### Why `npm ci` before Claude Code

The workspace must be fully installed so that Claude Code can run `npm audit`,
`npm ls`, and other npm commands during triage. `npm ci` ensures a clean,
reproducible install from the lock file.

### Why `CLAUDE_GH_PAT` instead of `GH_TOKEN` or `GITHUB_TOKEN`

- `GITHUB_TOKEN` is insufficient — GitHub doesn't trigger workflows on events it
  creates, so fix PRs wouldn't get CI runs. It also lacks the permission
  combination needed for merge + close + create-PR + push.
- The secret is named `CLAUDE_GH_PAT` (not `GH_TOKEN`) to clearly distinguish it
  from GitHub's built-in token and signal its purpose. The workflow passes it as
  `GH_TOKEN` in the env so the `gh` CLI picks it up automatically.

### Why every 3 days at an off-minute

Dependabot opens PRs weekly. Every 3 days ensures PRs are triaged promptly
without burning excessive CI minutes. The `:17` minute avoids the `:00` stampede
when many scheduled workflows fire simultaneously.

### Why `concurrency: cancel-in-progress`

If a manual dispatch fires while a scheduled run is in progress (or vice versa),
two Claude sessions would conflict — both trying to merge or close the same PRs.
The concurrency group ensures only one triage run at a time.

### Why `timeout-minutes: 30`

Prevents stuck or runaway Claude sessions from consuming CI minutes
indefinitely. 30 minutes is generous for triaging a typical batch of Dependabot
PRs.

### Why `/dependabot-triage` as the prompt

Claude Code's skill system recognizes slash-command invocations. The
`dependabot-triage` skill's instructions are comprehensive enough that a simple
invocation triggers the full workflow — list PRs, evaluate policies, take
action, report.

### Why model `opus`

Triage involves nuanced policy evaluation — interpreting version ranges, reading
diffs for SHA pinning, deciding whether to merge/fix/close. Opus provides the
strongest autonomous reasoning for making these judgment calls correctly without
human oversight.

## Secrets Setup

### 1. Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com/) and create an
   API key (or use an existing one).
2. In the GitHub repository, go to **Settings > Secrets and variables >
   Actions**.
3. Click **New repository secret**.
4. Name: `ANTHROPIC_API_KEY`, Value: the API key.

### 2. GitHub PAT

1. Go to **GitHub Settings > Developer settings > Fine-grained personal access
   tokens**.
2. Create a token scoped to the repository with these permissions:
   - **Contents**: Read and write
   - **Pull requests**: Read and write
   - **Actions**: Read
   - **Metadata**: Read (granted by default)
3. In the GitHub repository, go to **Settings > Secrets and variables >
   Actions**.
4. Click **New repository secret**.
5. Name: `CLAUDE_GH_PAT`, Value: the token.

**Token expiry:** Fine-grained tokens have a maximum lifetime (typically 1
year). Set a calendar reminder to rotate before expiry.

**Alternative — GitHub App:** For longer-lived automation, create a GitHub App
with the same permissions, install it on the repository, and use
`actions/create-github-app-token` to generate short-lived tokens in the
workflow. This avoids PAT expiry concerns but adds setup complexity.

## Files

| File                                       | Action |
| ------------------------------------------ | ------ |
| `.github/actions/claude-prompt/action.yml` | Create |
| `.github/workflows/dependabot-triage.yml`  | Create |

## Verification

1. Push both files to `main`.
2. Go to **Actions > Dependabot Triage** and click **Run workflow** (manual
   dispatch).
3. Confirm the job installs Claude Code, runs the triage prompt, and correctly
   evaluates open Dependabot PRs.
4. Verify that merged PRs are squash-merged, fix PRs trigger CI, and closed PRs
   have policy violation comments.
5. Wait for the next scheduled run and confirm it executes automatically.
6. Verify the composite action works by checking that the Claude Code output
   appears in the workflow logs.

## Future Use

Once verified, other workflows can reuse the composite action:

```yaml
- uses: ./.github/actions/claude-prompt
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  with:
    prompt: "Review this PR for security issues and post comments"
    model: "sonnet"
    max-turns: "15"
```
