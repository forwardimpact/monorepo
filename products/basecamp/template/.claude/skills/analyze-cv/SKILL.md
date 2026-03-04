---
name: analyze-cv
description: >
  Analyze candidate CVs against the engineering career framework using
  fit-pathway as the reference point. Assess skill alignment, identify track
  fit (forward_deployed vs platform), estimate career level, and produce
  structured assessments. Use when the user asks to evaluate a CV, compare a
  candidate to a role, or assess engineering fit.
---

# Analyze CV

Analyze a candidate's CV against the engineering career framework defined in
`fit-pathway`. Produces a structured assessment: estimated career level, track
fit, skill alignment, gaps, and a hiring recommendation. Every assessment is
grounded in the framework — no subjective impressions.

## Trigger

Run this skill:

- When the user asks to analyze, evaluate, or assess a CV
- When a new CV is added to `knowledge/Candidates/{Name}/`
- When the user asks "is this person a fit for {role}?"
- When comparing a candidate's background against a specific job level and track

## Prerequisites

- `fit-pathway` CLI installed (`npx fit-pathway` must work)
- A CV file (PDF or DOCX) accessible on the filesystem
- Optionally, a target role specified by the user (discipline + level + track)

## Inputs

- CV file path (e.g. `knowledge/Candidates/{Name}/CV.pdf` or a path the user
  provides)
- Target role (optional): `{discipline} {level} --track={track}`
- Existing candidate brief (if available):
  `knowledge/Candidates/{Name}/brief.md`

## Outputs

- `knowledge/Candidates/{Name}/assessment.md` — structured CV assessment
- Updated `knowledge/Candidates/{Name}/brief.md` — skills and summary enriched
  from CV analysis

---

## Step 1: Read the CV

Read the candidate's CV file. Extract:

| Field                  | What to look for                                       |
| ---------------------- | ------------------------------------------------------ |
| **Current role**       | Most recent job title                                  |
| **Years of experience**| Total and per-role tenure                              |
| **Technical skills**   | Languages, frameworks, platforms, tools mentioned      |
| **Domain experience**  | Industries, business domains, customer-facing work     |
| **Education**          | Degrees, certifications, relevant courses              |
| **Leadership signals** | Team size, mentoring, cross-team work, architecture    |
| **Scope signals**      | Scale of systems, user base, revenue impact            |
| **Communication**      | Publications, talks, open source, documentation        |
| **Gender**             | Pronouns, gendered titles, first name if unambiguous   |

## Step 2: Look Up the Framework Reference

Use `fit-pathway` to load the reference data for assessment.

### If a target role is specified

```bash
# Get the full job definition
npx fit-pathway job {discipline} {level} --track={track}

# Get the skill matrix for comparison
npx fit-pathway job {discipline} {level} --track={track} --skills
```

### If no target role is specified

Estimate the most likely discipline and level from the CV, then look it up:

```bash
# See available disciplines and their tracks
npx fit-pathway discipline

# See available levels
npx fit-pathway level

# Look up the estimated role
npx fit-pathway job {discipline} {level} --track={track}
```

**Estimation heuristics:**

| CV Signal                                    | Likely Level     |
| -------------------------------------------- | ---------------- |
| 0-2 years, junior titles, learning signals   | J040 (Level I)   |
| 2-5 years, mid-level titles, independent     | J060 (Level II)  |
| 5-8 years, senior titles, mentoring signals  | J070 (Level III) |
| 8-12 years, staff/lead titles, area scope    | J090 (Staff)     |
| 12+ years, principal titles, org-wide impact | J100 (Principal) |

### Track fit estimation

Use `fit-pathway` to compare tracks:

```bash
npx fit-pathway track forward_deployed
npx fit-pathway track platform
```

Map CV evidence to track indicators:

| Forward Deployed signals                     | Platform signals                            |
| -------------------------------------------- | ------------------------------------------- |
| Customer-facing projects                     | Internal tooling / shared services          |
| Business domain immersion                    | Infrastructure / platform-as-product        |
| Rapid prototyping, MVPs                      | Architecture, system design                 |
| Data integration, analytics                  | CI/CD, DevOps, reliability                  |
| Stakeholder management                       | Code quality, technical debt management     |
| Cross-functional work                        | Scalability, performance engineering        |
| Multiple industries or domain breadth        | Deep platform ownership                     |

## Step 3: Map CV to Framework Skills

For each skill in the target job's skill matrix, assess the candidate's likely
proficiency based on CV evidence:

```bash
# Get skill detail for nuanced assessment
npx fit-pathway skill {skill_id}
```

Use the proficiency definitions from the framework:

| Proficiency    | CV Evidence                                              |
| -------------- | -------------------------------------------------------- |
| `awareness`    | Mentioned but no project evidence                        |
| `foundational` | Used in projects, basic application                      |
| `working`      | Primary tool/skill in multiple roles, independent usage  |
| `practitioner` | Led teams using this skill, mentored others, deep work   |
| `expert`       | Published, shaped org practice, industry recognition     |

**Be conservative.** CVs inflate; default one level below what's claimed unless
there's concrete evidence (metrics, project details, scope indicators).

## Step 4: Assess Behaviour Indicators

Check the CV for behaviour signals aligned with the framework:

```bash
npx fit-pathway behaviour --list
```

Map CV evidence to behaviours:

| Behaviour                    | CV Evidence                                        |
| ---------------------------- | -------------------------------------------------- |
| Own the Outcome              | End-to-end ownership, P&L impact, delivery metrics |
| Think in Systems             | Architecture decisions, system-wide reasoning      |
| Communicate with Precision   | Technical writing, documentation, talks            |
| Be Polymath Oriented         | Cross-domain work, diverse tech stack              |
| Don't Lose Your Curiosity    | Side projects, continuous learning, certifications |

## Step 5: Identify Gaps and Strengths

Compare the candidate's estimated skill profile against the target job:

```bash
# If comparing progression potential
npx fit-pathway progress {discipline} {level} --track={track}
```

Classify each skill as:

- **Strong match** — candidate meets or exceeds the expected proficiency
- **Adequate** — candidate is within one level of expected proficiency
- **Gap** — candidate is two or more levels below expected proficiency
- **Not evidenced** — CV doesn't mention this skill area

## Step 6: Write Assessment

Create `knowledge/Candidates/{Name}/assessment.md`:

```markdown
# CV Assessment — {Full Name}

**Assessed against:** {Discipline} {Level} — {Track}
**Date:** {YYYY-MM-DD}
**CV source:** [{filename}](./{filename})

## Summary

{2-3 sentence summary: overall fit, key strengths, primary concerns}

## Estimated Profile

| Dimension        | Assessment                                |
| ---------------- | ----------------------------------------- |
| **Level**        | {estimated level and confidence}          |
| **Track fit**    | {forward_deployed / platform / either}    |
| **Discipline**   | {best discipline match}                   |
| **Gender**       | {Woman / Man / —}                         |

## Skill Alignment

| Skill | Expected | Estimated | Status |
| --- | --- | --- | --- |
| {skill} | {framework level} | {CV-based estimate} | {Strong/Adequate/Gap/Not evidenced} |

### Key Strengths
- {Strength 1 — with CV evidence}
- {Strength 2 — with CV evidence}

### Key Gaps
- {Gap 1 — what's missing and why it matters for the role}
- {Gap 2 — what's missing and why it matters for the role}

## Behaviour Indicators

| Behaviour | Expected Maturity | CV Evidence | Signal |
| --- | --- | --- | --- |
| {behaviour} | {maturity} | {evidence or "—"} | {Strong/Weak/None} |

## Track Fit Analysis

{Paragraph explaining why this candidate fits forward_deployed, platform,
or could work on either. Reference specific CV evidence.}

## Hiring Recommendation

**Recommendation:** {Proceed / Proceed with reservations / Do not proceed}

**Rationale:** {3-5 sentences grounding the recommendation in framework data.
Reference specific skill gaps or strengths and their impact on the role.}

**Interview focus areas:**
- {Area 1 — what to probe in interviews to validate}
- {Area 2 — what to probe in interviews to validate}
```

## Step 7: Enrich Candidate Brief

If `knowledge/Candidates/{Name}/brief.md` exists, update it with findings:

- Add or update the **Skills** section with framework skill IDs
- Update **Summary** if the CV provides better context
- Set the **Gender** field if identifiable from the CV and not already set
- Add a link to the assessment: `- [CV Assessment](./assessment.md)`

**Use precise edits — don't rewrite the entire file.**

If no brief exists, note that the `track-candidates` skill should be run first
to create the candidate profile from email threads.

## Quality Checklist

- [ ] Assessment is grounded in `fit-pathway` framework data, not subjective
  opinion
- [ ] Every skill rating cites specific CV evidence or marks "Not evidenced"
- [ ] Estimated level is conservative (one below CV claims unless proven)
- [ ] Track fit analysis references specific skill modifiers from the framework
- [ ] Gaps are actionable — they suggest interview focus areas
- [ ] Assessment file uses correct path format and links to CV
- [ ] Candidate brief updated with skill tags and assessment link
- [ ] Gender field set in both assessment and brief where identifiable
