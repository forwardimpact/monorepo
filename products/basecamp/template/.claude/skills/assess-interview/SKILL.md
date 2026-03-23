---
name: assess-interview
description: >
  Analyze interview transcripts against the engineering career framework,
  updating skill and behaviour ratings with observed evidence. Produces
  per-interview assessments and panel briefs for subsequent interview stages.
  Use when transcript files appear in a candidate's folder.
---

# Assess Interview

Analyze interview transcript(s) for a candidate, updating their skill and
behaviour profile with observed (not claimed) evidence. Interview evidence is
higher-fidelity than CV evidence — it either confirms or contradicts the
screening assessment.

This is Stage 2 of a three-stage hiring pipeline:

1. **Screen CV** — CV arrives → interview or pass
2. **Assess Interview** (this skill) — transcript arrives → updated profile
3. **Hiring Decision** — all stages complete → hire or not

## Trigger

Run this skill:

- When a new `transcript-*.md` file appears in `knowledge/Candidates/{Name}/`
- When the user asks to analyze an interview or debrief
- When the user asks to prepare a panel brief for upcoming interviewers
- After the concierge agent processes a Hyprnote interview recording

## Prerequisites

- `fit-pathway` CLI installed (`npx fit-pathway` must work)
- At least one transcript file in `knowledge/Candidates/{Name}/`
- Screening assessment (`screening.md`) should exist — if not, note that
  `screen-cv` should run first, but proceed with transcript analysis regardless

## Inputs

- Transcript file(s): `knowledge/Candidates/{Name}/transcript-{date}.md`
- Screening assessment: `knowledge/Candidates/{Name}/screening.md`
- Candidate brief: `knowledge/Candidates/{Name}/brief.md`
- Target role from brief or user instruction

## Outputs

- `knowledge/Candidates/{Name}/interview-{date}.md` — per-interview assessment
- `knowledge/Candidates/{Name}/panel.md` — brief for next-stage
  interviewers (if further interviews are planned)
- Updated `knowledge/Candidates/{Name}/brief.md` — pipeline and notes enriched

---

## Step 1: Read the Transcript

Read the transcript file(s). For each transcript, extract:

| Field                         | What to look for                                          |
| ----------------------------- | --------------------------------------------------------- |
| **Interview type**            | Screening, decomposition, panel, technical, etc.          |
| **Interviewers**              | Who conducted the interview                               |
| **Date**                      | When the interview took place                             |
| **Skill demonstrations**      | Concrete examples of skills applied in real-time          |
| **Behaviour observations**    | How the candidate acted under pressure, with others       |
| **Self-identified strengths** | What the candidate claims they're good at                 |
| **Self-identified gaps**      | What the candidate acknowledges as growth areas           |
| **Red flags**                 | Contradictions with CV, concerning patterns               |
| **Interviewer feedback**      | Direct quotes or observations from interviewers           |
| **Level signals**             | Autonomy, scope, complexity demonstrated in responses     |
| **Track signals**             | Business immersion vs platform thinking in their answers  |

## Step 2: Load Framework Reference

Load the same framework reference used in the screening assessment:

```bash
# Get the job definition (use the role from the screening assessment or brief)
npx fit-pathway job {discipline} {level} --track={track}

# Get skill detail for skills being re-rated
npx fit-pathway skill {skill_id}

# Get behaviour definitions
npx fit-pathway behaviour --list
```

If the screening assessment recommended a different level than originally
targeted (e.g. J100 → J090), load **both** levels for comparison:

```bash
npx fit-pathway job {discipline} {original_level} --track={track}
npx fit-pathway job {discipline} {recommended_level} --track={track}
```

## Step 3: Re-rate Skills with Interview Evidence

For each skill in the framework, compare the screening assessment rating against
what the interview revealed:

| Interview Evidence                                      | Rating Adjustment                     |
| ------------------------------------------------------- | ------------------------------------- |
| Candidate demonstrated the skill live, under pressure   | **Upgrade** — interview > CV claims   |
| Candidate discussed concrete examples with detail       | **Confirm** at screening level or +1  |
| Candidate gave vague or generic answers about this area | **Hold** at screening level           |
| Candidate struggled or revealed misunderstanding        | **Downgrade** from screening level    |
| Candidate self-identified this as a gap                 | **Downgrade** and note honesty signal |
| Interviewer explicitly flagged a concern                | **Downgrade** with interviewer quote  |

**Interview evidence outranks CV evidence.** A candidate who claimed
`practitioner` on their CV but demonstrated `foundational` in the interview
should be re-rated to `foundational`. The reverse also applies — a candidate
whose CV undersold them should be upgraded.

**Be specific.** Every re-rating must cite a specific moment, quote, or
observation from the transcript. "Seemed strong" is not evidence.

## Step 4: Re-rate Behaviours with Interview Evidence

Behaviours are **better assessed in interviews than CVs** because they describe
how someone acts, not what they've done.

For each framework behaviour, look for:

| Behaviour                  | Interview Evidence                                              |
| -------------------------- | --------------------------------------------------------------- |
| Own the Outcome            | Takes responsibility, doesn't deflect, drives to resolution     |
| Think in Systems           | Considers second-order effects, trade-offs, system boundaries   |
| Communicate with Precision | Clear explanations, appropriate detail level, listens actively  |
| Be Polymath Oriented       | Draws on diverse knowledge, makes unexpected connections        |
| Don't Lose Your Curiosity  | Asks good questions, explores alternatives, admits not knowing  |

Rate each behaviour using maturity levels:

| Maturity        | Interview Signal                                              |
| --------------- | ------------------------------------------------------------- |
| `emerging`      | Behaviour not observed or only when prompted                  |
| `developing`    | Behaviour present but inconsistent or surface-level           |
| `practicing`    | Behaviour consistent and natural throughout the interview     |
| `role_modeling` | Behaviour demonstrated at high level, influenced the room     |
| `exemplifying`  | Behaviour exceptional, set the standard for the conversation  |

## Step 5: Assess Level Fit

Based on interview evidence, assess whether the candidate's level estimate
should change:

```bash
# Compare what changes between levels
npx fit-pathway progress {discipline} {level} --track={track}
```

| Level Signal in Interview                                            | Implication                    |
| ------------------------------------------------------------------- | ------------------------------ |
| Candidate needed guidance on structuring their approach              | Level may be lower than est.   |
| Candidate self-directed, made sound trade-offs independently         | Level estimate confirmed        |
| Candidate mentored or coached others during the exercise             | Level may be higher than est.  |
| Candidate struggled with complexity appropriate to the target level  | Level should be downgraded     |
| Interviewer explicitly suggested a different level                   | Strong signal — weight heavily |

## Step 6: Write Interview Assessment

Create `knowledge/Candidates/{Name}/interview-{date}.md`:

```markdown
# Interview Assessment — {Full Name}

**Interview type:** {Screening / Decomposition / Panel / Technical}
**Date:** {YYYY-MM-DD}
**Interviewers:** {Names}
**Assessed against:** {Discipline} {Level} — {Track}

## Interview Summary

{3-5 sentences: what was the interview format, what happened, what was the
overall impression. Include the key decision or outcome.}

## Skill Evidence

{Only include skills where the interview provided new evidence — don't
repeat the full matrix for skills not touched by this interview.}

| Skill | Screening Rating | Interview Rating | Change | Evidence |
| --- | --- | --- | --- | --- |
| {skill} | {from screening.md} | {updated} | {↑ / ↓ / ―} | {specific transcript evidence} |

### Confirmed Strengths
- {Strength confirmed by interview — cite specific moment}

### New Concerns
- {Concern revealed by interview — cite specific moment}

### Resolved Uncertainties
- {Gap or question from screening that the interview answered}

## Behaviour Evidence

| Behaviour | Screening Signal | Interview Observation | Updated Maturity |
| --- | --- | --- | --- |
| {behaviour} | {from screening.md} | {specific observation} | {maturity level} |

## Level Assessment

**Screening estimate:** {level from screening.md}
**Interview evidence suggests:** {confirmed / adjusted level}

{Paragraph explaining the level assessment. Reference specific moments from the
transcript that demonstrate the candidate's autonomy, scope of thinking, and
complexity handling. If a level adjustment is recommended, explain why using
framework progression criteria.}

## Interviewer Observations

{Direct quotes or paraphrased observations from interviewers present.
Attribute each to the interviewer by name.}

- **{Interviewer}:** "{observation or quote}"
- **{Interviewer}:** "{observation or quote}"

## Updated Screening Recommendation

**Previous:** {Interview / Interview with focus areas / Pass}
**Updated:** {Continue interviewing / Adjust level to {X} / Pass}

**Remaining uncertainties for next stage:**
- {What still needs to be validated}
- {What the next interview should focus on}
```

## Step 7: Generate Panel Brief (if applicable)

If more interview stages are planned (the candidate is continuing to panel,
technical assessment, etc.), create `knowledge/Candidates/{Name}/panel.md`.

The panel brief is written **for the next interviewers** — typically business
colleagues who are not engineers. It must:

1. Explain who this person is without jargon
2. Summarize what previous interviews found
3. Tell the panel what to probe and why
4. Provide specific suggested questions

```bash
# Get the framework expectations for the role
npx fit-pathway job {discipline} {level} --track={track}

# Get interview questions relevant to remaining gaps
npx fit-pathway interview {discipline} {level} --track={track}
```

```markdown
# Panel Brief — {Full Name}
## {Role Title} — {Level}

**Panel date:** {date or TBC}
**Prepared:** {YYYY-MM-DD}
**Prepared for:** {Panel interviewers / business colleagues / etc.}
**Role under evaluation:** {Full role title with level}

{If the level has been adjusted from the original target, include a level note
explaining the change and why it matters.}

---

## Candidate Snapshot

| Field | Detail |
|---|---|
| **Current role** | {title — employer} |
| **Years of experience** | {N}+ years |
| **Background** | {2-3 key themes} |
| **Location** | {location} |
| **Source** | {how they entered the pipeline} |

**What makes this candidate interesting:** {2-3 sentences on why this person
is worth the panel's time. Lead with the most compelling signal.}

---

## Where We Are in the Process

| Stage | Date | Outcome |
|---|---|---|
| CV review | {date} | {one-line outcome} |
| {Interview type} ({interviewer}) | {date} | {one-line outcome} |
| **{Next stage}** | **{date}** | **← You are here** |

---

## What Previous Interviews Told Us

{For each completed interview, summarize in plain language:}

**What went well:**
- {strength 1}
- {strength 2}

**What fell short:**
- {concern 1}
- {concern 2}

**Interviewer conclusion:** {key takeaway in one sentence}

---

## What {Level} {Track} Looks Like

{Use fit-pathway to describe the role expectations in non-technical language.
Focus on behaviours and scope, not technical skills.}

**Key behaviours at this level:**
- **{Behaviour}** — {plain-language description of what this means}

**Skills most relevant for the panel to probe:**
- **{Skill}** — {why this matters for the business}

---

## What the Panel Should Explore

{Frame the remaining uncertainties as questions the panel can answer through
conversation. These should focus on business-facing capabilities.}

### Suggested Focus Areas

**1. {Focus area title}**
{Context for why this matters. Explain the gap or uncertainty.}

> *"{Suggested question 1}"*
> *"{Suggested question 2}"*

**2. {Focus area title}**
{Context.}

> *"{Suggested question 1}"*
> *"{Suggested question 2}"*

---

## Known Strengths — Lean Into These

- **{Strength}:** {evidence summary}

---

## Known Risks — Probe, Don't Assume

- **{Risk}:** {evidence summary and what to look for}

---

## Screening Recommendation (Pre-Panel)

**{Recommendation}**

{2-3 sentence summary of the case for this candidate at this level. State what
the panel should look for to confirm or disconfirm.}

---

*This brief is a hiring aid for the panel. The final decision rests with the
panel and the hiring manager. All assessments are advisory.*
```

## Step 8: Update Candidate Brief

Update `knowledge/Candidates/{Name}/brief.md`:

- Add the interview to the **Pipeline** section with date, type, and outcome
- Add **Interview Notes** section if not present, with key observations
- Link to the interview assessment: `- [Interview Assessment](./interview-{date}.md)`
- Link to panel brief if created: `- [Panel Brief](./panel.md)`
- Update **Status** field to reflect current pipeline stage

**Use precise edits — don't rewrite the entire file.**

## Quality Checklist

- [ ] Every skill re-rating cites a specific moment from the transcript
- [ ] Behaviour assessments reference observed actions, not claimed traits
- [ ] Level assessment uses framework progression criteria, not gut feel
- [ ] Interviewer observations are attributed by name
- [ ] Panel brief (if created) is written for non-technical readers
- [ ] Panel brief includes specific suggested questions tied to remaining gaps
- [ ] Candidate brief pipeline section is updated with interview outcome
- [ ] Assessment distinguishes between confirmed strengths and new concerns
- [ ] Remaining uncertainties are specific and actionable for the next stage
- [ ] No subjective judgments — all assessments grounded in framework data
- [ ] Gender field unchanged (never updated from interview observations)
