---
name: kata-interview
description: >
  Conduct a JTBD switching interview to test a Forward Impact product.
  Build a persona grounded in the installation's synthetic content with
  the situation drawn from the chosen JTBD entry, hand the job to the
  agent at the public website in two Ask calls, and capture findings as
  GitHub issues classified against the job.
---

# Switching Interview

A **JTBD switching interview**: an agent, briefed only with a persona, tries
to get a chosen Job To Be Done done using a Forward Impact product they meet
cold at the public website. The agent is isolated with no monorepo access.
You run in the monorepo root with `JTBD.md`, the synthetic `data/` from
`fit-terrain build`, the `supabase` CLI, and project context — use them to
stage, craft, and verify, but never leak.

## When to Use

- You are running the `kata-interview` workflow.
- The task may include `Product:` and/or `Job:` overrides; otherwise pick.

This skill is not part of scheduled runs.

## LLM Availability

`ANTHROPIC_API_KEY` is present in the shell — `libconfig` reads it.
LLM-backed products (Guide, Outpost) should work zero-config. If the agent
is asked to supply a key, that is a **bug** — the zero-config promise is
broken. Do not tell the agent the key is pre-configured.

## Checklists

<read_do_checklist goal="Protect the interview before briefing the agent">

- [ ] Persona **identity** (name, team, manager, teammates, repos, project
      context, company facts) is drawn from the installation's synthetic
      content (`data/synthetic/` from `fit-terrain build`) — not invented.
- [ ] Persona **situation** (Trigger, Forces, Competes With) taken from
      the chosen JTBD entry and rephrased into the persona's voice.
- [ ] **Job text** (goal, Big Hire, Little Hire) appears only in the Ask 2
      call — never in `CLAUDE.md`. No product names anywhere agent-visible.
- [ ] Workspace staged for the chosen product per the table in Step 3.
- [ ] `$AGENT_CWD/CLAUDE.md` written before the first Ask.
- [ ] No leaks of monorepo internals, skills, or pre-configured tokens.
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

Per the agent profile: own summary, current week's log, teammates'
summaries. Bias product selection toward products not interviewed recently.

### Step 1: Pick the Product

If the task includes `Product:`, use it. Otherwise pick one of the products
under `products/` that has a `<job>` entry in `JTBD.md`.

### Step 2: Pick the Job

Read `JTBD.md`. Find every `<job>` entry whose **Big Hire** or **Little
Hire** line names the chosen product (e.g. `→ **Guide, Landmark**`). If the
task includes `Job:`, match it against the `goal=` attribute; otherwise
pick one. Record the full block: `user`, `goal`, Trigger, Big Hire, Little
Hire, Competes With, Forces (Push, Pull, Habit, Anxiety), Fired When.

### Step 3: Stage the Agent Workspace

The workflow has run `bunx fit-terrain build` and installed `supabase`.
Copy the subset the chosen product needs into `$AGENT_CWD`:

| Product          | Stage into `$AGENT_CWD`                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Guide, Outpost   | nothing                                                                                  |
| Pathway          | `data/pathway/`                                                                          |
| Map, Landmark    | `data/pathway/` and `data/activity/`                                                     |
| Summit           | `data/pathway/` and `data/activity/raw/activity/summit.yaml` (as `summit.yaml` at root)  |

Use `cp -r data/pathway "$AGENT_CWD/data/pathway"` and similar.

### Step 4: Craft the Persona

Write `$AGENT_CWD/CLAUDE.md`. The persona file carries **who** and **the
situation** — never the job. Two sources:

- **Identity** (name, team, manager, teammates, repos, recent project,
  company facts) — from the installation's synthetic content. This
  monorepo: `data/synthetic/story.dsl` and `prose-cache.json`.
- **Situation** (Trigger, Forces, Competes With) — from the chosen JTBD
  entry, rephrased into the persona's voice.

Excluded: goal sentence, Big Hire, Little Hire, Fired-When, product name.
Fired-When stays with you for Step 8 classification.

Template: [`references/persona-template.md`](references/persona-template.md).
Worked examples: [`references/example-personas.md`](references/example-personas.md).

### Step 5: Initiate the Session

Hand off in **two `Ask` calls** so persona and job
both surface inline in the trace.

**Ask 1 — introduction.** Phrase like a human interviewer opening a
conversation. The harness loads `CLAUDE.md` automatically — do not mention
it. Example:

> Hi — thanks for making time. Before we get into it, tell me a bit about
> yourself: who you are, your role and team, and what's been on your plate
> lately.

The `Answer` brings the persona, Trigger, and Forces inline.

**Ask 2 — job delivery.** Compose from the JTBD: one sentence for today's
want (Big Hire text, strip product names after `→`), one for the sub-want
(Little Hire), one pointing at `https://www.forwardimpact.team` and asking
for final-output reporting. Do not name the product.

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
Use monorepo access to verify observations, but never feed verification
back to the agent.

### Step 7: Transition to Post-Interview

Once the persona is done or has abandoned, stop sending work and proceed
to Steps 8–9 in the same turn. Conclude only after filing issues and
writing the report.

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

For each actionable finding: extract; search for duplicates; create a new
issue or comment on a matching one (templates in
`../kata-product-issue/references/templates.md` § New Issues from User
Testing) naming the JTBD job (`<user>: <goal>`) in the body; add the
finding to the report table with its issue number.

### Step 9: Report

Final summary: product and job; whether the persona got it done; which JTBD
forces materialised; table of findings and issues created or updated.

## Memory: what to record

Append to the current week's log: product interviewed; job (`<user>: <goal>`);
outcome (done / abandoned / partial); forces observed
(Push/Pull/Habit/Anxiety/Competes/Fired); issue numbers + categories.
Append one metrics row per run to `wiki/metrics/{skill}/` per
`references/metrics.md`. See KATA.md § Metrics for recording eligibility.
