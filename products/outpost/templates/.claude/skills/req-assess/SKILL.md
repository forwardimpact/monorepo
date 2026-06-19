---
name: req-assess
description: >
  Analyze interview transcripts against the agent-aligned engineering standard,
  updating skill and behaviour ratings with observed evidence. Produces
  per-interview assessments and panel briefs for subsequent interview stages.
  Use when transcript files appear in a candidate's folder.
---

# Assess Interview

Analyze a candidate's interview transcripts. Update their skill and behaviour
profile with **observed** (not claimed) evidence. Interview evidence is
higher-fidelity than CV evidence — it confirms or contradicts the screening
assessment.

This is **Stage 2** of the three-stage hiring pipeline:

1. `req-screen` — CV → interview or pass.
2. **Assess interview** (this skill) — transcript → updated profile.
3. `req-decide` — all stages complete → hire / no hire.

## Trigger

- A new `transcript-*.md` file appears in `Knowledge/Candidates/{Name}/`.
- The user asks to analyze an interview or debrief.
- The user asks to prepare a panel brief.
- The concierge agent processes a Anarlog interview recording.

## Prerequisites

- `fit-pathway` CLI installed.
- At least one transcript in `Knowledge/Candidates/{Name}/`.
- `screening.md` should exist; if missing, run `req-screen` first (proceed
  regardless).

## Inputs

- `Knowledge/Candidates/{Name}/transcript-{date}.md`.
- `Knowledge/Candidates/{Name}/screening.md`.
- `Knowledge/Candidates/{Name}/brief.md` — target role.

## Outputs

- `Knowledge/Candidates/{Name}/interview-{date}.md`.
- `Knowledge/Candidates/{Name}/panel.md` — only when more interviews are
  planned.
- Updated `Knowledge/Candidates/{Name}/brief.md`.

<do_confirm_checklist goal="Verify the assessment is grounded in transcript
evidence">

- [ ] Every skill re-rating cites a specific moment from the transcript.
- [ ] Behaviour assessments reference observed actions, not claimed traits.
- [ ] Level assessment uses standard progression criteria, not gut feel.
- [ ] Interviewer observations are attributed by name.
- [ ] Confirmed strengths and new concerns are distinguished.
- [ ] Panel brief (if created) is written for non-technical readers and ties
      suggested questions to remaining gaps.
- [ ] Brief's Pipeline section, links, and Status are updated.
- [ ] Gender field is **not** updated from interview observations.

</do_confirm_checklist>

## Procedure

### 1. Read the transcript(s)

Extract the fields listed in
[references/rubric.md](references/rubric.md#what-to-extract-from-the-transcript).

### 2. Load the standard reference

Use the role recorded in `screening.md` or `brief.md`:

```bash
bunx fit-pathway job {discipline} {level} --track={track}
bunx fit-pathway skill {skill_id}
bunx fit-pathway behaviour --list
```

If screening recommended a different level than originally targeted (e.g. J100 →
J090), load **both** for comparison.

### 3. Re-rate skills

For each skill where the interview produced evidence, apply the adjustments in
[references/rubric.md](references/rubric.md#skill-re-rating). Cite a specific
moment, quote, or observation per change.

### 4. Re-rate behaviours

Behaviours are better assessed in interviews than CVs — they describe how
someone acts, not what they've done. Use the
[behaviour signals](references/rubric.md#behaviour-signals) and the
[behaviour maturity scale](references/rubric.md#behaviour-maturity-scale).

### 5. Assess level fit

```bash
bunx fit-pathway progress {discipline} {level} --track={track}
```

Apply the [level signals](references/rubric.md#level-signals).

### 6. Write the interview assessment

Save to `Knowledge/Candidates/{Name}/interview-{date}.md` using
[references/interview-template.md](references/interview-template.md). Include
only skills with new evidence — don't repeat the full matrix.

### 7. Generate the panel brief (if applicable)

When more interview stages are planned (panel, technical, etc.), pull question
candidates:

```bash
bunx fit-pathway interview {discipline} {level} --track={track}
```

Save `Knowledge/Candidates/{Name}/panel.md` using
[references/panel-template.md](references/panel-template.md). Audience:
next-stage interviewers, often non-engineers — explain without jargon and tie
suggested questions to remaining gaps.

### 8. Update the candidate brief

Apply targeted Edit operations to `Knowledge/Candidates/{Name}/brief.md`:

- Append a Pipeline entry with date, type, and outcome.
- Add `## Interview Notes` if missing, with key observations.
- Append `- [Interview Assessment](./interview-{date}.md)`.
- Append `- [Panel Brief](./panel.md)` when one was created.
- Update `Status` to reflect the current pipeline stage.

Never rewrite the file. Never update the Gender field from interview
observations.
