---
name: req-decide
description: >
  Synthesize all evidence (CV screening, interview assessments, transcripts)
  into a final hiring recommendation. Produces a comprehensive recommendation
  document with full evidence trail, level/track/discipline confirmation, and
  a clear hire/no-hire decision. Use when all interview stages are complete.
---

# Hiring Decision

Synthesize all available evidence for a candidate into a final hiring
recommendation. This is the culmination of the hiring pipeline. Every prior
assessment feeds in.

This is **Stage 3** of the three-stage pipeline:

1. `req-screen` — CV → interview or pass.
2. `req-assess` — transcript → updated evidence.
3. **Hire / no hire** (this skill) — all stages complete → recommendation.

## Trigger

- The user asks for a final hiring recommendation.
- All planned interview stages for a candidate are complete.
- The user asks "should we hire {Name}?".
- The user needs to compare finalists for a position.

## Prerequisites

- `fit-pathway` CLI installed.
- `Knowledge/Candidates/{Name}/screening.md` exists.
- At least one `Knowledge/Candidates/{Name}/interview-*.md`.
- `Knowledge/Candidates/{Name}/brief.md` exists.

## Inputs

- All artifacts in `Knowledge/Candidates/{Name}/`.
- Standard data via `fit-pathway`.
- `Knowledge/Candidates/Insights.md` — cross-candidate context.
- `Knowledge/Roles/*.md` — the candidate's requisition (positions, hiring
  manager, domain lead). Check the `**Status:**` field to distinguish active
  from historical reqs.
- `Knowledge/Priorities/*.md` — strategic context.
- Other active candidates at the same level — relative position.

## Outputs

- `Knowledge/Candidates/{Name}/recommendation.md` — final recommendation.
- Updated `Knowledge/Candidates/{Name}/brief.md` — status and link.
- Updated `Knowledge/Candidates/Insights.md` — cross-candidate observations.

<do_confirm_checklist goal="Verify the recommendation is grounded and
audit-ready">

- [ ] Trace every skill rating to a specific evidence source (stage + detail).
- [ ] Respect the evidence hierarchy. Interview evidence outranks CV.
- [ ] Ground the level recommendation in standard progression criteria.
- [ ] Cite interview evidence for the track recommendation. A CV alone is not
      enough.
- [ ] Apply the decision rules strictly. Verify the match % and the gap counts.
- [ ] Keep the risk assessment honest. Do not minimise a concern to justify a
      hire.
- [ ] Write "Do not hire" with the same rigour as "Hire" (GDPR Article 15 lets
      the candidate request access).
- [ ] Update the brief with `[Hiring Recommendation](./recommendation.md)` and
      a final pipeline entry.
- [ ] Write a recommendation you could show to the candidate without
      embarrassment.

</do_confirm_checklist>

## Procedure

### 1. Gather all evidence

```bash
ls Knowledge/Candidates/{Name}/
```

Read in order: `brief.md`, `screening.md`, every `interview-*.md`, relevant
`transcript-*.md`, and `panel.md` if present. Build the chronological evidence
timeline (date / stage / source / key finding).

### 2. Build the final skill profile

```bash
bunx fit-pathway job {discipline} {level} --track={track} --skills
bunx fit-pathway progress {discipline} {level} --track={track}
```

For each skill in the target job, use the
[evidence hierarchy](references/rubric.md#evidence-hierarchy) to pick the
highest-fidelity evidence. Record final rating, best evidence source,
trajectory, confidence.

### 3. Build the final behaviour profile

```bash
bunx fit-pathway behaviour --list
```

Apply the same hierarchy ([reference](references/rubric.md#behaviour-evidence)).
Record final maturity, best evidence, consistency.

### 4. Confirm level and track

```bash
bunx fit-pathway job {discipline} {lower_level} --track={track}
bunx fit-pathway job {discipline} {target_level} --track={track}
bunx fit-pathway progress {discipline} {lower_level} --track={track}
```

Apply the level-confirmation criteria in
[references/rubric.md](references/rubric.md#level-confirmation-criteria).

### 5. Read role context

If `brief.md` carries a `Req`:

```bash
ls Knowledge/Roles/ | grep "{req_number}"
cat "Knowledge/Roles/{matching file}"
```

Check the `**Status:**` field. Capture remaining positions, hiring manager,
domain lead, goal alignment, other candidates on the same req, and channel
(hr / vendor). Frame the recommendation in terms of strategic impact.

### 6. Assess against the active pipeline

```bash
cat Knowledge/Candidates/Insights.md

for dir in Knowledge/Candidates/*/; do
  if [ -f "$dir/screening.md" ]; then
    head -5 "$dir/screening.md"
  fi
done
```

Apply the pipeline-context guidance in
[references/rubric.md](references/rubric.md#pipeline-context-step-5).

### 7. Pick the recommendation

Apply the [decision rules](references/rubric.md#decision-rules) and run the
[hire criteria check](references/rubric.md#hire-criteria-check).

### 8. Write the recommendation

Use the template in [references/template.md](references/template.md). Save to
`Knowledge/Candidates/{Name}/recommendation.md`. Carry the **advisory-only**
banner. Cite specific evidence in skill, behaviour, level, and track sections.

### 9. Update brief and insights

Update `brief.md`:

- Set `Status` to `recommended` or `not-recommended`.
- Append `- [Hiring Recommendation](./recommendation.md)`.
- Add the final pipeline entry with date and outcome.

Update `Knowledge/Candidates/Insights.md` only when a cross-candidate
observation deserves a record (strongest at level, a pattern in the sourcing
channel, level-adjustment implications).

Use targeted Edit operations. Never rewrite entire files.
