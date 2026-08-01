# Screening Rubric

Reference data for `req-screen` Steps 1, 3, 4, 5, and 6 (recommendation).

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

| CV signal                                    | Likely level     |
| -------------------------------------------- | ---------------- |
| 0–2 years, junior titles, learning signals   | J040 (Level I)   |
| 2–5 years, mid-level titles, independent     | J060 (Level II)  |
| 5–8 years, senior titles, mentoring signals  | J070 (Level III) |
| 8–12 years, staff/lead titles, area scope    | J090 (Staff)     |
| 12+ years, principal titles, org-wide impact | J100 (Principal) |

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

## Proficiency mapping

| Proficiency    | CV evidence                                               |
| -------------- | --------------------------------------------------------- |
| `awareness`    | Mentioned but no project evidence                         |
| `foundational` | Used in projects, basic application                       |
| `working`      | Primary tool/skill in multiple roles, independent usage   |
| `practitioner` | Led teams that use this skill, mentored others, deep work |
| `expert`       | Published, shaped org practice, industry recognition      |

### Scepticism rule

CVs inflate. Default **two levels below** what the CV implies. Make an
exception when the candidate provides concrete, quantified evidence (metrics,
named systems, team sizes, user/revenue scale). Vague phrases like "improved
performance" or "led initiatives" do not count. A skill that appears only in a
"Skills" section with no project context is `awareness` at most.

## Behaviour signals

| Behaviour                  | CV evidence                                        |
| -------------------------- | -------------------------------------------------- |
| Own the Outcome            | End-to-end ownership, P&L impact, delivery metrics |
| Think in Systems           | Architecture decisions, system-wide reasoning      |
| Communicate with Precision | Technical writing, documentation, talks            |
| Be Polymath Oriented       | Cross-domain work, diverse tech stack              |
| Don't Lose Your Curiosity  | Side projects, continuous learning, certifications |

## Skill alignment classification

- **Strong match** — meets or exceeds expected proficiency **and** evidence is
  concrete (metrics, project specifics, scope indicators).
- **Adequate** — exactly one level below expected with clear project evidence,
  **or** at level but evidence thin.
- **Gap** — two or more levels below expected.
- **Not evidenced** — the CV does not mention this skill area. **Treat it as a
  gap.** Absence of evidence is not evidence of skill.

## Recommendation decision rules

| Recommendation                 | Criteria                                                                 |
| ------------------------------ | ------------------------------------------------------------------------ |
| **Interview**                  | ≥ 70 % Strong match, no core-skill gaps, strong behaviour signals        |
| **Interview with focus areas** | ≥ 50 % Strong match, ≤ 2 gaps in non-core skills, no behaviour red flags |
| **Pass**                       | Everything else, including thin evidence                                 |

**Threshold rule:** if more than **one third** of the target job's skills are
Gap or Not evidenced, the candidate cannot receive "Interview." If more than
**half** are Gap or Not evidenced, the candidate cannot receive "Interview with
focus areas."

When in doubt, choose the stricter recommendation. "Interview with focus areas"
should be rare. Use it for a strong candidate with a specific, named concern.
Do not use it for a marginal candidate.
