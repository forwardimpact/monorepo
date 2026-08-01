---
name: req-screen
description: >
  Screen candidate CVs against the agent-aligned engineering standard to decide
  whether to invest interview time. It produces a structured screening
  assessment with an interview/pass recommendation and suggested focus areas
  for the interview. Use when the user asks to evaluate a CV, or when you find
  a new CV.
---

# Screen CV

Screen a candidate's CV against the agent-aligned engineering standard defined
in `fit-pathway`. This skill answers one question. **Is this candidate worth an
interview?** Ground every assessment in the standard. Never use subjective
impressions.

This is **Stage 1** of a three-stage hiring pipeline:

1. **Screen CV** (this skill) — CV arrives → interview or pass.
2. `req-assess` — interview transcript arrives → updated evidence.
3. `req-decide` — all stages complete → hire / do not hire.

## Trigger

- A new CV appears in `Knowledge/Candidates/{Name}/`.
- A CV appears in `~/Downloads/` and matches a candidate.
- The user asks to screen, evaluate, or assess a CV.
- The user asks "is this person worth interviewing?".

## Prerequisites

- `fit-pathway` CLI installed (`bunx fit-pathway` works).
- A CV file (PDF or DOCX) on the filesystem.
- Optionally a target role: `{discipline} {level} --track={track}`.

## Inputs

- CV file path (e.g. `Knowledge/Candidates/{Name}/CV.pdf`).
- Target role (optional).
- Existing `Knowledge/Candidates/{Name}/brief.md`, if any.
- `Knowledge/Roles/*.md` that matches the candidate's `Req`. It provides
  `Level`, `Discipline`, `Hiring manager`, `Domain lead`, and the `**Status:**`
  field. Look up by Req number or filename substring.

## Outputs

- `Knowledge/Candidates/{Name}/screening.md` — structured assessment.
- Updated `Knowledge/Candidates/{Name}/brief.md` — skills + summary enriched.

<do_confirm_checklist goal="Verify the screening is grounded and
decision-rule-compliant">

- [ ] Every claim cites CV evidence or marks "Not evidenced".
- [ ] Two-level scepticism applied. Vague phrases did not earn levels.
- [ ] "Not evidenced" skills count as gaps in the recommendation.
- [ ] Recommendation follows the decision rules and the threshold rule. Match %
      and gap count verified before you pick a tier.
- [ ] "Interview with focus areas" used only for strong candidates with a named
      concern. Never used as a soft "maybe".
- [ ] Output file is exactly `screening.md`. Any misnamed prior file deleted.
- [ ] `brief.md` links the screening as `[CV Screening](./screening.md)`.
      Targeted edits updated Skills and Summary.
- [ ] Gender set only from explicit pronouns/titles.
- [ ] Recommendation header carries the advisory-only banner.

</do_confirm_checklist>

## Procedure

### 1. Read the CV

Extract the fields listed in
[references/rubric.md](references/rubric.md#what-to-extract-from-the-cv).

### 2. Anchor the target role

If `brief.md` carries a `Req`, look up the Role file that matches it:

```bash
ls Knowledge/Roles/ | grep "{req_number}"
cat "Knowledge/Roles/{matching file}"
```

Use the Role's `Level` and `Discipline` as the target unless the user specified
a different target. Capture `Hiring manager` and `Domain lead` for the screening
header. Note the `**Status:**` field. Screen a still-active candidate even when
the role is `closed`.

If no target is available, estimate one with the level heuristics in
[references/rubric.md](references/rubric.md#level-estimation-heuristics).

### 3. Load the standard

```bash
bunx fit-pathway job {discipline} {level} --track={track}
bunx fit-pathway job {discipline} {level} --track={track} --skills
bunx fit-pathway track forward-deployed
bunx fit-pathway track platform
```

### 4. Map CV → standard skills

For each skill in the target job, assess the candidate's likely proficiency.
Look up nuance with `bunx fit-pathway skill {skill_id}`. Use the proficiency
mapping and the scepticism rule in
[references/rubric.md](references/rubric.md#proficiency-mapping).

### 5. Assess behaviours

```bash
bunx fit-pathway behaviour --list
```

Map CV evidence with the behaviour signals in
[references/rubric.md](references/rubric.md#behaviour-signals).

### 6. Classify gaps and strengths

Optional progression context:

```bash
bunx fit-pathway progress {discipline} {level} --track={track}
```

Classify each skill per
[references/rubric.md](references/rubric.md#skill-alignment-classification).
Pick the recommendation with the decision rules and threshold rule in
[references/rubric.md](references/rubric.md#recommendation-decision-rules).

### 7. Write the screening

Save to `Knowledge/Candidates/{Name}/screening.md` with the template in
[references/template.md](references/template.md). Include the **Suggested
Interview Questions** when the recommendation is "Interview" or "Interview with
focus areas":

```bash
bunx fit-pathway interview {discipline} {level} --track={track}
```

Pick 3–5 questions most relevant to the gaps. Note which gap each one targets.

### 8. Enrich the brief

If `brief.md` exists, apply targeted edits:

- Add or update `## Skills` with agent-aligned standard skill IDs.
- Update `## Summary` if the CV provides better context.
- Set `**Gender:**` only when the CV states it explicitly and the field is
  empty.
- Append `- [CV Screening](./screening.md)` if missing.

If no brief exists, tell the user to run `req-track` first to build the
candidate profile from email threads.
