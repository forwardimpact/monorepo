# Scoring and Recommendation

Reference data for `req-screen` Steps 4 and 6: how to rate evidence, classify
skill alignment, compute the score, and pick the recommendation tier.
Extraction, level, track, and proficiency tables live in
[rubric.md](rubric.md).

## Evidence rule — descriptions over titles

Job titles are metadata, not evidence. **Never derive proficiency from a
title. Never cap a rating because the title sounds non-engineering.** Rate
each skill from what the role descriptions say the candidate personally
built, operated, and decided — at what scale, with what autonomy.

| Evidence tier | Looks like | Rating rule |
| --- | --- | --- |
| **Concrete** | Named systems/tech + what the candidate personally did + scale or outcome ("built X serving Y users", team sizes, revenue) | Rate at face value |
| **Contextual** | Skill exercised in described project work, but no quantification | Rate at face value **minus one** level |
| **Bare mention** | Keyword in a Skills section, or vague claims ("led initiatives") with no project context | `awareness` at most; if the expected level is `working`+, classify **Unknown**, not Gap |

Only Concrete evidence can support a **Strong match**. Contextual evidence
caps a skill at **Adequate**. Example: title "Solutions Architect" with
"built a VS Code extension on LLM APIs, adopted by the department; designed a
250-node HPC cluster" rates Concrete (`working`+ / `practitioner`) — the
title never enters the rating. Title "Principal AI Engineer" with only "drove
AI initiatives" is a bare mention: `awareness`, classified Unknown.

## Skill alignment classification

- **Strong match** — meets or exceeds expected proficiency on **Concrete**
  evidence.
- **Adequate** — one level below expected with project evidence, or at level
  on Contextual evidence.
- **Gap** — the skill *appears in project context* and the best evidence
  lands two or more levels below expected. A Gap is an affirmative finding.
- **Unknown — probe at interview** — the CV does not show the skill in
  project context (absent, or bare mention only). CVs are 1–2 pages; nobody
  evidences 30 skills. **Unknown is not a gap.** Exclude it from the match
  score. List every core-set Unknown under Interview Focus Areas.

## Recommendation decision rules

Score the **number and strength of positive signals**. Never count absences.

### Score calculation recipe (mechanical — show your work)

1. Fetch the matrix once:
   `bunx fit-pathway job {discipline} {level} --track={track} --json`
2. **Core set** = every `skillMatrix` entry whose `"type"` is `"core"` or
   `"track"`.
3. Count from the Skill Alignment table: `S` Strong, `A` Adequate, `G` Gap,
   `U` Unknown. `E = S + A + G` (evidenced skills).
4. **Match % = (S + 0.5 × A) / E × 100**, rounded.
5. **Core signals** = core-set skills rated Strong or Adequate.
   **Core gaps** = core-set skills rated Gap.
6. Copy all six numbers into the screening's Score Calculation block.

### Recommendation tiers (all conditions in a row must hold)

| Recommendation | Conditions |
| --- | --- |
| **Interview** | Match ≥ 70 % · E ≥ 10 · core gaps = 0 · core signals ≥ 5 · no behaviour red flags |
| **Interview with focus areas** | Match ≥ 50 % · E ≥ 8 · core gaps ≤ 2 · core signals ≥ 4 · no behaviour red flags |
| **Pass** | Anything else |

**Floors, not ceilings:** the E and core-signal minimums stop a narrow CV
(three skills, all Strong, Match 100 %) from buying an interview on a tiny
denominator. If more than half the core set is Unknown, cap at "Interview
with focus areas" and name each core Unknown as a focus area.

Screening is Stage 1 of 3. The question is whether an interview is worth an
hour — `req-decide` enforces the ≥ 70 %-Strong hire bar later, with interview
evidence. On a boundary, prefer the interviewing tier and name the doubt as a
focus area.

**Calibration check:** roughly 15–40 % of a screened batch should reach an
interview tier. A batch at 0 % or above ~60 % signals mis-calibration (wrong
track, wrong level, or a sourcing-funnel mismatch). Flag it to the hiring
manager instead of forcing the numbers.
