# Plan 0800-A Part 03 — Evaluation Pipeline

Depends on Part 02 (MCP tools must be registered).

## Step 1: Evaluation protocol in Guide system prompt

Append the artifact-evaluation protocol to Guide's system prompt so the
Claude SDK receives it alongside the MCP tools. `fit-guide` already supports
non-interactive stdin mode via `librepl` (librepl/src/index.js lines 389–407:
detects `!stdin.isTTY`, buffers all input, processes each line, then exits).
No changes to `fit-guide` or `librepl` are needed.

**Modified:** `services/mcp/prompts/guide-default.md`

Append a `## Artifact Evaluation` section (~60–80 lines) covering:

1. **Trigger:** Prompt contains "evaluate" and a scope (person email, manager
   email for team, or "all" for org).
2. **Procedure:**
   - Parse scope from the prompt. Map "for {email}" to person scope, "for
     direct reports of {email}" to team scope (`manager_email`), "for all" to
     org scope (`org: true`).
   - Call `GetUnscoredArtifacts` with the parsed scope.
   - For each artifact:
     - Call `GetArtifact` to get detail.
     - Call `GetPerson` with the artifact's author email to get their profile.
     - Call `GetMarkersForProfile` with `(discipline, level, track)` from the
       profile.
     - Evaluate the artifact against each returned marker. Determine `matched`
       (boolean) and write a 1–3 sentence `rationale`.
     - `matched: false` rows are valid — write them to document what was
       checked.
     - Call `WriteEvidence` with the batch of rows for that artifact.
3. **Constraints:**
   - Every `skill_id` + `marker_text` must come verbatim from
     `GetMarkersForProfile` — never invent markers.
   - Every row must have non-null `rationale` and `level_id`.
   - Do not re-evaluate artifacts that already have evidence (they will not
     appear in `GetUnscoredArtifacts`).
4. **Multi-source note:** `GetArtifact` returns different structures per source
   type. Evaluate based on what the artifact contains (title, description,
   diff context for PRs; review body for reviews; commit message for commits).

**Verify:** `echo "evaluate unscored artifacts for actaeon@bionova.example" |
bunx fit-guide` invokes `GetUnscoredArtifacts`, evaluates artifacts, calls
`WriteEvidence`, and exits. After completion, `activity.evidence` contains rows
for Actaeon with non-null rationale. Running the same command again produces no
new rows (idempotency).
