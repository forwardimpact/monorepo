---
name: kata-setup
description: >
  Set up the Kata Agent Team in your repository. This skill settles the GitHub
  App or hosted control plane and the secrets. It then generates a complete
  default configuration and shows its parameters on one sheet. Use it to set up
  a new Kata installation. Use it to add agents or change parameters on an
  existing installation.
---

# Set Up the Kata Agent Team

This skill configures the [Kata Agent Team](https://www.kata.team/) in your
repository. It settles the control plane, writes a complete default
configuration, verifies it, and shows one parameter sheet.

## When to Use

- Set up Kata for the first time in a new repository
- Add agents, or a missing workflow, to an existing Kata installation
- Change schedules, models, the roster, or the watchdog numbers

## Prerequisites

- Node.js 22+
- GitHub repository with Actions enabled
- Anthropic API key
- `apm install forwardimpact/kata-skills`
- `apm install forwardimpact/gemba-skills`

## Checklists

<read_do_checklist goal="Settle the prerequisites before generating files">

- [ ] Settle the control plane and its credentials first. Ask no other
      question before generation.
- [ ] Use npm/npx in all generated content. Never use bun/bunx/just.
- [ ] Read
      [TRUST.md](https://github.com/forwardimpact/monorepo/blob/main/TRUST.md).
      It describes the hosted and self-hosted trust model the operator accepts.

</read_do_checklist>

<do_confirm_checklist goal="Verify generated workflows before reporting">

- [ ] Every generated workflow file uses the published action. No file uses a
      local path.
- [ ] Action refs are SHA-pinned to a release-tag commit
      (`@<full-sha> # <tag>`), never a mutable tag. A `github-actions`
      Dependabot entry exists in the consuming repo.
- [ ] Secret reference names match the names you configured.
- [ ] `agent-shift.yml` lists every roster agent in the matrix. It serializes
      them with `max-parallel: 1`.
- [ ] The dispatch workflow does no prompt assembly. It passes
      `task-event: ${{ github.event_path }}`. The action names the actor in the
      task and runs the dispatch gate before checkout.
- [ ] Every generated agent workflow gates on the killswitch. The watchdog does
      not, by design. Setup wrote no value to `KATA_KILLSWITCH`.
- [ ] `watchdog.yml` carries the four event triggers and gates on nothing. A
      hosted `watchdog.yml` has no engage job.
- [ ] Every Value cell on the accepted sheet equals the file and key its Home
      names.

</do_confirm_checklist>

## Process

### Step 1: Settle the Control Plane

Ask only these questions before you write a file. Skip any question the task
prompt already answers.

1. **Control plane** — "Do you use the Forward Impact-hosted control plane, or
   do you self-host your own GitHub App?" Default: self-hosted. See
   [TRUST.md](https://github.com/forwardimpact/monorepo/blob/main/TRUST.md) for
   the trust model of each path.
2. **Self-hosted** — "Do you have a GitHub App for your agents, or should I help
   you create one?" If you create one, walk through `references/github-app.md`.
   Then confirm with `gh secret list` that `KATA_APP_ID`,
   `KATA_APP_PRIVATE_KEY`, and `ANTHROPIC_API_KEY` exist.
3. **Hosted** — The workflows mint a short-lived installation token from the
   hosted OIDC service at run time, so the team configures no App secrets.
   Confirm the `ANTHROPIC_API_KEY` secret, and the `FIT_OIDC_URL` repository
   **variable** with `gh variable list`.

When a credential is missing, help the operator add it. When the repository has
no remote yet, list each missing credential in the report and continue.

### Step 2: Generate the Default Configuration

Seed a working copy from the Default column of
`references/parameters-agents.md` and `references/parameters-guard.md`. On an
existing installation, overwrite the copy with the values its files carry.
Resolve every placeholder from the copy, and each action ref per
[`references/action-refs.md`](references/action-refs.md). Write each file the
repository lacks. Merge an existing `dependabot.yml` as `dependabot.md` says.
Change no other existing file before Step 5.

| File                                                       | Template                 | Written when                   |
| ---------------------------------------------------------- | ------------------------ | ------------------------------ |
| `.github/workflows/agent-shift.yml`                        | `workflow-shift.md`      | always                         |
| `.github/workflows/agent-dispatch.yml`                     | `workflow-dispatch.md`   | `product-manager` on roster    |
| `.github/workflows/agent-storyboard.yml`, `agent-coaching.yml` | `workflow-facilitate.md` | `improvement-coach` on roster |
| `.github/workflows/watchdog.yml`                           | `workflow-watchdog.md`   | always                         |
| `.github/dependabot.yml`                                   | `dependabot.md`          | always                         |

Emit the self-hosted templates, or apply each template's
`## Template (Hosted)` section in hosted mode.

**Timezone.** Read the author offsets of the latest 100 default-branch commits
whose author name does not end in `[bot]`:
`git log <default-branch> --format='%an|%ad' --date=format:%z | grep -v '\[bot\]|' | head -n 100`.
Drop `+0000` when any other offset remains, because agent commits carry it. Take
the most common offset. Pick the `references/schedules.md` zone whose summer or
winter offset is nearest. A tie goes to the zone listed first. With no such
commit, use UTC.

**Killswitch.** Every agent workflow passes
`killswitch: ${{ vars.KATA_KILLSWITCH }}` to the action, which fails the run on
a truthy value (anything other than empty, `0`, `false`, `no`, or `off`) before
any token mint, checkout, or agent work. The watchdog does not gate on it,
because it must keep running after it engages. Never write `KATA_KILLSWITCH`.
The watchdog reads a falsy value written inside its window as a human clear,
and it then stays silent for one window.

Discussion replies need the ghbridge service in `references/github-app.md`.

### Step 3: Verify

Setup is verified when the repository is green:

- Every generated workflow parses as YAML.
- Run the repository's checks on a clean checkout. Never leave or ignore red CI.
- `gh secret list` — confirm the secrets and the named profiles resolve at run
  time.
- `gh variable list`, plus `--org <owner>` for an organization — read
  `KATA_KILLSWITCH` at both scopes and, in hosted mode, `FIT_OIDC_URL`.

### Step 4: Show the Parameter Sheet

Read every file the sheet covers and the variables. Render one table per file,
plus one for variables, in the row order of the parameter references, with the
columns Parameter, Value, Home, and Why. Take each Value from the file
or variable its Home names. Take Why from the parameter references. Show each
shift start in local time and UTC. On a fresh setup, name the commit offset the
zone came from.

On a fresh setup, check the sheet before you show it. Each fixed default's Value
equals its Default cell. The crons match the zone's block. The pins match the
resolved tags. The variables match the repository.

Then ask one question: "Do you want to change anything on this sheet?"

### Step 5: Apply Changes

Apply each named change to the working copy. Regenerate only the files whose
rows changed, from their templates and the working copy. A zone change
regenerates the shift and storyboard files. A roster change regenerates the
shift, dispatch, and storyboard files and writes each file the new roster
needs. When it drops a file's lead, ask whether to delete that file.

Before you overwrite a file that exists, diff it against a render of its
read-back values. When any line differs, show it and ask. A no keeps that file
and leaves the change out of it. Show each regenerated file's diff, then rerun
Steps 3 and 4.

A `template` row is the template's own shape. Answer a change to it with its
Home, which the operator edits by hand. A change can name a whole file, which
regenerates it from its template under the same diff rule. A change that
names no row gets the sheet again. End the loop when the operator accepts.

### Step 6: Report

Summarize what you created and the next steps:

- Add each missing credential that Step 1 listed
- Customize agent profiles if you use the defaults
- Select trust policy and review rigor in an optional `.kata/settings.json`
  with the `kata-settings` skill
- Start the first shift: `gh workflow run "Agent: Shift"`
- Read the gaps between scheduled watchdog runs
  (`gh run list --workflow Watchdog --event schedule`) and the counts on their
  summaries. Then change the window or the threshold on the sheet
- Emergency stop: set `KATA_KILLSWITCH` truthy; write a falsy value to resume.
  A self-hosted watchdog engages it through the App's `Variables` grant
- Read the [Kata Agent Team](https://www.kata.team/) site for the PDSA rhythm
