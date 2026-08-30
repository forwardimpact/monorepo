---
name: req-assess
description: >
  Analyze interview transcripts against the agent-aligned engineering standard.
  Update skill and behaviour ratings with observed evidence. Produces
  per-interview assessments and panel briefs for later interview stages.
  Use when transcript files appear in a candidate's folder.
---

# Assess Interview

Write tier: `2-Confidential`
Frontmatter: candidate (stamps `status`, `updated`)

Analyze a candidate's interview transcripts. Update their skill and behaviour
profile with **observed** (not claimed) evidence. Interview evidence is
higher-fidelity than CV evidence. It confirms or contradicts the screening
assessment.

This is **Stage 2** of the three-stage hiring pipeline:

1. `req-screen` — CV → interview or pass.
2. **Assess interview** (this skill) — transcript → updated profile.
3. `req-decide` — all stages complete → hire / no hire.

## Trigger

- A new `transcript-*.md` file appears in `2-Confidential/Candidates/{Name}/`.
- The user asks to analyze an interview or debrief.
- The user asks to prepare a panel brief.
- The concierge agent processes an Anarlog interview recording.

## Prerequisites

- `fit-pathway` CLI installed.
- At least one transcript in `2-Confidential/Candidates/{Name}/`.
- `screening.md` should exist. If it is missing, run `req-screen` first.
  Proceed regardless.

## Inputs

- `2-Confidential/Candidates/{Name}/transcript-{date}.md`.
- `2-Confidential/Candidates/{Name}/screening.md`.
- `2-Confidential/Candidates/{Name}/brief.md` — target role.

## Outputs

- `2-Confidential/Candidates/{Name}/interview-{date}.md`.
- `2-Confidential/Candidates/{Name}/panel.md` — only when more interviews are
  planned.
- Updated `2-Confidential/Candidates/{Name}/brief.md` — frontmatter `status`
  and `updated` stamped.

<do_confirm_checklist goal="Verify the assessment is grounded in transcript
evidence">

- [ ] Cite a specific moment from the transcript for every skill re-rating.
- [ ] Base behaviour assessments on observed actions. Ignore claimed traits.
- [ ] Assess the level with standard progression criteria. Ignore gut feel.
- [ ] Attribute interviewer observations by name.
- [ ] Distinguish confirmed strengths from new concerns.
- [ ] Assessment prose about the candidate stays in the candidate's own
      folder. Wider notes record only that the interview happened.
- [ ] Write the panel brief (if created) for non-technical readers. Tie the
      suggested questions to the remaining gaps.
- [ ] Update the brief's Pipeline section, links, and Status.
- [ ] **Never** update the Gender field from interview observations.

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

If screening recommended a level different from the original target (e.g. J100
→ J090), load **both** for comparison.

### 3. Re-rate skills

For each skill where the interview produced evidence, apply the adjustments in
[references/rubric.md](references/rubric.md#skill-re-rating). Cite a specific
moment, quote, or observation per change.

### 4. Re-rate behaviours

Interviews assess behaviours better than CVs. Behaviours describe how someone
acts. They do not describe what someone did. Use the
[behaviour signals](references/rubric.md#behaviour-signals) and the
[behaviour maturity scale](references/rubric.md#behaviour-maturity-scale).

### 5. Assess level fit

```bash
bunx fit-pathway progress {discipline} {level} --track={track}
```

Apply the [level signals](references/rubric.md#level-signals).

### 6. Write the interview assessment

Save to `2-Confidential/Candidates/{Name}/interview-{date}.md` with
[references/interview-template.md](references/interview-template.md). Include
only skills with new evidence. Do not repeat the full matrix.

### 7. Generate the panel brief (if applicable)

When you plan more interview stages (panel, technical, etc.), pull question
candidates:

```bash
bunx fit-pathway interview {discipline} {level} --track={track}
```

Save `2-Confidential/Candidates/{Name}/panel.md` with
[references/panel-template.md](references/panel-template.md). The audience is
next-stage interviewers, often non-engineers. Explain without jargon. Tie the
suggested questions to the remaining gaps.

### 8. Update the candidate brief

Apply targeted Edit operations to `2-Confidential/Candidates/{Name}/brief.md`:

- Append a Pipeline entry with date, type, and outcome.
- Add `## Interview Notes` if missing, with key observations.
- Append `- [Interview Assessment](./interview-{date}.md)`.
- Append `- [Panel Brief](./panel.md)` when one was created.
- Update `Status` to reflect the current pipeline stage.
- Stamp the frontmatter: set `updated` to the interview date and `status` to
  the closest registry value (agents select from `registry.yaml`).

Never rewrite the file. Never update the Gender field from interview
observations.
