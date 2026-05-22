---
name: kata-setup
description: >
  Set up the Kata Agent Team in your repository. Walks through GitHub App
  creation, secret configuration, agent selection, and generates workflow
  files. Use when setting up a new Kata installation or adding agents to
  an existing one.
---

# Set Up the Kata Agent Team

Interactive skill that configures the
[Kata Agent Team](https://www.forwardimpact.team/docs/internals/kata/) in your
repository. Generates GitHub Actions workflow files for scheduled agents,
facilitated sessions, and event-driven responses.

## When to Use

- Setting up Kata for the first time in a new repository
- Adding new agents to an existing Kata installation
- Reconfiguring schedules, models, or agent profiles

## Prerequisites

- Node.js 18+
- GitHub repository with Actions enabled
- Anthropic API key
- `npx skills add forwardimpact/kata-skills`

## Checklists

<read_do_checklist goal="Gather all configuration before generating files">

- [ ] Ask which agents to enable — do not assume all six.
- [ ] Confirm timezone for schedule generation.
- [ ] Confirm secrets are configured before writing workflows.
- [ ] Use fully-qualified action references
      (forwardimpact/kata-action-agent@v1), never local paths.
- [ ] Use npm/npx in all generated content, never bun/bunx/just.

</read_do_checklist>

<do_confirm_checklist goal="Verify generated workflows before reporting">

- [ ] Every generated workflow file uses the published action, not a local path.
- [ ] Cron schedules match the user's requested timezone.
- [ ] Secrets reference names match what was configured.
- [ ] Agent profiles match the names the user confirmed.
- [ ] kata-dispatch workflow includes the recursion guard.

</do_confirm_checklist>

## Process

### Step 1: Gather Configuration

Ask these questions. Skip any already answered in the task prompt.

1. **GitHub App** — "Do you have a GitHub App for your agents, or should I help
   you create one?" If creating, walk through `references/github-app.md`. If
   existing, ask for the App slug.

2. **Secrets** — "Have you configured these repository secrets?"
   - `KATA_APP_ID` — GitHub App ID
   - `KATA_APP_PRIVATE_KEY` — GitHub App private key (PEM)
   - `ANTHROPIC_API_KEY` — Anthropic API key

3. **Agents** — "Which agents do you want to run?" Present:
   - **product-manager** — Triage issues and PRs, merge fixes, run evaluations
   - **engineering agent** — Spec, design, plan, and implement features (default
     profile: `staff-engineer`)
   - **security-engineer** — Patch dependencies, harden supply chain
   - **release-engineer** — Keep branches merge-ready, cut releases
   - **technical-writer** — Review docs, curate wiki, fix staleness
   - **improvement-coach** — Facilitate storyboard and coaching sessions

   Default: all six. Let the user pick a subset.

4. **Timezone** — "What timezone are your agents working in?" Default:
   Europe/Paris. Use `references/schedules.md` for cron expressions.

5. **Wiki** — "Do you want agents to share persistent memory via a GitHub
   wiki?" Default: yes. If no, set `wiki: "false"` in generated workflows.

6. **Model** — "Which Claude model?" Default: `claude-opus-4-7[1m]`.

7. **Agent profiles** — "Do you have custom agent profiles, or should I use the
   defaults from kata-skills?" If defaults, confirm
   `npx skills add forwardimpact/kata-skills` is installed.

### Step 2: Generate Workflow Files

For each selected agent, write a workflow to `.github/workflows/` using
templates from `references/workflow-agent.md` (scheduled agents) and
`references/workflow-facilitate.md` (storyboard/coaching). Use
`forwardimpact/kata-action-agent@v1` as the action reference.

Generate one workflow per agent. Storyboard and coaching workflows are generated
only when `improvement-coach` is selected.

### Step 3: Generate kata-dispatch

If `product-manager` is selected, ask: "Do you want agents to respond to PR
comments, issue comments, and discussions?" If yes, generate `kata-dispatch.yml`
from `references/workflow-react.md`.

### Step 4: Verify

Run verification:

- `gh secret list` — confirm secrets are configured
- Confirm workflow files were written to `.github/workflows/`
- Suggest a test run: `gh workflow run "Agent: <name>"`

### Step 5: Report

Summarize what was created and suggest next steps:

- Customize agent profiles if using defaults
- Adjust schedules after observing initial runs
- Read the [Kata internals](https://www.forwardimpact.team/docs/internals/kata/)
  for architecture details
