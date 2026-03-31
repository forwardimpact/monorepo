---
name: screen-cv
description: >
  Screen candidate CVs against the engineering career framework to decide
  whether to invest interview time. Produces a structured screening assessment
  with interview/pass recommendation and suggested interview focus areas.
  Use when the user asks to evaluate a CV or when a new CV is detected.
---

# Screen CV

Screen a candidate's CV against the engineering career framework defined in
`fit-pathway`. The sole question this skill answers: **is this candidate worth
interviewing?** Every assessment is grounded in the framework — no subjective
impressions.

This is Stage 1 of a three-stage hiring pipeline:

1. **Screen CV** (this skill) — CV arrives → interview or pass
2. **Assess Interview** — transcript arrives → updated evidence profile
3. **Hiring Decision** — all stages complete → hire or not

## Trigger

Run this skill:

- When a new CV is added to `knowledge/Candidates/{Name}/`
- When a CV appears in `~/Downloads/` and is associated with a candidate
- When the user asks to screen, evaluate, or assess a CV
- When the user asks "is this person worth interviewing?"

## Prerequisites

- `fit-pathway` CLI installed (`bunx fit-pathway` must work)
- A CV file (PDF or DOCX) accessible on the filesystem
- Optionally, a target role specified by the user (discipline + level + track)

## Inputs

- CV file path (e.g. `knowledge/Candidates/{Name}/CV.pdf` or a path the user
  provides)
- Target role (optional): `{discipline} {level} --track={track}`
- Existing candidate brief (if available):
  `knowledge/Candidates/{Name}/brief.md`
- Role file (if candidate has a `Req`): `knowledge/Roles/*.md` — provides
  `Level`, `Discipline`, `Hiring manager`, and `Domain lead` for more accurate
  screening

## Outputs

- `knowledge/Candidates/{Name}/screening.md` — structured screening assessment
- Updated `knowledge/Candidates/{Name}/brief.md` — skills and summary enriched
  from CV analysis

## Output Filename Convention

The screening assessment MUST be written to `screening.md` — no other filename.
Do not use `assessment.md`, `cv-screening.md`, `evaluation.md`, or any variant.

Before writing, check whether a file with a different name already exists that
contains a CV screening (look for `# CV Screening` in the header). If found,
delete the misnamed file after writing `screening.md` to avoid duplicates.

When linking from `brief.md`, always use the exact text:
`- [CV Screening](./screening.md)`

---

## Step 1: Read the CV

Read the candidate's CV file. Extract:

| Field                   | What to look for                                    |
| ----------------------- | --------------------------------------------------- |
| **Current role**        | Most recent job title                               |
| **Years of experience** | Total and per-role tenure                           |
| **Technical skills**    | Languages, frameworks, platforms, tools mentioned   |
| **Domain experience**   | Industries, business domains, customer-facing work  |
| **Education**           | Degrees, certifications, relevant courses           |
| **Leadership signals**  | Team size, mentoring, cross-team work, architecture |
| **Scope signals**       | Scale of systems, user base, revenue impact         |
| **Communication**       | Publications, talks, open source, documentation     |
| **Gender**              | Pronouns, gendered titles (never infer from names)  |

## Step 1b: Read Role File for Context

If the candidate's brief has a `Req` field, look up the corresponding Role file:

```bash
ls knowledge/Roles/ | grep "{req_number}"
cat "knowledge/Roles/{matching file}"
```

The Role file provides:

- **Level** and **Discipline** — use as the target role if no explicit target
  was specified by the user. This is more accurate than estimating from the CV.
- **Hiring manager** and **Domain lead** — include in the screening output
  header for context.

If the Role file specifies a Level and Discipline, use them as the target role
for framework comparison (unless the user explicitly specified a different
target).

## Step 2: Look Up the Framework Reference

Use `fit-pathway` to load the reference data for assessment.

### If a target role is specified (or derived from the Role file)

```bash
# Get the full job definition
bunx fit-pathway job {discipline} {level} --track={track}

# Get the skill matrix for comparison
bunx fit-pathway job {discipline} {level} --track={track} --skills
```

### If no target role is specified

Estimate the most likely discipline and level from the CV, then look it up:

```bash
# See available disciplines and their tracks
bunx fit-pathway discipline

# See available levels
bunx fit-pathway level

# Look up the estimated role
bunx fit-pathway job {discipline} {level} --track={track}
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
bunx fit-pathway track forward_deployed
bunx fit-pathway track platform
```

Map CV evidence to track indicators:

| Forward Deployed signals              | Platform signals                        |
| ------------------------------------- | --------------------------------------- |
| Customer-facing projects              | Internal tooling / shared services      |
| Business domain immersion             | Infrastructure / platform-as-product    |
| Rapid prototyping, MVPs               | Architecture, system design             |
| Data integration, analytics           | CI/CD, DevOps, reliability              |
| Stakeholder management                | Code quality, technical debt management |
| Cross-functional work                 | Scalability, performance engineering    |
| Multiple industries or domain breadth | Deep platform ownership                 |

## Step 3: Map CV to Framework Skills

For each skill in the target job's skill matrix, assess the candidate's likely
proficiency based on CV evidence:

```bash
# Get skill detail for nuanced assessment
bunx fit-pathway skill {skill_id}
```

Use the proficiency definitions from the framework:

| Proficiency    | CV Evidence                                             |
| -------------- | ------------------------------------------------------- |
| `awareness`    | Mentioned but no project evidence                       |
| `foundational` | Used in projects, basic application                     |
| `working`      | Primary tool/skill in multiple roles, independent usage |
| `practitioner` | Led teams using this skill, mentored others, deep work  |
| `expert`       | Published, shaped org practice, industry recognition    |

**Be sceptical.** CVs inflate significantly. Default **two levels below** what
the CV implies unless the candidate provides concrete, quantified evidence
(metrics, measurable outcomes, named systems, team sizes, user/revenue scale).
Only award the directly implied level when the CV includes specific, verifiable
details — vague descriptions like "improved performance" or "led initiatives" do
not count. A skill merely listed in a "Skills" section with no project context
rates `awareness` at most.

## Step 4: Assess Behaviour Indicators

Check the CV for behaviour signals aligned with the framework:

```bash
bunx fit-pathway behaviour --list
```

Map CV evidence to behaviours:

| Behaviour                  | CV Evidence                                        |
| -------------------------- | -------------------------------------------------- |
| Own the Outcome            | End-to-end ownership, P&L impact, delivery metrics |
| Think in Systems           | Architecture decisions, system-wide reasoning      |
| Communicate with Precision | Technical writing, documentation, talks            |
| Be Polymath Oriented       | Cross-domain work, diverse tech stack              |
| Don't Lose Your Curiosity  | Side projects, continuous learning, certifications |

## Step 5: Identify Gaps and Strengths

Compare the candidate's estimated skill profile against the target job:

```bash
# If comparing progression potential
bunx fit-pathway progress {discipline} {level} --track={track}
```

Classify each skill as:

- **Strong match** — candidate meets or exceeds the expected proficiency **and**
  evidence is concrete (metrics, project specifics, scope indicators)
- **Adequate** — candidate is exactly one level below expected proficiency with
  clear project evidence, **or** meets the level but evidence is thin
- **Gap** — candidate is two or more levels below expected proficiency
- **Not evidenced** — CV doesn't mention this skill area. **Treat as a gap** for
  screening purposes — absence of evidence is not evidence of skill

## Step 6: Write Screening Assessment

Create `knowledge/Candidates/{Name}/screening.md`:

````markdown
# CV Screening — {Full Name}

**Assessed against:** {Discipline} {Level} — {Track}
**Req:** {Req number and title, or "—" if no req}
**Hiring manager:** {Name from Role file, or "—"}
**Domain lead:** {Name from Role file, or "—"}
**Date:** {YYYY-MM-DD}
**CV source:** [{filename}](./{filename})

## Summary

{2-3 sentence summary: overall fit, key strengths, primary concerns.
Frame around the screening question: is this worth an interview?}

## Estimated Profile

| Dimension      | Assessment                             |
| -------------- | -------------------------------------- |
| **Level**      | {estimated level and confidence}       |
| **Track fit**  | {forward_deployed / platform / either} |
| **Discipline** | {best discipline match}                |
| **Gender**     | {Woman / Man / —}                      |

## Skill Alignment

Framework reference: `{discipline} {level} --track={track}`

| Skill | Expected | Estimated | Status |
| --- | --- | --- | --- |
| {skill} | {framework level} | {CV-based estimate} | {✅ Strong match / 🟡 Adequate / ❌ Gap / ⬜ Not evidenced} |

### Key Strengths
- {Strength 1 — with CV evidence}
- {Strength 2 — with CV evidence}

### Key Gaps
- {Gap 1 — what's missing and why it matters for the role}
- {Gap 2 — what's missing and why it matters for the role}

## Behaviour Indicators

| Behaviour | Expected Maturity | CV Evidence | Signal |
| --- | --- | --- | --- |
| {behaviour} | {maturity} | {evidence or "—"} | {Strong / Weak / None} |

## Track Fit Analysis

{Paragraph explaining why this candidate fits forward_deployed, platform,
or could work on either. Reference specific CV evidence.}

## Screening Recommendation

**⚠️ Advisory only — human decision required.**

**Recommendation:** {Interview / Interview with focus areas / Pass}

Apply these **decision rules** strictly:

| Recommendation                   | Criteria                                                                  |
| -------------------------------- | ------------------------------------------------------------------------- |
| **Interview**                    | ≥ 70% Strong match, no core skill gaps, strong behaviour signals          |
| **Interview with focus areas**   | ≥ 50% Strong match, ≤ 2 gaps in non-core skills, no behaviour red flags  |
| **Pass**                         | All other candidates — including those with thin evidence                 |

**Threshold rule:** If more than **one third** of the target job's skills are
Gap or Not evidenced, the candidate cannot receive "Interview." If more than
**half** are Gap or Not evidenced, the candidate cannot receive "Interview with
focus areas."

When in doubt, choose the stricter recommendation. "Interview with focus areas"
should be rare — it signals a strong candidate with a specific, addressable
concern, not a marginal candidate who might work out.

**Rationale:** {3-5 sentences grounding the recommendation in framework data.
Reference specific skill gaps or strengths and their impact on the role.
Explicitly state the skill match percentage and gap count.}

## Interview Focus Areas

{Only present if recommendation is Interview or Interview with focus areas.
These are the specific uncertainties that interviews must resolve.}

- **{Area 1}:** {What to probe and why — link to a specific gap or thin evidence}
- **{Area 2}:** {What to probe and why — link to a specific gap or thin evidence}

### Suggested Interview Questions

{Generate role-specific questions using the framework:}

```bash
bunx fit-pathway interview {discipline} {level} --track={track}
````

{Select 3-5 questions most relevant to the identified gaps and focus areas. For
each question, note which gap or uncertainty it targets.}

```

## Step 7: Enrich Candidate Brief

If `knowledge/Candidates/{Name}/brief.md` exists, update it with findings:

- Add or update the **Skills** section with framework skill IDs
- Update **Summary** if the CV provides better context
- Set the **Gender** field if identifiable from the CV and not already set
- Add a link to the assessment: `- [CV Screening](./screening.md)`

**Use precise edits — don't rewrite the entire file.**

If no brief exists, note that the `track-candidates` skill should be run first
to create the candidate profile from email threads.

## Quality Checklist

- [ ] Assessment is grounded in `fit-pathway` framework data, not subjective
      opinion
- [ ] Every skill rating cites specific CV evidence or marks "Not evidenced"
- [ ] Estimated level is sceptical (two below CV claims unless proven with
      quantified evidence)
- [ ] "Not evidenced" skills are counted as gaps in the recommendation
- [ ] Recommendation follows the decision rules table — verify match percentages
      and gap counts before choosing a tier
- [ ] "Interview with focus areas" is only used for strong candidates with a
      specific, named concern — never as a soft "maybe"
- [ ] Track fit analysis references specific skill modifiers from the framework
- [ ] Interview focus areas are specific and tied to identified gaps
- [ ] Suggested interview questions target the right uncertainties
- [ ] Output file is named exactly `screening.md` — not `assessment.md` or any
      variant
- [ ] No duplicate screening file exists under a different name in the candidate
      folder
- [ ] Assessment file uses correct path format and links to CV
- [ ] Candidate brief links to screening using exact text
      `[CV Screening](./screening.md)`
- [ ] Gender field set only from explicit pronouns/titles (never name-inferred)
```
