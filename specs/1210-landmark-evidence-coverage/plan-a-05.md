# Plan 1210-a Part 05: Guide skill update

Edit `evaluate-evidence` step (e) so Guide's `WriteEvidence` calls carry
`provenance: 'agent_attested'`. Without this edit, Guide-judged rows
fall through to the DB default `human_attested` (criterion 7 fail). The
skill is markdown read by the LLM at runtime, so verification is by
inspection plus an end-to-end read-back where the local Guide stack is
available.

Libraries used: none.

## Step 5.1 — Update step (e) signature

Modified: `products/guide/starter/skills/evaluate-evidence/SKILL.md`

Replace:

> e. Call `WriteEvidence` once per marker with: `artifact_id`,
> `skill_id`, `level_id`, `marker_text`, `matched`, `rationale`. Call
> multiple markers in parallel for throughput.

with:

> e. Call `WriteEvidence` once per marker with: `artifact_id`,
> `skill_id`, `level_id`, `marker_text`, `matched`, `rationale`, and
> `provenance: 'agent_attested'`. The `provenance` argument tags the
> row as agent-judged so downstream consumers can distinguish it from
> human-attested rows. Call multiple markers in parallel for
> throughput.

Notes:

- `'agent_attested'` is the canonical string from
  `products/map/src/activity/provenance.js` (Part 01 Step 1.4). It is
  not invented; it is one of `PROVENANCE_CLASSES`.
- The existing six argument names stay in the order they were; the
  new field is appended so the comma sequence reads as a stable
  extension, not a rewrite.

Verify: `git diff products/guide/starter/skills/evaluate-evidence/SKILL.md`
shows the step (e) edit and no other change.

## Step 5.2 — Document the provenance class in the skill body

Modified: `products/guide/starter/skills/evaluate-evidence/SKILL.md`

Add a single line to the `## Constraints` section:

> - The `provenance` argument is always `'agent_attested'` for rows
>   this skill writes. Other values exist for other producers; this
>   skill does not emit them.

Notes:

- The skill author may otherwise be tempted to think `provenance` is
  optional or context-dependent. The constraint pins it to one literal
  value so the runtime LLM does not paraphrase, drop, or substitute.

Verify: `git diff products/guide/starter/skills/evaluate-evidence/SKILL.md`
shows the step (e) edit + the new constraint line and no other change.

## Step 5.3 — Verification

Two paths; the implementer uses (a) at minimum and (b) when Guide's
local stack is available.

(a) **Inspection.** Re-read step (e) after the edit and confirm the
seventh named field is `provenance: 'agent_attested'`. The skill body
carries no other `WriteEvidence` call site, so this is the only line
to check (criterion 7(a)).

(b) **End-to-end.** Available when Guide's stack runs locally
(`bunx fit-rc start guide` is green for `mcp` + `pathway` + `map`
services per `services/CLAUDE.md` § Running services, and supabase is
up). Without those services running, (b) is not available and the
implementer falls through to (a) only; the PR body records which path
was taken.

Run the evaluate-evidence skill against a seeded persona with at least
one scoreable artifact:

```text
bunx fit-guide -p "evaluate for daedalus@bionova.example"
```

After the run, query the evidence rows that were just written:

```sql
SELECT artifact_id, skill_id, marker_text, provenance
FROM activity.evidence
WHERE provenance = 'agent_attested'
ORDER BY created_at DESC
LIMIT 10;
```

Assert at least one row is returned for the persona's artifacts and that
every row's `provenance = 'agent_attested'` (criterion 7(b)).

Notes:

- (a) alone is sufficient to merge; (b) raises confidence and exercises
  the full Part 01 + Part 05 round-trip.
- If (b) is taken and any row lands with `provenance != 'agent_attested'`,
  the failure is in Part 01's `WriteEvidence` handler (the RPC field is
  being dropped) or the codegen output. Re-check Part 01 Step 1.2 +
  Step 1.5.

## Verification

```text
git diff products/guide/starter/skills/evaluate-evidence/SKILL.md
```

No automated test exists for SKILL.md content; the criterion 7
verification is inspection-driven (and end-to-end where the Guide
stack is locally available). The PR body records which verification
path was taken.
