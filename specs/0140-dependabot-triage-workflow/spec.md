# 140: Automated Dependabot Triage Workflow

## Problem

Dependabot opens PRs weekly for both npm packages and GitHub Actions. These PRs
accumulate because triage requires a human to remember to run the
`dependabot-triage` skill manually. The skill itself is comprehensive — it
evaluates 8 policy checks, merges clean PRs, fixes minor violations, and closes
bad ones — but it sits idle until someone invokes it.

The gap is not the triage logic but the trigger. A scheduled GitHub Actions
workflow can close this gap by launching Claude Code on a timer and letting the
existing skill do the work.

This is also the first workflow in the repository that runs Claude Code. The
invocation pattern — install, configure, prompt — will be needed by future
workflows (code review, release notes, etc.), so it must be extracted into a
reusable composite action from the start.

## Why

- **PRs go stale.** Dependabot opens new PRs weekly. Without regular triage,
  they pile up, creating merge conflicts and security exposure from unpatched
  dependencies.
- **Human trigger is unreliable.** The skill exists but depends on someone
  remembering to run it. Automating the trigger makes triage consistent.
- **The skill already works.** No new triage logic is needed. The
  `dependabot-triage` skill handles policy evaluation, CI checks, merging,
  fixing, and closing. The workflow just needs to invoke it.
- **Reduced toil.** Routine dependency updates (patch/minor bumps that pass all
  checks) should not require human attention. The workflow handles them
  automatically and only leaves genuinely ambiguous cases for review.
- **Reusable foundation.** Extracting Claude Code invocation into a composite
  action means future AI-powered workflows share one tested, maintained pattern
  instead of copy-pasting setup steps.

## What

Two files:

1. **Reusable composite action** (`.github/actions/claude-prompt/action.yml`) —
   installs Claude Code, configures git identity, and runs a prompt with
   configurable tools, model, and turn limits.
2. **Scheduled workflow** (`.github/workflows/dependabot-triage.yml`) — uses the
   composite action on a 3-day cron schedule (with manual `workflow_dispatch`)
   to invoke the `dependabot-triage` skill.

The workflow does not modify the existing skill, add new triage logic, or change
any other repository code.

## Scope

### In scope

- New composite action: `.github/actions/claude-prompt/action.yml`
- New workflow file: `.github/workflows/dependabot-triage.yml`
- Documentation of required secrets, permissions, and operational limits

### Out of scope

- Changes to the `dependabot-triage` skill itself
- Changes to `dependabot.yml` configuration
- Changes to any other workflow files
- New libraries, products, or scripts

## Required Secrets

| Secret              | Purpose                                                   |
| ------------------- | --------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Authenticates Claude Code with the Anthropic API          |
| `CLAUDE_GH_PAT`     | GitHub PAT for PR operations (merge, close, push, create) |

The built-in `GITHUB_TOKEN` is insufficient because Claude Code needs to create
branches, push commits, create PRs, merge PRs, and close PRs — operations that
require a PAT when the actor is a workflow. Using `GITHUB_TOKEN` would also
prevent triggering downstream CI on PRs created by the workflow (GitHub prevents
recursive workflow triggers from `GITHUB_TOKEN`).

## Permissions Model

The `CLAUDE_GH_PAT` needs:

- **Pull requests**: read and write (list, merge, close, comment, create)
- **Contents**: read and write (fetch branches, push fix branches)
- **Actions**: read (check CI status via `gh pr checks`)
- **Metadata**: read (granted by default)

The workflow itself declares minimal `permissions:` at the job level since the
PAT provides the actual authorization.

## Operational Limits

| Limit             | Value      | Rationale                                      |
| ----------------- | ---------- | ---------------------------------------------- |
| Job timeout       | 30 minutes | Prevents runaway sessions burning CI minutes   |
| Max turns         | 50         | Bounds the conversation length per invocation  |
| Concurrency group | 1 (cancel) | Prevents parallel runs from conflicting on PRs |
| Model             | opus       | Highest capability for autonomous triage       |
