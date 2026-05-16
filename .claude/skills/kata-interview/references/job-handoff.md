# Job handoff: two Asks

The supervisor hands off to the agent with **two `Ask` calls**. This is
the whole reason the persona file is persona-only: it forces both the
persona and the job to surface inline in the trace.

- **Ask 1** asks the agent to introduce themselves. The agent's `Answer`
  contains the persona (name, role, team, situation) — readable inline,
  no need to chase the `CLAUDE.md` contents in a `Write` turn.
- **Ask 2** delivers the goal (Big Hire + Little Hire phrased as the
  persona's own want). The job text is the supervisor's Ask turn — also
  readable inline.

Only the initial handoff uses two Asks. Mid-session supervisor messages
(Step 6 in `SKILL.md`) are short replies, not further Asks.

## Ask 1 — introduction

Short, uniform across every interview, phrased the way a human interviewer
would open a conversation. The agent harness loads `CLAUDE.md`
automatically; do **not** mention the file.

Example wording:

> Hi — thanks for making time. Before we get into it, tell me a bit about
> yourself: who you are, your role and team, and what's been on your plate
> lately.

## Ask 2 — job delivery

Composed from the chosen JTBD entry:

1. One sentence stating today's want — Big Hire text with the product
   names after the `→` stripped, in the persona's voice ("Today you want
   to …").
2. One sentence for the immediate sub-want — Little Hire text, also
   stripped of product names.
3. One sentence pointing at `https://www.forwardimpact.team` and reminding
   the agent to note friction in their final output, not in files.

Do not name the product. The persona arrives at the website without
foreknowledge — that's the point.

Template:

> Today you want to <Big Hire text, product names stripped>. Specifically:
> <Little Hire text>. Start at https://www.forwardimpact.team — that's the
> only entry point. Note friction in your final output, not in files.

If the task input carries steering not matching `Product:` / `Job:`, append
it to Ask 2.

## Worked examples

The personas below match the two examples in
[`example-personas.md`](example-personas.md). Treat the BioNova / Oncora /
MolecularForge specifics as illustrative — your installation will have
different projects and scenarios.

### Example A — *Empowered Engineers: Find Growth Areas*

JTBD source:
- **Big Hire:** "Help me get guidance and evidence grounded in my
  organization's standard, not impressions or generic advice." → Guide,
  Landmark
- **Little Hire:** "Help me ask a growth question and check whether
  recent work shows progress." → Guide, Landmark

Ask 2:

> Today you want to get guidance and evidence grounded in BioNova's
> engineering standard, not impressions or generic advice. Specifically:
> ask a growth question and check whether your recent Oncora work shows
> progress toward J070. Start at https://www.forwardimpact.team — that's
> the only entry point. Note friction in your final output, not in files.

### Example B — *Engineering Leaders: Staff Teams to Succeed*

JTBD source:
- **Big Hire:** "Help me make staffing decisions I can defend by seeing
  what each role requires." → Pathway, Summit
- **Little Hire:** "Help me spot capability gaps and check whether a
  candidate fills them." → Pathway, Summit

Ask 2:

> Today you want to make a staffing decision you can defend by seeing what
> each role on your Platform Engineering team actually requires.
> Specifically: spot the capability gaps the v2.1 post-mortem surfaced and
> check whether the candidate you've been considering fills them. Start at
> https://www.forwardimpact.team — that's the only entry point. Note
> friction in your final output, not in files.
