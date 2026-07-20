---
name: kata-interview
description: >
  Conduct a JTBD switching interview to test one of the repository's
  products.
  Build a persona grounded in the installation's synthetic content with
  the situation drawn from the chosen JTBD entry, hand the job to the
  agent at the public website in two Ask calls, and capture findings as
  GitHub issues classified against the job.
---

# Switching Interview

A **JTBD switching interview**: an agent, briefed only with a persona, tries
to get a chosen Job To Be Done done using one of the repository's products
they meet cold at the public website. The agent is isolated with no
repository access. You run in the repository root with `JTBD.md`, the
synthetic `data/` from `fit-terrain build`, and project context — use them
to stage, craft, and verify, but never leak.

## When to Use

- You are running the `kata-interview` workflow.
- The task may include `Product:` and/or `Job:` overrides; otherwise pick.

This skill is not part of scheduled runs.

## LLM Availability

`ANTHROPIC_API_KEY` is in the shell and the products read it. LLM-backed
products work zero-config; if the agent asks for a key, that is a **bug**. Do
not tell the agent the key is pre-configured.

## Checklists

<read_do_checklist goal="Protect the interview before briefing the agent">

- [ ] Persona identity drawn from synthetic content (per Step 4) — not invented.
- [ ] Persona situation drawn from the chosen JTBD entry (per Step 4).
- [ ] Job text appears only in Ask 2 — never in `CLAUDE.md`.
- [ ] No product names in the persona file or in supervisor-authored Ask
      templates; product-named environment variables required by the production
      CLI are permitted in the agent's environment.
- [ ] Workspace staged per Step 3; `CLAUDE.md` written before Ask 1.
- [ ] No leaks of repository internals, skills, or pre-configured tokens.
- [ ] Do not fix problems for the agent — friction is the signal.

</read_do_checklist>

<do_confirm_checklist goal="Close the interview cleanly">

- [ ] Session concluded after filing issues and writing the report.
- [ ] Findings classified against the JTBD (Big Hire, Little Hire,
      Anxiety, Competes With, Fired When).
- [ ] Each actionable finding filed as a GitHub issue naming the job.
- [ ] Memory log appended for the week.

</do_confirm_checklist>

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`, then run `gemba-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
The digest's `owned_priorities`, `claims`, and `storyboard_items` seed this
Process. Bias
product selection toward products not interviewed recently.

### Step 1: Pick the Product

If the task includes `Product:`, use it. Otherwise pick one of the
repository's products that has a `<job>` entry in `JTBD.md`.

### Step 2: Pick the Job

Read `JTBD.md`. Find every `<job>` entry whose **Big Hire** or **Little
Hire** line names the chosen product (e.g. `→ **<Product>**`). If the
task includes `Job:`, match it against the `goal=` attribute; otherwise
pick one. Record the full block: `user`, `goal`, Trigger, Big Hire, Little
Hire, Competes With, Forces (Push, Pull, Habit, Anxiety), Fired When.

### Step 3: Stage the Agent Workspace

The workflow ran `fit-terrain build`. Copy the data subset the chosen
product needs into `$AGENT_CWD` — the product's own directory plus any
shared data it reads:
`cp -r data/<product> "$AGENT_CWD/data/<product>"` and similar. LLM-backed
products need nothing staged. For substrate-backed products the workflow's
substrate-setup step brings the substrate up and emits its URL/key — the
skill stages no substrate itself.

### Step 3a: Select the Persona (when a persona-select command is set)

Persona selection is driven by an injected command, not hardcoded here, so
the loop works for any substrate a consumer supplies.

- **`PERSONA_SELECT_COMMAND` set** — run it. Its contract: seal a persona
  identity (`.env` + `.substrate.json`) into `$AGENT_CWD` and stash a bare
  JWT for the post-run log scan (the agent has no `$RUNNER_TEMP` access).
  Read the persona it prints (name, team, manager, teammates, repos, and
  scenario) from the command's output for Step 4. On non-zero exit, write a
  diagnostic and exit the skill.
- **`PERSONA_SELECT_COMMAND` unset** — issue no JWT; build the persona
  identity from the synthetic content `fit-terrain build` produced (Step 4).

### Step 4: Craft the Persona

Write `$AGENT_CWD/CLAUDE.md`. The persona file carries **who** and **the
situation** — never the job. Two sources:

- **Identity** (name, team, manager, teammates, repos, recent project,
  company facts) — when a persona-select command ran (Step 3a), from the
  persona it printed. Otherwise from the synthetic content `fit-terrain
  build` produced.
- **Situation** (Trigger, Forces, Competes With) — from the chosen JTBD
  entry, rephrased into the persona's voice.

Excluded: goal sentence, Big Hire, Little Hire, Fired-When, product name.
Fired-When stays with you for Step 8 classification.

Template: [`references/persona-template.md`](references/persona-template.md).
Worked examples:
[`references/example-personas.md`](references/example-personas.md).

### Step 5: Initiate the Session

Hand off in **two `Ask` calls** so persona and job both surface inline in
the trace. **Ask 1** opens with an introduction prompt; the agent's
`Answer` brings the persona, Trigger, and Forces inline. **Ask 2**
delivers the job (Big Hire + Little Hire as the persona's own want) and the
entry point. Read the entry point from `WEBSITE_URL` in the environment; if
it is unset, write a diagnostic and exit the skill.

Templates and worked examples:
[`references/job-handoff.md`](references/job-handoff.md). If the task
carries steering not matching `Product:` / `Job:`, append it to Ask 2.

### Step 6: Supervise

| Agent State              | Your Response                              |
| ------------------------ | ------------------------------------------ |
| Making progress          | Short encouragement                        |
| Stuck on a specific step | Answer the specific question, in character |
| Going down a dead end    | Nudge toward the documented path           |
| Looping without progress | Targeted guidance                          |
| Job done or abandoned    | Proceed to Step 7                          |

Short reply messages, not further `Ask` calls — only Step 5 uses two Asks.
Use repository access to verify observations, but never feed verification
back to the agent.

### Step 7: Transition to Post-Interview

Once done or abandoned, stop Asking and do Steps 8–9 yourself with your own
Bash and repository checkout — never delegate wrap-up to the agent (it breaks
isolation). Conclude only after filing issues and writing the report.

### Step 8: Capture Findings

Review the agent's output. For each distinct finding, note against the
JTBD: was the **Big Hire** reached? **Little Hire** experienced? Did
**Anxiety** land? Did **Competes With** look more attractive? Did any
**Fired When** condition surface?

Classify each for action:

| Category            | Criteria                              | Action                |
| ------------------- | ------------------------------------- | --------------------- |
| **Bug**             | Crashes, errors, wrong output         | Create bug issue      |
| **Product-aligned** | Missing feature serving the vision    | Create feature issue  |
| **Documentation**   | Unclear, missing, or outdated docs    | Create docs issue     |
| **Out of scope**    | Not actionable or outside the product | Skip — note in report |

For each actionable finding, with your own `gh`: extract; search for duplicates;
create a new issue or comment on a matching one (templates in
`../kata-product-issue/references/templates.md`) naming the JTBD job
(`<user>: <goal>`) in the body; add it to the report table with its issue
number, holding each body to
[Citation integrity](../../agents/x-citation-integrity.md).

### Step 9: Report

Final summary: product and job; whether the persona got it done; which JTBD
forces materialized; table of findings and issues created or updated.

## Memory: What to Record

Using your own Bash, append to the current week's log: product interviewed;
job (`<user>: <goal>`); outcome (done / abandoned / partial); forces observed
(Push/Pull/Habit/Anxiety/Competes/Fired); issue numbers + categories.
Append one metrics row per run to `wiki/metrics/{skill}/` per
`references/metrics.md`. See KATA.md § Metrics for recording eligibility.
