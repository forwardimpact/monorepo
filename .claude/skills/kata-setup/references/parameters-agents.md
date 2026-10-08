# Parameters: Agent Workflows

This reference is the one home of every agent-workflow default. It also fixes
the rows and the row order of the parameter sheet. Generation seeds its working
copy from the Default column. The sheet takes each Value from the file or
variable its Home names.

| Default cell | Meaning                                                                   |
| ------------ | ------------------------------------------------------------------------- |
| A value      | A fixed default. A fresh sheet shows it unchanged                         |
| `derived:`   | Computed per file by the row's rule. The sheet checks it against the rule |
| `template`   | The template's own shape, and its only home. The loop does not change it  |
| `as shift`   | The same working-copy value as the `agent-shift.yml` row                  |
| `read:`      | Read from the repository. Setup writes nothing                            |

A value or `as shift` placeholder holds one working-copy value, so a change to
it reaches every file that carries it. A `derived:` placeholder is computed per
file, so `{{AGENT_LIST}}` differs between dispatch and storyboard. The template
supplies any YAML quotes, so a Default cell holds the bare value. Home reads
`file · key`. A file that lacks a Home key shows `absent`, and the working copy
keeps the Default. The roster default is `product-manager`, `staff-engineer`,
`security-engineer`, `technical-writer`, `release-engineer`,
`improvement-coach`, in that order. `staff-engineer` fills the engineering slot.

## `agent-shift.yml`

| Parameter            | Default                                       | Home                                                                  | Why                                    |
| -------------------- | --------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------- |
| Zone                 | `derived:` the `SKILL.md` timezone rule       | `agent-shift.yml · on.schedule`, `agent-storyboard.yml · on.schedule` | Shift starts follow the team's day     |
| `{{SHIFT_CRONS}}`    | `derived:` the zone's block in `schedules.md` | `agent-shift.yml · on.schedule`                                       | Night, day, and swing starts           |
| `{{AGENT_MATRIX}}`   | The roster default above                      | `agent-shift.yml · matrix.agent`                                      | Each agent acts on the previous output |
| `{{MODEL}}`          | `claude-opus-4-8[1m]`                         | `agent-shift.yml · agent-model`                                       | Most capable model, long context       |
| `{{WIKI}}`           | `true`                                        | `agent-shift.yml · wiki`                                              | Memory outlives the runner             |
| `{{KATA_AGENT_REF}}` | `derived:` `action-refs.md`                   | `agent-shift.yml · uses`                                              | Immutable pin that Dependabot moves    |

The sheet reads Zone back as the `schedules.md` block whose crons the file
carries, or `custom` when none matches.

## `agent-dispatch.yml`

| Parameter                      | Default                                                        | Home                                             | Why                                             |
| ------------------------------ | -------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| Trigger classes                | `template`                                                     | `agent-dispatch.yml · on`, `jobs.kata.if`        | Issues, comments, labels, merges, reviews       |
| Lead                           | `template`                                                     | `agent-dispatch.yml · lead-profile`              | The triage owner routes each event              |
| `{{AGENT_LIST}}`               | `derived:` roster minus `product-manager`, `improvement-coach` | `agent-dispatch.yml · agent-profiles`            | The agents the lead can engage                  |
| `{{MODEL}}`                    | `as shift`                                                     | `agent-dispatch.yml · agent-model`, `lead-model` | One model across the team                       |
| `{{WIKI}}`                     | `as shift`                                                     | `agent-dispatch.yml · wiki`                      | Memory outlives the runner                      |
| `{{DISPATCH_MAX_TURNS}}`       | `1500`                                                         | `agent-dispatch.yml · max-turns`                 | Facilitated sessions outlast the action default |
| `{{DISPATCH_TIMEOUT_MINUTES}}` | `300`                                                          | `agent-dispatch.yml · timeout-minutes`           | Facilitated sessions outlast the action default |
| Concurrency                    | `template`                                                     | `agent-dispatch.yml · concurrency`               | One run per target, never cancelled             |
| `{{KATA_AGENT_REF}}`           | `as shift`                                                     | `agent-dispatch.yml · uses`                      | Immutable pin that Dependabot moves             |

## `agent-storyboard.yml`

| Parameter             | Default                                                                           | Home                                               | Why                                 |
| --------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------- |
| `{{STORYBOARD_CRON}}` | `derived:` the zone's block in `schedules.md`; for a `custom` zone, the UTC block | `agent-storyboard.yml · on.schedule`               | After the night shift finishes      |
| Lead                  | `template`                                                                        | `agent-storyboard.yml · lead-profile`              | The coach facilitates               |
| `{{AGENT_LIST}}`      | `derived:` roster minus `improvement-coach`                                       | `agent-storyboard.yml · agent-profiles`            | Every other agent reports           |
| `{{MODEL}}`           | `as shift`                                                                        | `agent-storyboard.yml · agent-model`, `lead-model` | One model across the team           |
| `{{WIKI}}`            | `as shift`                                                                        | `agent-storyboard.yml · wiki`                      | The storyboard lives in the wiki    |
| `{{KATA_AGENT_REF}}`  | `as shift`                                                                        | `agent-storyboard.yml · uses`                      | Immutable pin that Dependabot moves |

## `agent-coaching.yml`

| Parameter            | Default    | Home                                             | Why                                 |
| -------------------- | ---------- | ------------------------------------------------ | ----------------------------------- |
| Trigger              | `template` | `agent-coaching.yml · on`                        | Manual only, one agent per session  |
| Lead                 | `template` | `agent-coaching.yml · lead-profile`              | The coach facilitates               |
| `{{MODEL}}`          | `as shift` | `agent-coaching.yml · agent-model`, `lead-model` | One model across the team           |
| `{{WIKI}}`           | `as shift` | `agent-coaching.yml · wiki`                      | Memory outlives the runner          |
| `{{KATA_AGENT_REF}}` | `as shift` | `agent-coaching.yml · uses`                      | Immutable pin that Dependabot moves |
