# Screening Output Template

Reference template for `req-screen` Step 6. Save to
`Knowledge/Candidates/{Name}/screening.md`. Filename **must** be `screening.md`
— not `assessment.md`, `cv-screening.md`, or any variant. If a misnamed
screening file exists in the folder (look for `# CV Screening` in the header),
delete it after writing.

```markdown
# CV Screening — {Full Name}

**Assessed against:** {Discipline} {Level} — {Track}
**Req:** {Req number and title, or "—"}
**Hiring manager:** {Name from Role file, or "—"}
**Domain lead:** {Name from Role file, or "—"}
**Date:** {YYYY-MM-DD}
**CV source:** [{filename}](./{filename})

## Summary

{2–3 sentences: overall fit, key strengths, primary concerns. Frame
around the screening question — is this worth an interview?}

## Estimated Profile

| Dimension      | Assessment                             |
| -------------- | -------------------------------------- |
| **Level**      | {estimated level and confidence}       |
| **Track fit**  | {forward-deployed / platform / either} |
| **Discipline** | {best discipline match}                |
| **Gender**     | {Woman / Man / —}                      |

## Skill Alignment

Standard reference: `{discipline} {level} --track={track}`

| Skill | Expected | Estimated | Status |
| --- | --- | --- | --- |
| {skill} | {standard level} | {CV-based estimate} | {✅ Strong / 🟡 Adequate / ❌ Gap / ⬜ Not evidenced} |

### Key Strengths
- {Strength 1 — with CV evidence}
- {Strength 2 — with CV evidence}

### Key Gaps
- {Gap 1 — what's missing and why it matters}
- {Gap 2 — what's missing and why it matters}

## Behaviour Indicators

| Behaviour | Expected Maturity | CV Evidence | Signal |
| --- | --- | --- | --- |
| {behaviour} | {maturity} | {evidence or "—"} | {Strong / Weak / None} |

## Track Fit Analysis

{Paragraph explaining why the candidate fits forward-deployed,
platform, or either. Reference specific CV evidence.}

## Screening Recommendation

**⚠️ Advisory only — human decision required.**

**Recommendation:** {Interview / Interview with focus areas / Pass}

**Rationale:** {3–5 sentences grounded in standard data. Cite specific
gaps or strengths, the skill match percentage, and the gap count.}

## Interview Focus Areas

{Only when the recommendation is Interview or Interview with focus
areas. These are uncertainties the interviews must resolve.}

- **{Area 1}:** {What to probe and why — link to a specific gap or thin
  evidence}
- **{Area 2}:** {What to probe and why}

### Suggested Interview Questions

Generate with `bunx fit-pathway interview {discipline} {level}
--track={track}`. Pick 3–5 questions most relevant to the gaps and
focus areas; note which gap each targets.
```

## Brief link

In `brief.md`, link the screening with this exact text:

```markdown
- [CV Screening](./screening.md)
```
