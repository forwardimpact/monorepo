---
name: hiring-decision
description: >
  Synthesize all evidence (CV screening, interview assessments, transcripts)
  into a final hiring recommendation. Produces a comprehensive recommendation
  document with full evidence trail, level/track/discipline confirmation, and
  a clear hire/no-hire decision. Use when all interview stages are complete.
---

# Hiring Decision

Synthesize all available evidence for a candidate into a final hiring
recommendation. This is the culmination of the hiring pipeline — every prior
assessment feeds into this document.

This is Stage 3 of a three-stage hiring pipeline:

1. **Screen CV** — CV arrives → interview or pass
2. **Assess Interview** — transcript arrives → updated evidence profile
3. **Hiring Decision** (this skill) — all stages complete → hire or not

## Trigger

Run this skill:

- When the user asks for a final hiring recommendation
- When all planned interview stages for a candidate are complete
- When the user asks "should we hire {Name}?"
- When the user needs to compare finalists for a position

## Prerequisites

- `fit-pathway` CLI installed (`bunx fit-pathway` must work)
- Screening assessment: `knowledge/Candidates/{Name}/screening.md`
- At least one interview assessment:
  `knowledge/Candidates/{Name}/interview-*.md`
- Candidate brief: `knowledge/Candidates/{Name}/brief.md`
- Transcripts provide additional context but are not strictly required if
  interview assessments exist

## Inputs

- All candidate artifacts in `knowledge/Candidates/{Name}/`
- Framework data via `fit-pathway`
- `knowledge/Candidates/Insights.md` for cross-candidate context
- `knowledge/Roles/*.md` — the Role file for this candidate's requisition
  (provides remaining positions, hiring manager, domain lead priorities)
- Other active candidates at the same level (for relative positioning)

## Outputs

- `knowledge/Candidates/{Name}/recommendation.md` — final hiring recommendation
- Updated `knowledge/Candidates/{Name}/brief.md` — status and links
- Updated `knowledge/Candidates/Insights.md` — cross-candidate observations

---

## Step 1: Gather All Evidence

Collect every artifact for this candidate:

```bash
ls knowledge/Candidates/{Name}/
```

Read in order:

1. `brief.md` — pipeline history, status, context
2. `screening.md` — CV screening (Stage 1 output)
3. `interview-*.md` — all interview assessments (Stage 2 outputs)
4. `transcript-*.md` — raw transcripts for additional detail
5. `panel.md` — panel brief if it exists (for continuity)

Build a chronological evidence timeline:

| Date   | Stage            | Source              | Key Finding   |
| ------ | ---------------- | ------------------- | ------------- |
| {date} | CV Screening     | screening.md        | {key finding} |
| {date} | {Interview type} | interview-{date}.md | {key finding} |

## Step 2: Build Final Skill Profile

For each skill in the target job's matrix, determine the **final rating** by
selecting the highest-fidelity evidence available:

**Evidence hierarchy** (highest to lowest fidelity):

1. **Live demonstration** — candidate showed the skill in an interview exercise
2. **Detailed interview discussion** — candidate gave specific, probing answers
3. **Interviewer observation** — interviewer noted strength or concern
4. **CV evidence with quantification** — concrete metrics and named projects
5. **CV evidence without quantification** — described but vague
6. **Not evidenced** — never surfaced across any stage

```bash
# Load the framework reference for final comparison
bunx fit-pathway job {discipline} {level} --track={track} --skills

# Check progression if level is borderline
bunx fit-pathway progress {discipline} {level} --track={track}
```

For each skill, record:

- **Final rating** — the proficiency level supported by the best evidence
- **Best evidence source** — which stage provided the strongest signal
- **Trajectory** — did the rating improve, decline, or hold across stages?
- **Confidence** — high (demonstrated live), medium (discussed well), low (CV
  only or thin evidence)

## Step 3: Build Final Behaviour Profile

For each framework behaviour, determine the **final maturity** using the same
evidence hierarchy. Behaviours assessed in interviews carry far more weight than
CV signals.

```bash
bunx fit-pathway behaviour --list
```

For each behaviour:

- **Final maturity** — the maturity level supported by interview evidence
- **Best evidence** — specific moment or pattern across interviews
- **Consistency** — was the behaviour shown once or throughout?

## Step 4: Confirm Level and Track

Using the complete evidence profile, make a final level and track
recommendation:

```bash
# Compare adjacent levels
bunx fit-pathway job {discipline} {lower_level} --track={track}
bunx fit-pathway job {discipline} {target_level} --track={track}
bunx fit-pathway progress {discipline} {lower_level} --track={track}
```

| Question                                                     | Answer informs          |
| ------------------------------------------------------------ | ----------------------- |
| Does the candidate meet ≥ 70% of skills at the target level? | Level confirmation      |
| Were level concerns from screening resolved in interviews?   | Level upgrade/downgrade |
| Did interviewers explicitly suggest a different level?       | Strong level signal     |
| Does the candidate's scope and autonomy match the level?     | Level fit               |
| Which track energized the candidate in interviews?           | Track confirmation      |

## Step 4b: Read Role Context

If the candidate has a `Req` field in their brief, read the corresponding Role
file:

```bash
ls knowledge/Roles/ | grep "{req_number}"
cat "knowledge/Roles/{matching file}"
```

Extract and include in the recommendation:

- **Remaining positions** on this req (from the Role file's `Positions` count
  minus filled candidates in the Candidates table)
- **Hiring manager** and their expectations (from the Role file and their People
  note)
- **Domain lead** and their hiring priorities (from recent meetings/emails)
- **Other candidates** on the same req — how does this candidate compare to the
  pipeline for this specific role?
- **Channel** — is this a vendor candidate or HR candidate? This affects
  onboarding timeline and engagement model.

## Step 5: Assess Against Active Pipeline

Check how this candidate compares to others at the same level:

```bash
# Read cross-candidate insights
cat knowledge/Candidates/Insights.md

# Check other candidates at the same level
for dir in knowledge/Candidates/*/; do
  if [ -f "$dir/screening.md" ]; then
    head -5 "$dir/screening.md"
  fi
done
```

This is not a ranking exercise — it provides context. Note:

- Whether this candidate fills a gap in the current pipeline
- Whether stronger candidates exist for the same role
- Whether this candidate is better suited to a different open position

## Step 6: Write Hiring Recommendation

Create `knowledge/Candidates/{Name}/recommendation.md`:

```markdown
# Hiring Recommendation — {Full Name}

**Role:** {Discipline} {Level} — {Track}
**Req:** {Req number and title, or "—"}
**Hiring manager:** {Name from Role file, or "—"}
**Domain lead:** {Name from Role file, or "—"}
**Channel:** {hr / vendor}
**Date:** {YYYY-MM-DD}
**Prepared by:** Recruiter agent (with framework analysis)

**⚠️ Advisory only — human decision required.**

---

## Recommendation

**{Hire / Hire at {adjusted level} / Do not hire}**

{3-5 sentence executive summary. Lead with the decision and the single
strongest reason. Then address the primary risk and whether interviews
resolved it. End with a clear statement of confidence.}

---

## Evidence Summary

### Process Timeline

| Date | Stage | Interviewer(s) | Outcome |
|------|-------|----------------|---------|
| {date} | CV Screening | — | {outcome} |
| {date} | {Interview type} | {names} | {outcome} |

### Final Skill Profile

Framework reference: `{discipline} {level} --track={track}`

| Skill | Expected | Final Rating | Confidence | Best Evidence | Trajectory |
| --- | --- | --- | --- | --- | --- |
| {skill} | {level} | {level} | {High/Med/Low} | {Stage that provided best evidence} | {↑ / ↓ / ―} |

**Skill match:** {N}% Strong match, {N}% Adequate, {N}% Gap

### Final Behaviour Profile

| Behaviour | Expected | Final Maturity | Best Evidence |
| --- | --- | --- | --- |
| {behaviour} | {maturity} | {maturity} | {specific observation} |

### Level Confirmation

**Target level:** {original target}
**Recommended level:** {confirmed or adjusted}

{Paragraph explaining the level decision. Reference the framework progression
criteria and specific evidence from interviews. If the level changed during
the process, explain the journey (e.g. "Initially assessed at J100, screening
identified scope concerns, decomposition confirmed J090 as the right fit").}

### Track Confirmation

**Recommended track:** {forward_deployed / platform / either}

{Paragraph explaining track fit. Reference specific interview moments that
revealed the candidate's natural orientation.}

---

## Decision Framework

Apply these **decision rules** strictly:

| Recommendation                | Criteria                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| **Hire**                      | ≥ 70% Strong match at final level, no unresolved core skill gaps, strong behaviours   |
| **Hire at adjusted level**    | Strong candidate but evidence supports a different level than originally targeted      |
| **Do not hire**               | Unresolved core skill gaps, behaviour concerns, or insufficient evidence after interviews |

### Hire Criteria Check

- [ ] ≥ 70% of skills rated Strong match at the recommended level
- [ ] No core skill gaps remain unresolved (core = top-tier skills for the
      discipline/track combination)
- [ ] All framework behaviours at or above expected maturity
- [ ] Level confirmed by interview evidence (not just CV)
- [ ] Track fit confirmed by interview evidence
- [ ] No red flags from any interview stage

### Risk Assessment

**Primary risk:** {The single biggest concern and whether it was resolved}
**Mitigation:** {How the risk can be managed if hiring proceeds}

**Secondary risks:**
- {Risk 2 — severity and mitigation}

---

## Strengths to Leverage

{What this person will bring to the team from day one. Frame in terms of
business impact, not just technical capability.}

1. **{Strength}:** {evidence and expected impact}
2. **{Strength}:** {evidence and expected impact}

## Development Areas

{What this person will need to grow into. Frame as investment, not weakness.}

1. **{Area}:** {current level → target level, suggested development path}
2. **{Area}:** {current level → target level, suggested development path}

---

## Role Context

{Context from the Role file to inform the hiring decision.}

- **Requisition:** {Req number — title}
- **Remaining positions:** {N of M filled}
- **Hiring manager:** {name} | **Domain lead:** {name}
- **Channel:** {hr / vendor — and implications for engagement model}

## Pipeline Context

{How this candidate compares to the active pipeline. Not a ranking — context
for the hiring decision.}

- **Pipeline position:** {Where this candidate sits relative to others on the
  same requisition}
- **Unique value:** {What this candidate offers that others in the pipeline don't}
- **Alternative fit:** {If not hired for this role, could they fit another
  open position? Reference other Role files.}

---

*This recommendation synthesizes all available evidence from {N} assessment
stages conducted between {first date} and {last date}. The final decision
rests with the hiring manager. All assessments are advisory.*
```

## Step 7: Update Candidate Brief and Insights

Update `knowledge/Candidates/{Name}/brief.md`:

- Update **Status** to reflect the recommendation (`recommended` /
  `not-recommended`)
- Add link: `- [Hiring Recommendation](./recommendation.md)`
- Add final pipeline entry with the recommendation date and outcome

Update `knowledge/Candidates/Insights.md` with any cross-candidate observations:

- If this candidate is the strongest at their level, note it
- If this candidate revealed a pattern about a sourcing channel, note the
  channel
- If the level adjustment has implications for other candidates, note it

**Use precise edits — don't rewrite entire files.**

## Quality Checklist

- [ ] Every skill rating traces to a specific evidence source (stage + detail)
- [ ] Evidence hierarchy is respected — interview evidence outranks CV evidence
- [ ] Level recommendation is grounded in framework progression criteria
- [ ] Track recommendation cites interview evidence, not just CV signals
- [ ] Decision rules are applied strictly — verify percentages and gap counts
- [ ] Risk assessment is honest — don't minimize real concerns to justify hiring
- [ ] Development areas are specific and actionable
- [ ] Pipeline context is factual — no ranking by protected characteristics
- [ ] Cross-candidate insights added to Insights.md where relevant
- [ ] Brief updated with recommendation link and status
- [ ] "Do not hire" is explained with the same rigour as "Hire" — the candidate
      deserves to know why if they request access (GDPR Article 15)
- [ ] Recommendation could be shown to the candidate without embarrassment
