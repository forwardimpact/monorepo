---
name: evaluate-evidence
description: Evaluate engineering artifacts against skill markers and write evidence rows for Landmark.
---

# Evaluate Evidence

Evaluate engineering artifacts against an agent-aligned engineering standard and
write evidence rows that Landmark presents.

## Trigger

The prompt must contain "evaluate" and one of:

- **Person scope:** "for {email}" — `GetUnscoredArtifacts({ email })`
- **Team scope:** "for direct reports of {email}" —
  `GetUnscoredArtifacts({ manager_email: email })`
- **Org scope:** "for all" — `GetUnscoredArtifacts({ org: true })`

## Procedure

1. Parse the scope from the prompt.
2. Call `GetUnscoredArtifacts` with the parsed scope. If the result is empty,
   report "no unscored artifacts" and exit.
3. For each artifact returned:
   a. Call `GetArtifact` with the artifact's id to get its detail.
   b. Call `GetPerson` with the artifact's author email to get their profile
      (discipline, level, track).
   c. Call `GetMarkersForProfile` with the profile to get the markers the
      engineer is expected to demonstrate. Each line is tab-separated:
      `skill_id\tlevel_id\tmarker_text`.
   d. Evaluate the artifact against each returned marker:
      - Determine `matched` (boolean): does the artifact demonstrate this
        marker?
      - Write a 1-3 sentence `rationale` explaining your reasoning.
      - `matched: false` rows are valid — write them to document what was
        checked and not found.
   e. Call `WriteEvidence` once per marker with: `artifact_id`, `skill_id`,
      `level_id`, `marker_text`, `matched`, `rationale`, and
      `provenance: 'agent_attested'`. The `provenance` argument tags the
      row as agent-judged so downstream consumers can distinguish it from
      human-attested rows. Call multiple markers in parallel for
      throughput.

## Constraints

- Every `skill_id` + `marker_text` pair must come **verbatim** from
  `GetMarkersForProfile` — never invent or paraphrase markers.
- Every row must have non-null `rationale` and `level_id`.
- Do not re-evaluate artifacts that already have evidence — they will not
  appear in `GetUnscoredArtifacts`.
- Evaluation is idempotent: `WriteEvidence` upserts on
  `(artifact_id, skill_id, level_id, marker_text)`.
- The `provenance` argument is always `'agent_attested'` for rows this
  skill writes. Other values exist for other producers; this skill does
  not emit them.

## Multi-source note

`GetArtifact` returns different structures per source type. Evaluate based on
what the artifact contains:

- **Pull requests:** title, description, diff context, review thread
- **Reviews:** review body, comments, verdict
- **Commits:** commit message, changed files

After all artifacts are evaluated, report the count of evidence rows written
and exit.
