# Screening Rubric

Reference data for `req-screen` Steps 1–5: what to extract, level and track
estimation, and proficiency/behaviour mapping. Classification, scoring, and
the recommendation tiers live in [scoring.md](scoring.md).

## What to extract from the CV

| Field                   | What to look for                                               |
| ----------------------- | -------------------------------------------------------------- |
| **Current role**        | Most recent job title                                          |
| **Years of experience** | Total and per-role tenure                                      |
| **Technical skills**    | Languages, platforms, agent-aligned standards, tools mentioned |
| **Domain experience**   | Industries, business domains, customer-facing work             |
| **Education**           | Degrees, certifications, relevant courses                      |
| **Leadership signals**  | Team size, mentoring, cross-team work, architecture            |
| **Scope signals**       | Scale of systems, user base, revenue impact                    |
| **Communication**       | Publications, talks, open source, documentation                |
| **Gender**              | Pronouns or gendered titles only. Never infer it from a name   |

## Level estimation heuristics

Estimate level from **scope and impact evidence in role descriptions**, not
from title vocabulary. Title ladders vary by company, country, and era.
Career-switchers: rate the scope they carried, wherever they carried it.

Pick the level where **at least two rows** match the candidate's strongest
sustained evidence:

| Signal | J040 (Level I) | J060 (Level II) | J070 (Level III) | J090 (Staff) | J100 (Principal) |
| --- | --- | --- | --- | --- | --- |
| **Autonomy** | executed assigned tasks | owned features independently | owned whole systems | set direction for an area | set direction across an org/BU |
| **Ownership breadth** | components | a service | several systems, mentoring | cross-team initiatives | programs, org-wide practices |
| **Scale served** | one team | one team's users | department / large user base | multiple departments, high-scale systems | enterprise scale, external visibility |

Corroboration rules:

- **Years** are a plausibility check only (J100 is implausible under ~10
  years), never the driver.
- **Titles** may confirm an estimate. They may never lower one that scope
  evidence supports.
- **Advisory/consulting scope** counts at the level the candidate *personally
  owned* inside the engagement — "designed and delivered" scores full;
  "advised on / supported" scores one level lower.
- State the estimate as a range with confidence (e.g. "J090 ± one level,
  medium confidence") and name the rows that drove it.

## Track-fit signals

| Forward Deployed signals             | Platform signals                        |
| ------------------------------------ | --------------------------------------- |
| Customer-facing projects             | Internal tooling / shared services      |
| Business domain immersion            | Infrastructure / platform-as-product    |
| Rapid prototyping, MVPs              | Architecture, system design             |
| Data integration, analytics          | CI/CD, DevOps, reliability              |
| Stakeholder management               | Code quality, technical-debt management |
| Cross-functional work                | Scalability, performance engineering    |
| Multiple industries / domain breadth | Deep platform ownership                 |

## Track modifiers

Tracks shift the *expected* proficiency of skills up or down one level per
capability bucket relative to the discipline base. **Never hand-apply
modifiers.** Always fetch the adjusted matrix with `--track={track} --json`;
the `"type": "track"` skills it returns are track-defining and belong to the
core set. Track ids are hyphenated: `forward-deployed`, `platform`, `dx`,
`sre`.

## Proficiency mapping

| Proficiency    | CV evidence                                               |
| -------------- | --------------------------------------------------------- |
| `awareness`    | Mentioned but no project evidence                         |
| `foundational` | Used in projects, basic application                       |
| `working`      | Primary tool/skill in multiple roles, independent usage   |
| `practitioner` | Led teams that use this skill, mentored others, deep work |
| `expert`       | Published, shaped org practice, industry recognition      |

Rate each skill with the evidence rule (descriptions over titles) in
[scoring.md](scoring.md#evidence-rule--descriptions-over-titles).

## Behaviour signals

| Behaviour                  | CV evidence                                        |
| -------------------------- | -------------------------------------------------- |
| Own the Outcome            | End-to-end ownership, P&L impact, delivery metrics |
| Think in Systems           | Architecture decisions, system-wide reasoning      |
| Communicate with Precision | Technical writing, documentation, talks            |
| Be Polymath Oriented       | Cross-domain work, diverse tech stack              |
| Don't Lose Your Curiosity  | Side projects, continuous learning, certifications |
