---
name: kata-interview
description: >
  Conduct a JTBD switching interview to test one of the repository's
  products.
  Build a persona from the installation's synthetic content. Take the
  situation from the chosen JTBD entry. Hand the job to the agent at the
  public website in two Ask calls. Capture findings as GitHub issues and
  classify them against the job.
---

# Switching Interview

In a **JTBD switching interview**, an agent gets only a persona. It then
tries to get a chosen Job To Be Done done with one of the repository's
products. It meets that product cold at the public website. The agent
works in isolation with no repository access. You run in the repository
root with `JTBD.md`, the synthetic `data/` from `fit-terrain build`, and
project context. Use them to stage, craft, and verify. Never leak them.

## When to Use

- You run the `kata-interview` workflow.
- The task may include `Product:` and/or `Job:` overrides. Otherwise pick.

This skill is not part of scheduled runs.

## LLM Availability

`ANTHROPIC_API_KEY` is in the shell and the products read it. LLM-backed
products work zero-config. If the agent asks for a key, that is a **bug**.
Do not tell the agent the key is pre-configured.

## Checklists

<read_do_checklist goal="Protect the interview before briefing the agent">

- [ ] Draw the persona identity from synthetic content (per Step 4). Never
      invent it.
- [ ] Draw the persona situation from the chosen JTBD entry (per Step 4).
- [ ] Put the job text only in Ask 2. Never put it in `CLAUDE.md`.
- [ ] Use no product names in the persona file or in supervisor-authored Ask
      templates. The agent's environment may hold product-named environment
      variables that the production CLI needs.
- [ ] Stage the workspace per Step 3. Write `CLAUDE.md` before Ask 1.
- [ ] Leak no repository internals, skills, or pre-configured tokens.
- [ ] Do not fix problems for the agent. Friction is the signal.

</read_do_checklist>

<do_confirm_checklist goal="Close the interview cleanly">

- [ ] Conclude the session after you file the issues and write the report.
- [ ] Classify the findings against the JTBD (Big Hire, Little Hire,
      Anxiety, Competes With, Fired When).
- [ ] File each actionable finding as a GitHub issue that names the job.
- [ ] Append the memory log for the week.

</do_confirm_checklist>

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`, then run `gemba-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
The digest's `owned_priorities`, `claims`, and `storyboard_items` seed this
Process. Prefer products you did not interview recently.

### Step 1: Pick the Product

If the task includes `Product:`, use it. Otherwise pick one of the
repository's products that has a `<job>` entry in `JTBD.md`.

### Step 2: Pick the Job

Read `JTBD.md`. Find every `<job>` entry whose **Big Hire** or **Little
Hire** line names the chosen product (e.g. `→ **<Product>**`). If the task
includes `Job:`, match it against the `goal=` attribute. Otherwise pick one.
Record the full block: `user`, `goal`, Trigger, Big Hire, Little Hire,
Competes With, Forces (Push, Pull, Habit, Anxiety), Fired When.

### Step 3: Stage the Agent Workspace

The workflow ran `fit-terrain build`. Copy the data subset the chosen
product needs into `$AGENT_CWD`. That subset is the product's own directory
plus any shared data it reads:
`cp -r data/<product> "$AGENT_CWD/data/<product>"` and similar. LLM-backed
products need no staged data. For substrate-backed products, the workflow's
substrate-setup step brings the substrate up and emits its URL/key. The
skill stages no substrate itself.

### Step 3a: Select the Persona (when a persona-select command is set)

An injected command drives persona selection. This skill does not hardcode
it. The loop then works for any substrate a consumer supplies.

- **`PERSONA_SELECT_COMMAND` set** — run it. Its contract: seal a persona
  identity (`.env` + `.substrate.json`) into `$AGENT_CWD` and stash a bare
  JWT for the post-run log scan. The agent has no `$RUNNER_TEMP` access.
  Read the persona it prints (name, team, manager, teammates, repos, and
  scenario) from the command's output for Step 4. On non-zero exit, write a
  diagnostic and exit the skill.
- **`PERSONA_SELECT_COMMAND` unset** — issue no JWT. Build the persona
  identity from the synthetic content `fit-terrain build` produced (Step 4).

### Step 4: Craft the Persona

Write `$AGENT_CWD/CLAUDE.md`. The persona file carries **who** and **the
situation**. It never carries the job. Two sources:

- **Identity** (name, team, manager, teammates, repos, recent project,
  company facts) — take it from the persona that a persona-select command
  printed (Step 3a). Otherwise take it from the synthetic content
  `fit-terrain build` produced.
- **Situation** (Trigger, Forces, Competes With) — take it from the chosen
  JTBD entry. Rephrase it into the persona's voice.

Exclude these: goal sentence, Big Hire, Little Hire, Fired-When, product
name. Fired-When stays with you for the Step 8 classification.

Template: [`references/persona-template.md`](references/persona-template.md).
Worked examples:
[`references/example-personas.md`](references/example-personas.md).

### Step 5: Initiate the Session

Hand off in **two `Ask` calls** so persona and job both surface inline in
the trace. **Ask 1** opens with an introduction prompt. The agent's
`Answer` brings the persona, Trigger, and Forces inline. **Ask 2**
delivers the job (Big Hire + Little Hire as the persona's own want) and the
entry point. Read the entry point from `WEBSITE_URL` in the environment. If
it is unset, write a diagnostic and exit the skill.

Templates and worked examples:
[`references/job-handoff.md`](references/job-handoff.md). If the task
carries steering other than `Product:` / `Job:`, append it to Ask 2.

### Step 6: Supervise

| Agent State                           | Your Response                              |
| ------------------------------------- | ------------------------------------------ |
| The agent makes progress              | Short encouragement                        |
| The agent is stuck on a specific step | Answer the specific question, in character |
| The agent goes down a dead end        | Nudge toward the documented path           |
| The agent loops without progress      | Targeted guidance                          |
| The job is done or abandoned          | Proceed to Step 7                          |

Send short reply messages. Do not send further `Ask` calls. Only Step 5
uses two Asks. Use repository access to verify observations. Never feed
verification back to the agent.

### Step 7: Transition to Post-Interview

Once the job is done or abandoned, send no more Asks. Do Steps 8–9 yourself
with your own Bash and repository checkout. Never delegate wrap-up to the
agent. Delegation breaks isolation. Conclude only after you file the issues
and write the report.

### Step 8: Capture Findings

Review the agent's output. For each distinct finding, note against the JTBD
whether the agent reached the **Big Hire** and experienced the **Little
Hire**. Also note whether the agent felt the **Anxiety**, found **Competes
With** more attractive, or hit any **Fired When** condition.

Classify each for action:

| Category            | Criteria                               | Action                  |
| ------------------- | -------------------------------------- | ----------------------- |
| **Bug**             | Crashes, errors, wrong output          | Create bug issue        |
| **Product-aligned** | Missing feature that serves the vision | Create feature issue    |
| **Documentation**   | Unclear, missing, or outdated docs     | Create docs issue       |
| **Out of scope**    | Not actionable or outside the product  | Skip and note in report |

For each actionable finding, use your own `gh`. Extract it. Search for
duplicates. Create a new issue, or comment on an issue that matches.
Templates are in `../kata-product-issue/references/templates.md`. Name the
JTBD job (`<user>: <goal>`) in the body. Add the finding to the report
table with its issue number. Hold each body to
[Citation integrity](../../agents/x-citation-integrity.md).

### Step 9: Report

Write a final summary. Give the product, the job, and whether the persona
got it done. Name which JTBD forces materialized. Add a table of findings
with the issues you created or updated.

## Memory: What to Record

Use your own Bash. Append to the current week's log: the product you
interviewed; the job (`<user>: <goal>`); the outcome (done / abandoned /
partial); the forces you observed (Push/Pull/Habit/Anxiety/Competes/Fired);
issue numbers + categories. Append one metrics row per run to
`wiki/metrics/{skill}/` per `references/metrics.md`. See KATA.md § Metrics
for recording eligibility.
