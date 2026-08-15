---
name: kata-setup
description: >
  Set up the Kata Agent Team in your repository. This skill guides GitHub App
  creation, secret configuration, and agent selection. It generates the workflow
  files. Use it to set up a new Kata installation. Use it to add agents to an
  existing installation.
---

# Set Up the Kata Agent Team

This interactive skill configures the
[Kata Agent Team](https://www.kata.team/) in your repository. It generates
GitHub Actions workflow files for scheduled agents, facilitated sessions, and
event-driven responses.

## When to Use

- Set up Kata for the first time in a new repository
- Add new agents to an existing Kata installation
- Reconfigure schedules, models, or agent profiles

## Prerequisites

- Node.js 18+
- GitHub repository with Actions enabled
- Anthropic API key
- `apm install forwardimpact/kata-skills`
- `apm install forwardimpact/gemba-skills`

## Checklists

<read_do_checklist goal="Gather all configuration before generating files">

- [ ] Ask which agents to enable. Do not assume all six.
- [ ] Confirm the timezone before you generate the schedules.
- [ ] Confirm the secrets are configured before you write the workflows.
- [ ] Use fully-qualified, SHA-pinned action references
      (`forwardimpact/kata-agent@<full-sha> # vX.Y.Z`). Do not use local paths
      or mutable tags.
- [ ] Use npm/npx in all generated content. Never use bun/bunx/just.
- [ ] Read
      [TRUST.md](https://github.com/forwardimpact/monorepo/blob/main/TRUST.md).
      It describes the hosted and self-hosted trust model the operator accepts.

</read_do_checklist>

<do_confirm_checklist goal="Verify generated workflows before reporting">

- [ ] Every generated workflow file uses the published action. No file uses a
      local path.
- [ ] Action refs are SHA-pinned to a release-tag commit
      (`@<full-sha> # <tag>`). A `github-actions` Dependabot entry exists in the
      consuming repo.
- [ ] Cron schedules match the user's requested timezone.
- [ ] Secret reference names match the names you configured.
- [ ] Agent profiles match the names the user confirmed.
- [ ] `agent-shift.yml` lists every selected agent in the matrix. It serializes
      them with `max-parallel: 1`.
- [ ] The dispatch workflow does no prompt assembly. It passes
      `task-event: ${{ github.event_path }}`. The action composes the task,
      including the recursion guard.
- [ ] Every generated workflow gates on the killswitch. `kata-agent` workflows
      pass `killswitch: ${{ vars.KATA_KILLSWITCH }}`. The harness-based dispatch
      workflow keeps the inline `Kata killswitch` first step.

</do_confirm_checklist>

## Process

### Step 1: Gather Configuration

Ask these questions. Skip any question the task prompt already answers.

1. **GitHub App** — "Do you have a GitHub App for your agents, or should I help
   you create one?" If you create one, walk through `references/github-app.md`.
   If the App exists, ask for the App slug.

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

4. **Timezone** — "What timezone do your agents work in?" Default:
   Europe/Paris. Use `references/schedules.md` for cron expressions.

5. **Wiki** — "Do you want agents to share persistent memory through a GitHub
   wiki?" Default: yes. If no, set `wiki: "false"` in generated workflows.

6. **Model** — "Which Claude model?" Default: `claude-opus-4-8[1m]`.

7. **Agent profiles** — "Do you have custom agent profiles, or should I use the
   defaults from kata-skills?" If you use the defaults, confirm that
   the `kata-skills` and `gemba-skills` packs are installed.

8. **Control plane** — "Do you use the Forward Impact-hosted control plane, or
   do you self-host your own GitHub App?" Default: self-hosted. See
   [TRUST.md](https://github.com/forwardimpact/monorepo/blob/main/TRUST.md) for
   the trust model of each path. In **hosted** mode the workflows mint a
   short-lived installation token from the hosted OIDC service at run time. So
   the team does **not** configure `KATA_APP_ID` / `KATA_APP_PRIVATE_KEY`.
   Question 2 then needs only `ANTHROPIC_API_KEY`. Instead, set the
   `FIT_OIDC_URL` repository **variable** to the hosted OIDC URL before the
   first workflow run.

### Step 2: Generate Workflow Files

Write the scheduled roster to a single `.github/workflows/agent-shift.yml`
with `references/workflow-shift.md`. The matrix holds all selected agents. It
runs them in declaration order, one at a time. Write the storyboard and
coaching workflows from `references/workflow-facilitate.md` only when you
select `improvement-coach`. Use `forwardimpact/kata-agent` as the action and
pin it to a SHA. Resolve the `{{KATA_AGENT_REF}}` / `{{GEMBA_BOOTSTRAP_REF}}` /
`{{GEMBA_HARNESS_REF}}` / `{{GEMBA_WIKI_REF}}` placeholders per
[`workflow-shift.md` § Resolving action refs](references/workflow-shift.md#resolving-action-refs).
List the sibling's release tags with `gh api`. Pick the highest `vX.Y.Z` tag.
Emit `@<full-40-char-sha> # <tag>`. Never emit the mutable `v1` tag. If
resolution fails, stop and ask the operator.

Pair the pins with a `github-actions` Dependabot config. The pins then get
bump PRs and do not rot. Write `.github/dependabot.yml` (or merge this
entry into an existing one):

    version: 2
    updates:
      - package-ecosystem: "github-actions"
        directory: "/"
        schedule:
          interval: "weekly"

Emit the variant that matches question 8's mode: the **`## Template
(self-hosted)`** block (the default) or the **`## Template (hosted)`**
block. Each reference carries both. On hosted setup, remind the operator:
"Set the `FIT_OIDC_URL` repository variable to your hosted OIDC URL before
the first workflow run." The hosted blocks carry no `KATA_APP_PRIVATE_KEY`.

The matrix in `agent-shift.yml` carries one line per selected agent, in
producer → reviewer → shipper order (see `references/schedules.md`). Generate
the storyboard and coaching workflows only when you select `improvement-coach`.

Every template gates on the `KATA_KILLSWITCH` repository (or org) Actions
variable. The run fails when the variable holds a truthy value. A truthy value
is anything other than empty, `0`, `false`, `no`, or `off`. The `kata-agent`
workflows (shift, storyboard, coaching) pass
`killswitch: ${{ vars.KATA_KILLSWITCH }}` to the action. The action runs the
gate as its first internal step, before any token mint, checkout, or agent
work. The harness-based dispatch workflow mints its own token in the workflow,
so it keeps an inline `Kata killswitch` first step that halts before that mint.
The switch starts unset, so it has no effect until an operator sets it.

### Step 3: Generate agent-dispatch

If you select `product-manager`, ask: "Do you want agents to respond to PR
comments, issue comments, and discussions?" If yes, generate
`agent-dispatch.yml` from `references/workflow-dispatch.md`. Emit the
`## Template (hosted)` block in hosted mode (question 8). Otherwise emit
`## Template (self-hosted)`. The workflow does no prompt assembly. It passes
the event payload through `task-event`. The action composes the task.

If the operator wants discussion replies, also tell them to deploy the
ghbridge service before they point the App webhook URL at it. PR, issue, and
review events reach `agent-dispatch` directly through workflow triggers, and
they need no bridge. Discussion events arrive through the App webhook, and
they need a live ghbridge instance. Point the operator at the
[ghbridge README](https://github.com/forwardimpact/monorepo/blob/main/services/ghbridge/README.md)
for prerequisites, configuration, and the tunnel/webhook setup.

### Step 4: Verify

Setup is verified when the repository is green. Files on disk do not verify it:

- Validate every generated workflow parses as YAML.
- Run the repository's checks on a clean checkout. Never leave or ignore red CI.
- `gh secret list` — confirm the secrets and the named agent profiles resolve at
  run time (profiles committed, or gemba-bootstrap-installed from the pinned
  packs).
- Suggest a first run: `gh workflow run "Agent: Shift"`.

### Step 5: Report

Summarize what you created and the next steps:

- Customize agent profiles if you use the defaults
- Adjust schedules after you observe the first runs
- Emergency stop: set `KATA_KILLSWITCH` to a truthy value. Unset it to resume
- Read the [Kata Agent Team](https://www.kata.team/) site for the PDSA rhythm
