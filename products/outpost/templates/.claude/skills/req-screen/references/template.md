# Screening Output Template

Reference template for `req-screen` Step 6. Save to
`Knowledge/Candidates/{Name}/screening.md`. The filename **must** be
`screening.md`. Do not use `assessment.md`, `cv-screening.md`, or any variant.
Look in the folder for a misnamed screening file with `# CV Screening` in the
header. If one exists, delete it after you write the new one.

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

| Dimension      | Assessment                                                |
| -------------- | --------------------------------------------------------- |
| **Level**      | {estimated range and confidence, e.g. "J090 ± 1, medium"} |
| **Track fit**  | {forward-deployed / platform / dx / sre / either}         |
| **Discipline** | {best discipline match}                                   |
| **Gender**     | {Woman / Man / —}                                         |

## Skill Alignment

Standard reference: `{discipline} {level} --track={track}`

| Skill | Expected | Estimated | Status |
| --- | --- | --- | --- |
| {skill} | {standard level} | {CV-based estimate} | {✅ Strong / 🟡 Adequate / ❌ Gap / ⬜ Unknown — probe at interview} |

### Score Calculation

S = {n} Strong · A = {n} Adequate · G = {n} Gap · U = {n} Unknown
E = S + A + G = {n} · **Match = (S + 0.5·A) / E = {nn} %**
Core set ({n} skills, `type: core|track`): core signals = {n}, core gaps = {n}
Tier gates: {which Interview / Interview-with-focus-areas conditions pass or fail}

### Key Strengths
- {Strength 1 — with CV evidence}
- {Strength 2 — with CV evidence}

### Key Gaps
- {Gap 1 — affirmative below-bar evidence and why it matters}
- {Gap 2 — affirmative below-bar evidence and why it matters}

### Unknowns to Probe
- {Core-set skills with no project-context evidence — each becomes an
  interview focus area, not a gap}

## Behaviour Indicators

| Behaviour | Expected Maturity | CV Evidence | Signal |
| --- | --- | --- | --- |
| {behaviour} | {maturity} | {evidence or "—"} | {Strong / Weak / None} |

## Track Fit Analysis

{Paragraph explaining why the candidate fits forward-deployed,
platform, dx, sre, or either. Reference specific CV evidence.}

## Screening Recommendation

**⚠️ Advisory only — human decision required.**

**Recommendation:** {Interview / Interview with focus areas / Pass}

**Rationale:** {3–5 sentences grounded in standard data. Cite the Match %,
core signals/gaps, and the strongest concrete evidence. The score is built
from positive signals, so lead with what the CV demonstrates.}

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
