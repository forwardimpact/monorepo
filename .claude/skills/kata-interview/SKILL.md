---
name: kata-interview
description: >
  Conduct a JTBD switching interview to test a Forward Impact product. Pick
  one of the product's Jobs To Be Done, build a persona grounded in the
  installation's synthetic content with the situation drawn from the JTBD
  entry, hand the job to the agent at the public website in two Ask calls
  (introduction, then job delivery), and capture findings as GitHub issues
  classified against the chosen job.
---

# Switching Interview

You are running a **JTBD switching interview**: an agent, briefed only with
a persona derived from a chosen Job To Be Done, tries to get that job done
using a Forward Impact product they encounter cold at the public website.
The agent is in an isolated workspace with no monorepo access. You run in
the monorepo root with full access to `JTBD.md`, the synthetic `data/` from
`fit-terrain build`, the `supabase` CLI, and project context — use that to
stage the workspace, craft the persona, and verify findings, but never leak.

## When to Use

- You are running the `kata-interview` workflow.
- The task may include `Product:` and/or `Job:` overrides; otherwise pick.

This skill is not part of scheduled runs.

## LLM Availability

`ANTHROPIC_API_KEY` is present in the shell — `libconfig` reads it.
LLM-backed products (Guide, Outpost) should work without the agent
configuring an API key. If the agent is asked to supply a key, that is a
**bug** — the zero-config promise is broken. Do not tell the agent the
key is pre-configured.

## Checklists

<read_do_checklist goal="Protect the interview before briefing the agent">

- [ ] Persona **identity** (name, handle, email, team, manager, teammates,
      repos, recent project context) is drawn from the installation's
      synthetic content (e.g. `data/synthetic/story.dsl` and prose-cache
      from `fit-terrain build`) — not invented.
- [ ] `## About <Company>` section sourced from the same synthetic content
      — every fact (HQ, departments, headcount, current projects, domain)
      traces back to the DSL or generated prose.
- [ ] Persona **situation** (Trigger, Forces, Competes With) is taken from
      the chosen JTBD entry and rephrased into the persona's voice.
- [ ] **Job text** (goal sentence, Big Hire, Little Hire) appears only in
      the Ask 2 call — never in `CLAUDE.md`.
- [ ] Workspace staged for the chosen product per the table in Step 3.
- [ ] `$AGENT_CWD/CLAUDE.md` written before the first Ask.
- [ ] No leaks of monorepo internals, skills, or pre-configured tokens.
- [ ] No product names in `CLAUDE.md` or in either Ask.
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

The workflow has run `bunx fit-terrain build` and installed `supabase`
globally. Copy the subset the chosen product needs into `$AGENT_CWD` (adjust
for your installation's products):

| Product          | Stage into `$AGENT_CWD`                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Guide, Outpost   | nothing                                                                                  |
| Pathway          | `data/pathway/`                                                                          |
| Map, Landmark    | `data/pathway/` and `data/activity/`                                                     |
| Summit           | `data/pathway/` and `data/activity/raw/activity/summit.yaml` (as `summit.yaml` at root)  |

Use `cp -r data/pathway "$AGENT_CWD/data/pathway"` and similar.

### Step 4: Craft the Persona

Write `$AGENT_CWD/CLAUDE.md`. The persona file describes **who the persona
is** and **the situation they're in** — never **the job they're hiring a
product for**. The job is delivered in Step 5 (Ask 2) so it lands inline in
the trace.

Two sources, kept distinct:

- **Identity** (name, team, manager, teammates, repos, recent project
  context, company facts) — sourced from the installation's synthetic
  content. In this monorepo: `data/synthetic/story.dsl` and
  `data/synthetic/prose-cache.json` (output of `bunx fit-terrain build`).
- **Situation** (Trigger, Forces, Competes With) — sourced from the chosen
  JTBD entry, rephrased into the persona's voice.

What is **excluded** from `CLAUDE.md`: the goal sentence, Big Hire, Little
Hire, Fired-When, and any product name. Fired-When stays with you for Step
8 classification.

Full template and worked examples:

- [`references/persona-template.md`](references/persona-template.md) —
  generic template with placeholders.
- [`references/example-personas.md`](references/example-personas.md) — two
  worked examples (installation-specific; use as a model, not a copy).

### Step 5: Initiate the Session

Hand off in **two `mcp__orchestration__Ask` calls**, so the persona and the
job both surface inline in the trace.

**Ask 1 — introduction.** Phrase it like a human interviewer opening a
conversation. The agent harness loads `CLAUDE.md` automatically; do not
mention the file. Example wording:

> Hi — thanks for making time. Before we get into it, tell me a bit about
> yourself: who you are, your role and team, and what's been on your plate
> lately.

Wait for the `Answer`. The persona, Trigger, and Forces now appear inline
as the agent's introduction.

**Ask 2 — job delivery.** Compose from the JTBD entry: one sentence
articulating today's want (Big Hire text, with product names after the
`→` stripped), one sentence for the immediate sub-want (Little Hire text),
one sentence pointing at `https://www.forwardimpact.team` and reminding
the agent to report in their final output. Do not name the product.

Full Ask 1 / Ask 2 templates and two worked examples:
[`references/job-handoff.md`](references/job-handoff.md).

If the task carries steering not matching `Product:` / `Job:`, append it to
Ask 2.

### Step 6: Supervise

| Agent State              | Your Response                              |
| ------------------------ | ------------------------------------------ |
| Making progress          | Short encouragement                        |
| Stuck on a specific step | Answer the specific question, in character |
| Going down a dead end    | Nudge toward the documented path           |
| Looping without progress | Targeted guidance                          |
| Job done or abandoned    | Proceed to Step 7                          |

These are short reply messages, not further `Ask` calls. Only the initial
handoff in Step 5 uses two Asks.

Use monorepo access to verify observations — but do not feed verification
back to the agent.

### Step 7: Transition to Post-Interview

When the persona has gotten the job done or clearly abandoned it, stop
sending work to the agent and proceed immediately to Steps 8 and 9 in the
same turn. Conclude the session only after filing issues and writing the
report.

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

Append to the current week's log:

- **Product** — interviewed
- **Job** — `<user>: <goal>`
- **Outcome** — done / abandoned / partial
- **Forces observed** — Push/Pull/Habit/Anxiety/Competes/Fired
- **Issues created or updated** — numbers and categories
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/` per
  `references/metrics.md`. See KATA.md § Metrics for recording eligibility.
