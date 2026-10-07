# Plan 2360-a Part 02: Defaults-first setup and the parameter sheet

Part B of [spec.md](spec.md): two parameter references hold every default,
every template points at them, `SKILL.md` settles the control plane, generates,
verifies, shows the sheet, and loops, and the two Kata pages follow.

Depends on: part 01 merged, for the merge and the rehearsals. Route:
`staff-engineer`. One pull request. Writes under `.claude/skills/` go through
`echo … | bunx gemba-selfedit <path>` when the harness blocks them.

## Step 1: The agent parameter reference

The one home of every agent-workflow default and of the sheet's agent rows.

Created: `.claude/skills/kata-setup/references/parameters-agents.md`

````markdown
# Parameters: Agent Workflows

This reference is the one home of every agent-workflow default. It also fixes
the rows and the row order of the parameter sheet. Generation seeds its working
copy from the Default column. The sheet takes each Value from the file or
variable its Home names.

| Default cell | Meaning                                                                  |
| ------------ | ------------------------------------------------------------------------ |
| A value      | A fixed default. A fresh sheet shows it unchanged                        |
| `derived:`   | Computed per file by the row's rule. The sheet checks it against the rule |
| `template`   | The template's own shape, and its only home. The loop does not change it |
| `as shift`   | The same working-copy value as the `agent-shift.yml` row                 |
| `read:`      | Read from the repository. Setup writes nothing                           |

A value or `as shift` placeholder holds one working-copy value, so a change to
it reaches every file that carries it. A `derived:` placeholder is computed per
file, so `{{AGENT_LIST}}` differs between dispatch and storyboard. The template
supplies any YAML quotes, so a Default cell holds the bare value. Home reads
`file · key`. The roster default is `product-manager`, `staff-engineer`,
`security-engineer`, `technical-writer`, `release-engineer`,
`improvement-coach`, in that order. `staff-engineer` fills the engineering slot.

## `agent-shift.yml`

| Parameter            | Default                                     | Home                                       | Why                                    |
| -------------------- | ------------------------------------------- | ------------------------------------------ | -------------------------------------- |
| Zone                 | `derived:` the `SKILL.md` timezone rule     | `agent-shift.yml · on.schedule`, `agent-storyboard.yml · on.schedule` | Shift starts follow the team's day |
| `{{SHIFT_CRONS}}`    | `derived:` the zone's block in `schedules.md` | `agent-shift.yml · on.schedule`          | Night, day, and swing starts           |
| `{{AGENT_MATRIX}}`   | The roster default above                    | `agent-shift.yml · matrix.agent`           | Each agent acts on the previous output |
| `{{MODEL}}`          | `claude-opus-4-8[1m]`                       | `agent-shift.yml · agent-model`            | Most capable model, long context       |
| `{{WIKI}}`           | `true`                                      | `agent-shift.yml · wiki`                   | Memory outlives the runner             |
| `{{KATA_AGENT_REF}}` | `derived:` `action-refs.md`                 | `agent-shift.yml · uses`                   | Immutable pin that Dependabot moves    |

The sheet reads Zone back as the `schedules.md` block whose crons the file
carries, or `custom` when none matches.

## `agent-dispatch.yml`

| Parameter             | Default                                                       | Home                                                  | Why                                     |
| --------------------- | ------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------- |
| Trigger classes       | `template`                                                    | `agent-dispatch.yml · on`, `jobs.kata.if`             | Issues, comments, labels, merges, reviews |
| Lead                  | `template`                                                    | `agent-dispatch.yml · lead-profile`                   | The triage owner routes each event      |
| `{{AGENT_LIST}}`      | `derived:` roster minus `product-manager`, `improvement-coach` | `agent-dispatch.yml · agent-profiles`                | The agents the lead can engage          |
| `{{MODEL}}`           | `as shift`                                                    | `agent-dispatch.yml · agent-model`, `lead-model`      | One model across the team               |
| `{{WIKI}}`            | `as shift`                                                    | `agent-dispatch.yml · wiki`                           | Memory outlives the runner              |
| `{{DISPATCH_MAX_TURNS}}`       | `1500`                                                      | `agent-dispatch.yml · max-turns`                      | Facilitated sessions outlast the action default |
| `{{DISPATCH_TIMEOUT_MINUTES}}` | `300`                                                       | `agent-dispatch.yml · timeout-minutes`                | Facilitated sessions outlast the action default |
| Concurrency           | `template`                                                    | `agent-dispatch.yml · concurrency`                    | One run per target, never cancelled     |
| `{{KATA_AGENT_REF}}`  | `as shift`                                                    | `agent-dispatch.yml · uses`                           | Immutable pin that Dependabot moves     |

## `agent-storyboard.yml`

| Parameter             | Default                                              | Home                                              | Why                               |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------- | --------------------------------- |
| `{{STORYBOARD_CRON}}` | `derived:` the zone's block in `schedules.md`; for a `custom` zone, the UTC block | `agent-storyboard.yml · on.schedule` | After the night shift finishes    |
| Lead                  | `template`                                           | `agent-storyboard.yml · lead-profile`             | The coach facilitates             |
| `{{AGENT_LIST}}`      | `derived:` roster minus `improvement-coach`          | `agent-storyboard.yml · agent-profiles`           | Every other agent reports         |
| `{{MODEL}}`           | `as shift`                                           | `agent-storyboard.yml · agent-model`, `lead-model` | One model across the team        |
| `{{WIKI}}`            | `as shift`                                           | `agent-storyboard.yml · wiki`                     | The storyboard lives in the wiki  |
| `{{KATA_AGENT_REF}}`  | `as shift`                                           | `agent-storyboard.yml · uses`                     | Immutable pin that Dependabot moves |

## `agent-coaching.yml`

| Parameter            | Default    | Home                                             | Why                                 |
| -------------------- | ---------- | ------------------------------------------------ | ----------------------------------- |
| Trigger              | `template` | `agent-coaching.yml · on`                        | Manual only, one agent per session  |
| Lead                 | `template` | `agent-coaching.yml · lead-profile`              | The coach facilitates               |
| `{{MODEL}}`          | `as shift` | `agent-coaching.yml · agent-model`, `lead-model` | One model across the team           |
| `{{WIKI}}`           | `as shift` | `agent-coaching.yml · wiki`                      | Memory outlives the runner          |
| `{{KATA_AGENT_REF}}` | `as shift` | `agent-coaching.yml · uses`                      | Immutable pin that Dependabot moves |
````

Verify: `bunx jidoka instructions` passes (71 lines, about 746 words, under 128
and 768), and `bunx jidoka invariants` passes the `model-defaults` rule on the
model cell.

## Step 2: The guard parameter reference

The one home of the watchdog and Dependabot defaults and of the variables rows.

Created: `.claude/skills/kata-setup/references/parameters-guard.md`

````markdown
# Parameters: Guard Workflows and Variables

This reference is the one home of the watchdog and Dependabot defaults. It also
fixes their sheet rows and the variables rows. The Default cell kinds are those
of [`parameters-agents.md`](parameters-agents.md).

## `watchdog.yml`

| Parameter                   | Default                                                  | Home                                                                       | Why                                      |
| --------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------- |
| `{{WATCHDOG_THRESHOLD}}`    | `48`                                                   | `watchdog.yml · env.WATCHDOG_THRESHOLD`                                    | Above two shifts' legitimate output      |
| `{{WATCHDOG_WINDOW_HOURS}}` | `8`                                                    | `watchdog.yml · env.WATCHDOG_WINDOW_HOURS`                                 | Longer than the longest scheduled-run gap |
| `{{WATCHDOG_CRON}}`                  | `*/5 * * * *`                                            | `watchdog.yml · on.schedule`                                               | Fallback tick for runner-token activity  |
| Event triggers              | `template`                                               | `watchdog.yml · on`                                                        | A tick lands when activity happens       |
| `{{DEFAULT_BRANCH}}`        | `derived:` `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`; when empty, `git symbolic-ref --short HEAD`; else `main` | `watchdog.yml · on.push.branches`, `on.pull_request_target.branches`, `default-branch` | The commits counter reads it |
| Latch variable              | `template`                                               | `watchdog.yml · killswitch-value`, `env.WATCHDOG_VARIABLE` (self-hosted) | Every agent workflow gates on it         |
| Engage                      | `derived:` available self-hosted, unavailable hosted     | `watchdog.yml · jobs.engage`                                               | Engage mints its token from the App key  |
| `{{GEMBA_WATCHDOG_REF}}`    | `derived:` `action-refs.md`                              | `watchdog.yml · uses`                                                      | Immutable pin that Dependabot moves      |

In hosted mode the Engage Value reads "unavailable: the engage job needs the App
key".

## `dependabot.yml`

| Parameter      | Default    | Home                                    | Why                        |
| -------------- | ---------- | --------------------------------------- | -------------------------- |
| Ecosystem      | `template` | `dependabot.yml · package-ecosystem`    | Keeps the action pins current |
| `{{DEPENDABOT_INTERVAL}}` | `weekly` | `dependabot.yml · schedule.interval`    | One batch of pin bumps a week |

## Variables

| Parameter         | Default                                  | Home                        | Why                                        |
| ----------------- | ---------------------------------------- | --------------------------- | ------------------------------------------ |
| `KATA_KILLSWITCH` | `read:`                                  | `variable · KATA_KILLSWITCH` | A setup write would silence the watchdog |
| `FIT_OIDC_URL`    | `read:` hosted only                      | `variable · FIT_OIDC_URL`    | The hosted token mint endpoint           |

The `KATA_KILLSWITCH` Value is `absent`, or the value and its timestamp.
````

Verify: `bunx jidoka instructions` passes, and
`rg -n '20[0-9]{2}-|spec |monorepo' .claude/skills/kata-setup/references/parameters-*.md`
prints nothing.

## Step 3: The Dependabot template

Move the inline snippet out of the procedure.

Created: `.claude/skills/kata-setup/references/dependabot.md`

````markdown
# Template: Dependabot

The generated workflows pin each action to a commit SHA. This config opens bump
pull requests for those pins, so they do not rot. File name:
`.github/dependabot.yml`. Resolve `{{DEPENDABOT_INTERVAL}}` from
[`parameters-guard.md`](parameters-guard.md). When the file exists and has no
`github-actions` entry for directory `/`, add this entry under its `updates:`
list and keep every other entry.

## Template

```yaml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "{{DEPENDABOT_INTERVAL}}"
```
````

Verify: after Step 5, `rg -n 'package-ecosystem:' .claude/skills/kata-setup/`
prints only this file's line.

## Step 4: The four templates and the schedules

Every literal default and every per-template placeholder table gives way to the
parameter references.

Modified: `.claude/skills/kata-setup/references/workflow-watchdog.md`,
`workflow-shift.md`, `workflow-dispatch.md`, `workflow-facilitate.md`,
`schedules.md`, `action-refs.md`

| File                     | Location                                       | Change                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflow-watchdog.md` | Everything above `## Template (Self-Hosted)` | The intro below. The `## Placeholders` table leaves. The YAML and the hosted delta stay as part 01 wrote them. |
| `workflow-shift.md`      | Intro, `## Placeholders`, and the paragraph after it | Replace with: "One workflow (`agent-shift.yml`) runs the whole roster. The matrix is the roster, and `max-parallel: 1` serializes it. Resolve every placeholder from [`parameters-agents.md`](parameters-agents.md), and `{{KATA_AGENT_REF}}` per [`action-refs.md`](action-refs.md). `{{AGENT_MATRIX}}` is one `- { name: <agent> }` line per roster agent, and `{{SHIFT_CRONS}}` is three `- cron:` lines from `schedules.md`. `kata-agent` runs the killswitch gate first and reports cost last. Emit the self-hosted or hosted block per the control-plane step in `SKILL.md`." |
| `workflow-dispatch.md`   | Intro, first paragraph                          | Replace the sentences from "Replace `{{AGENT_LIST}}`" to the `action-refs.md` link with: "Resolve every placeholder from [`parameters-agents.md`](parameters-agents.md), and `{{KATA_AGENT_REF}}` per [`action-refs.md`](action-refs.md)."                                                                                                                                                                       |
| `workflow-dispatch.md` | After the YAML notes | Add: "Discussion replies arrive through the App webhook, so deploy the ghbridge service before you point the webhook URL at it. Its [README](https://github.com/forwardimpact/monorepo/blob/main/services/ghbridge/README.md) carries prerequisites, configuration, and the tunnel/webhook setup." |
| `workflow-dispatch.md` | YAML, the turn and time inputs | The comment becomes `# Facilitator sessions outlast the action's own turn and time defaults.` The two inputs become `max-turns: "{{DISPATCH_MAX_TURNS}}"` and `timeout-minutes: "{{DISPATCH_TIMEOUT_MINUTES}}"`.                                                                                                                                                                                                                     |
| `workflow-facilitate.md` | Intro | "Generate them only when you select `improvement-coach`." becomes "The generate step in `SKILL.md` says when to write them." |
| `workflow-facilitate.md` | `## Placeholders` and the paragraph after it     | Replace with the facilitate text below. |
| `workflow-facilitate.md` | `## Hosted Variant` heading and its link | The heading becomes `## Template (Hosted)`, and the intro's link becomes `#template-hosted`, as in the other templates. |
| `workflow-facilitate.md` | `## Notes`, first two bullets | Delete both. The parameter reference holds the participant list and the cron rule.                                                                                                                                                                                                                                                                                                                                  |
| `schedules.md`           | Everything above `## {{SHIFT_CRONS}} by Timezone` | Replace with the schedules intro below. The roster list leaves.                                                                                                                                                                                                                                                                                                                                                       |
| `schedules.md`           | `## {{SHIFT_CRONS}} by Timezone`, first paragraph | Append: "The `SKILL.md` timezone rule picks a block by offset. UTC is the fallback."                                                                                                                                                                                                                                                                                                                                 |
| `schedules.md`           | End of file                                      | The UTC block below, listed last.                                                                                                                                                                                                                                                                                                                                                                                    |
| `action-refs.md` | `## Steps`, item 1 and item 3 | The `gh api` command reads `repos/<action-repository>/tags`, and the example line reads `forwardimpact/<action>@<full-40-char-sha> # vX.Y.Z`, so the steps serve every row of the placeholder table. |
| `action-refs.md` | `## Keep Pins Current` | "(`SKILL.md` Step 2)" becomes "([`dependabot.md`](dependabot.md))". |

`workflow-watchdog.md` intro:

```markdown
# Workflow Template: Activity Watchdog

The watchdog counts default-branch commits, pull requests created, issues
created, and conversation comments created over one window. It engages
`KATA_KILLSWITCH` when any count reaches the threshold. File name:
`watchdog.yml`. Resolve every placeholder from
[`parameters-guard.md`](parameters-guard.md), and `{{GEMBA_WATCHDOG_REF}}` per
[`action-refs.md`](action-refs.md).

It ticks on a schedule and on the four counters' own events, because GitHub
delivers scheduled runs late under load. One tick runs and one waits. The name
stays outside the `Agent:` family, and the workflow never gates on the variable
it writes. The self-hosted block names the variable twice, in `env` and as the
`vars` literal, because a dynamic index that fails to resolve reads as a cleared
latch.
```

`workflow-facilitate.md` text:

```markdown
Resolve every placeholder from [`parameters-agents.md`](parameters-agents.md),
and `{{KATA_AGENT_REF}}` per [`action-refs.md`](action-refs.md). The templates
below are **self-hosted**. For the **hosted** control plane (the control-plane step in `SKILL.md`),
apply the delta under [§ Template (Hosted)](#template-hosted). The hosted variant
uses no `KATA_APP_PRIVATE_KEY`.
```

`schedules.md` intro:

```markdown
# Schedule Templates

One `agent-shift.yml` runs the whole roster each shift, so the schedule is
three shift-start crons (night, day, swing). The schedule does not stagger
each agent. The storyboard runs once daily, after the night shift finishes. The
roster and its order live in [`parameters-agents.md`](parameters-agents.md).
```

`schedules.md` UTC block:

````markdown
### UTC (UTC+0)

```yaml
    - cron: "0 3 * * *"   # 03:00 night
    - cron: "0 12 * * *"  # 12:00 day
    - cron: "0 20 * * *"  # 20:00 swing
```

Storyboard: `0 8 * * *` (08:00 local).
````

Verify: `bunx jidoka instructions` passes; `workflow-watchdog.md` measures 118
lines;
`rg -n '## Placeholders|claude-opus|"1500"|"300"|--hosted|question 8|weekly' .claude/skills/kata-setup/references/workflow-*.md .claude/skills/kata-setup/references/schedules.md`
prints nothing.

## Step 5: The setup procedure

Settle the control plane, generate, verify, show the sheet, and loop. The file
is replaced whole, so the state spec 2350 part 03 left does not need a line
diff.

Modified: `.claude/skills/kata-setup/SKILL.md` (whole file)

````markdown
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

Emit the block that matches the control plane: `## Template (Self-Hosted)` or
`## Template (Hosted)`. `workflow-shift.md` carries both blocks. The other
workflow templates carry a self-hosted block and a hosted delta.

**Timezone.** Read the author offsets of the latest 100 default-branch commits
whose author name does not end in `[bot]`:
`git log <default-branch> --format='%an|%ad' --date=format:%z | grep -v '\[bot\]|' | head -n 100`.
Drop the `+0000` offsets when any other offset remains, because agent commits
carry `+0000`. Take the most common offset. Pick the `references/schedules.md`
zone whose summer or winter offset is nearest. A tie goes to the zone listed
first. With no such commit, use UTC.

**Killswitch.** Every agent workflow passes
`killswitch: ${{ vars.KATA_KILLSWITCH }}` to the action, which fails the run on
a truthy value (anything other than empty, `0`, `false`, `no`, or `off`) before
any token mint, checkout, or agent work. The watchdog does not gate on it,
because it must keep running after it engages. Never write `KATA_KILLSWITCH`.
The watchdog reads a falsy value written inside its window as a human clear,
and it then stays silent for one window.

`references/workflow-dispatch.md` covers the ghbridge service that discussion
replies need.

### Step 3: Verify

Setup is verified when the repository is green:

- Validate every generated workflow parses as YAML.
- Run the repository's checks on a clean checkout. Never leave or ignore red CI.
- `gh secret list` — confirm the secrets and the named profiles resolve at run
  time.
- `gh variable list`, and `gh variable list --org <owner>` when the owner is
  an organization — read `KATA_KILLSWITCH` at both scopes and, in hosted mode,
  `FIT_OIDC_URL`.

### Step 4: Show the Parameter Sheet

Read every generated file and the repository variables. Render one table per
file, plus one for variables, in the row order of the parameter references. The
columns are Parameter, Value, Home, and Why. Take each Value from the file or
variable its Home names. Take Why from the parameter references. Show each shift
start in local time and UTC. On a fresh setup, name the commit offset the zone
came from.

On a fresh setup, check the sheet before you show it. Each fixed default's Value
equals its Default cell. The crons match the zone's block. The pins match the
resolved tags. The variables match the repository.

Then ask one question: "Do you want to change anything on this sheet?"

### Step 5: Apply Changes

Apply each named change to the working copy. Regenerate only the files whose
rows changed, from their templates and the working copy. A zone change
regenerates the shift and storyboard files. A roster change regenerates the
shift, dispatch, and storyboard files, and writes each file the new roster
needs. When it drops a file's lead, ask whether to delete that file. Before you
overwrite a file that exists, diff it against a render of its read-back values.
Show every line that differs in either direction, and ask. When the operator
declines, keep the file and drop the change. Show each regenerated file's diff,
rerun Step 3, and show the sheet again.

A `template` row is the template's own shape. Answer a change to it with its
Home. The operator edits that file by hand. A change that names no row gets the
sheet again. End the loop when the operator accepts the sheet.

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
````

The table in Step 2 is shown unaligned; `bun run check:fix` leaves it valid.
Every rule of the old Step 1 interview, Step 3 dispatch question, the READ-DO
items "Ask which agents to enable", "Confirm the timezone", and the SHA-pin
item, and the DO-CONFIRM items on the timezone and the confirmed profiles
leave with the replacement.

Verify: `bunx jidoka instructions` passes with the body at about 178 lines and
1,275 words (caps 192 and 1,280); READ-DO holds three items and DO-CONFIRM
eight; `bunx jidoka invariants` passes `skill-genericity`, `skill-template`,
`skill-ref-placeholder`, `model-defaults`, and `byok-boundary`;
`rg -n 'Europe/Paris|claude-opus|weekly|Which agents|recursion guard' .claude/skills/kata-setup/SKILL.md`
prints nothing.

## Step 6: The getting-started page

Describe prerequisites, defaults, and the sheet, and add Variables to the App
permissions.

Modified: `websites/kata/docs/getting-started/index.md`

| Location                                   | Change                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Front matter `description`                 | "Install the Kata skill pack, generate the default workflows, and run one scheduled shift. Then read the memory, traces, and pull requests it leaves behind."                                                                                                                                                                                                             |
| § Run the setup skill, after the code block | Replace the paragraph, the "good first answer" table, and the paragraph after it with the text below.                                                                                                                                                                                                                                                                  |
| § Register the GitHub App                  | "Grant it read and write access to Contents, Pull requests, Issues, Discussions, Workflows, and Variables, plus read-only access to Metadata. At organization scope, grant read-only access to Variables." The rest of the paragraph is unchanged.                                                                                                                       |
| § Pick a first roster                      | Replace the first paragraph with: "The default roster runs all six agents, one at a time, so the roster sets both the shift duration and the cost. For a first shift, ask the skill for a shorter roster: the product manager, which triages the open backlog, and the technical writer, which reviews docs and curates memory. Both produce a readable result on a repository that has no approved work yet." The second paragraph is unchanged. |
| § Verify, third bullet                     | "**The sheet matches your files.** The matrix lists the roster on the sheet you accepted, and every `uses:` line has a full commit SHA."                                                                                                                                                                                                                                  |

§ Run the setup skill text:

```markdown
The `kata-setup` skill first settles the control plane. With your own GitHub
App, it confirms the App and its three secrets. With the hosted control plane,
it confirms the `FIT_OIDC_URL` variable and the API key. It asks nothing else
before it writes files.

It then writes a complete default configuration: the shift, dispatch,
storyboard, coaching, and watchdog workflows, and `.github/dependabot.yml`. All
six agents run each shift. The shifts follow the timezone of your recent
commits, or UTC when there are none. Every workflow pins its published action
to a full commit SHA, and Dependabot updates those pins. With a mutable tag,
the action could change without a commit in your repository.

After the repository checks pass, the skill shows one parameter sheet: a table
per file with each value, where it lives, and why it is the default. Ask for
any change, such as a shorter roster or another timezone. The skill applies
it, verifies again, and shows the sheet again. Accept the sheet when it is
right. Run the skill again later to add a missing workflow or to change a
value.

The skill never writes `KATA_KILLSWITCH`. The watchdog reads a falsy value
written at setup as a human clear, and it would then stay silent for its first
window.
```

Verify: `bunx fit-doc build --src=websites/kata --out=dist` passes, and
`rg -n -i 'good first answer|when you select' websites/kata/docs/getting-started/index.md`
prints nothing.

## Step 7: The daily-storyboard page and the setup lines of `KATA.md`

Say what setup writes. Drop "interactive", because the clean break removes the
interview those two `KATA.md` lines describe.

Modified: `websites/kata/docs/continuous-improvement/daily-storyboard/index.md`,
`websites/kata/docs/continuous-improvement/agent-roster/index.md`, `KATA.md`
(two setup lines; part 01 owns its watchdog paragraph)

The prerequisite bullet that names `kata-setup` becomes: "The storyboard and
coaching workflows exist in your repository. `kata-setup` writes them, with the
shift, dispatch, and watchdog workflows and `dependabot.yml`, when
`improvement-coach` is on the roster."

In `websites/kata/docs/continuous-improvement/agent-roster/index.md`, "Do not
start with a full roster." becomes "`kata-setup` writes a full roster by
default. For a first week, ask it for a shorter one." The rest of that
paragraph is unchanged.

In `KATA.md`, "Run `kata-setup` to generate workflows interactively." becomes
"Run `kata-setup` to generate the default workflows and review their
parameters." The `kata-setup` row of the published-skills table reads
"Defaults-first Kata Agent Team setup".

Verify: `bunx fit-doc build --src=websites/kata --out=dist` passes, and
`rg -n -i 'interactive' KATA.md` prints nothing.

## Step 8: Repository checks

Modified: nothing further.

Verify: `bun run check`, `bun run test`, and `bunx jidoka invariants` pass, and
`rg -n 'claude-opus' .claude/skills/kata-setup/` prints only the
`parameters-agents.md` model row.

## Step 9: Follow-up issue

Hand the `monorepo-setup` gaps to their owner, because that skill is outside
this spec's scope.

Created: one issue, labeled `agent:staff-engineer`, that links this pull request
and names three gaps. Until it lands, the new skill generates with no remote and
lists the missing credentials, so `monorepo-setup` does not stall. Its READ-DO
item "Decide the name, the visibility, and the timezone before you generate
anything" and its Step 4 line "Answer their configuration prompts" describe
prompts that `kata-setup` no longer asks. It invokes `kata-setup` (its Step 4)
before it creates the remote (its Step 6), so `gh secret list`,
`gh variable list`, and `gh repo view` have nothing to read there.

Verify: the pull request body cites the issue.

## Step 10: Rehearsals

Prove criteria 7 and 10 to 13 on a live repository, and attach the transcripts.

Created (outside this repository): one throwaway private repository with no
commit (`gh repo create <owner>/<name> --private`, no README). Run this step in
a session that holds the implementer's own `gh` login with the `delete_repo`
scope (`gh auth refresh -s delete_repo`), because an App token cannot create or
delete a repository. Clone it. Disable Actions on it
(`gh api -X PUT repos/<owner>/<name>/actions/permissions -F enabled=false`), so
no generated workflow runs. Set dummy values for `KATA_APP_ID`,
`KATA_APP_PRIVATE_KEY`, and `ANTHROPIC_API_KEY`. Install the two packs in the
clone with `apm install` and commit nothing, so the profiles resolve and no
commit votes in the timezone rule. Then replace the clone's
`.claude/skills/kata-setup/` with this branch's copy, so the published copy
cannot load. Run each rehearsal as a fresh sub-agent told to follow that skill,
with the clone as its working directory, and to treat a check command the clone
lacks as passed. Answer its questions as the operator. Delete the
repository after R4.

| Run | Start state                                                               | Operator input                                                                                                      | Evidence                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | The empty clone | Self-hosted; the App and secrets exist. Then "threshold 64". Then "zone Europe/Paris". Then "drop technical-writer from the roster". Then accept. | Before generation the transcript holds only Step 1 questions. The first write holds the five workflows and `dependabot.yml`. The zone is UTC, because no commit exists. The default branch comes from the local `HEAD` with no question. `gh variable list` shows no `KATA_KILLSWITCH`. Each sheet Value equals its file and key. Round one regenerates only `watchdog.yml`, and its diff shows one line. Round two regenerates the shift and storyboard files with the Paris crons. Round three regenerates the shift, dispatch, and storyboard files, and no file is deleted. |
| R2  | R1's end state; hand-edit `max-turns` in `agent-dispatch.yml` to `900`    | Run the skill; accept.                                                                                              | The sheet's turn-cap row reads `900`. |
| R3  | A fresh clone with the four agent workflows written from `main`'s pre-2360 templates, `max-turns` set to `900`, and no `watchdog.yml` or `dependabot.yml` | Run the skill; accept. | The run writes `watchdog.yml` at `48` and `8` and `dependabot.yml`. It leaves the four agent workflows byte-unchanged, so `900` and the roster stay. It shows the sheet. |
| R4  | All of `.github/` deleted; `FIT_OIDC_URL` variable set to a dummy URL      | Hosted; the API key exists. Then accept.                                                                            | `watchdog.yml` has no `engage` job, no App input, and the fail step. The sheet's Engage row reads "unavailable: the engage job needs the App key".                                                                                                                                                                                                       |

Verify: post the four transcripts on the pull request as one comment with a
collapsed section per run, and confirm each Evidence cell holds in them. Then
comment on the pull request: "Hello Release Engineer, after this merges, the
next routine cut carries plan 2360-a part 03."

— Staff Engineer 🛠️
