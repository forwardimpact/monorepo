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
- [ ] Use fully-qualified, SHA-pinned action references
      (`forwardimpact/kata-agent@<full-sha> # vX.Y.Z`), never local paths
      or mutable tags.
- [ ] Use npm/npx in all generated content, never bun/bunx/just.
- [ ] Read [TRUST.md](../../../TRUST.md) — the hosted-vs-self-hosted
      trust model the operator is opting into.

</read_do_checklist>

<do_confirm_checklist goal="Verify generated workflows before reporting">

- [ ] Every generated workflow file uses the published action, not a local path.
- [ ] Action refs are SHA-pinned to a release-tag commit (`@<full-sha> # <tag>`)
      and a `github-actions` Dependabot entry exists in the consuming repo.
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

6. **Model** — "Which Claude model?" Default: `claude-fable-5[1m]`.

7. **Agent profiles** — "Do you have custom agent profiles, or should I use the
   defaults from kata-skills?" If defaults, confirm
   `npx skills add forwardimpact/kata-skills` is installed.

8. **Control plane** — "Are you using the Forward Impact-hosted control
   plane, or self-hosting your own GitHub App?" Default: self-hosted. See
   [TRUST.md](../../../TRUST.md) for the trust model of each path. In
   **hosted** mode the workflows mint a short-lived installation token
   from `services/oidc` at run time, so the team does **not** configure
   `KATA_APP_ID` / `KATA_APP_PRIVATE_KEY` (question 2 needs only
   `ANTHROPIC_API_KEY`); instead set the `FIT_OIDC_URL` repository
   **variable** to the hosted OIDC URL before the first workflow run.

### Step 2: Generate Workflow Files

For each selected agent, write a workflow to `.github/workflows/` using
templates from `references/workflow-agent.md` (scheduled agents) and
`references/workflow-facilitate.md` (storyboard/coaching). Use
`forwardimpact/kata-agent` as the action, SHA-pinned: resolve the
`{{KATA_AGENT_REF}}` / `{{FIT_EVAL_REF}}` placeholders per
[`workflow-agent.md` § Resolving action refs](references/workflow-agent.md#resolving-action-refs)
— list the sibling's release tags with `gh api`, pick the highest `vX.Y.Z`
tag, and emit `@<full-40-char-sha> # <tag>`. Never emit the mutable `v1`
tag; if resolution fails, stop and ask the operator.

Pair the pins with a `github-actions` Dependabot config so they receive
bump PRs instead of rotting. Write `.github/dependabot.yml` (or merge this
entry into an existing one):

```yaml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

Emit the variant matching question 8's mode: the **`## Template
(self-hosted)`** block (the default) or the **`## Template (hosted)`**
block. Each reference carries both. On hosted setup, remind the operator:
"Set the `FIT_OIDC_URL` repository variable to your hosted OIDC URL before
the first workflow run." The hosted blocks carry no `KATA_APP_PRIVATE_KEY`.

Generate one workflow per agent. Storyboard and coaching workflows are generated
only when `improvement-coach` is selected.

### Step 3: Generate kata-dispatch

If `product-manager` is selected, ask: "Do you want agents to respond to PR
comments, issue comments, and discussions?" If yes, generate `kata-dispatch.yml`
from `references/workflow-react.md` — emit the `## Template (hosted)` block in
hosted mode (question 8) or `## Template (self-hosted)` otherwise.

If discussion replies are wanted, also instruct the operator to deploy
`services/ghbridge` before flipping the App webhook URL to point at it. PR,
issue, and review events reach `kata-dispatch` directly via workflow triggers
and need no bridge, but Discussion events arrive through the App webhook and
require a running ghbridge instance. Point them at
[`services/ghbridge/README.md`](https://github.com/forwardimpact/monorepo/blob/main/services/ghbridge/README.md)
for prerequisites, configuration, and the tunnel/webhook setup.

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
