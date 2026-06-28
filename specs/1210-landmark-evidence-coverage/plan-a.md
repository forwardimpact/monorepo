# Plan 1210-a: Landmark evidence coverage

HOW/WHEN for [design-a.md](design-a.md). Five parts: a schema slice that lands
the `evidence.provenance` column + proto field + validation guard; a
round-robin producer migration that swaps `rationale: synthetic` for
`provenance: synthetic_placeholder` with narrowed delete + ON CONFLICT guard;
a new artifact-driven producer with the bounded heuristic + per-`(repo,
skill)` floor + orchestrator wiring; the landmark surface changes that put
coverage adjacent to readiness and gate three commands on
`COVERAGE_CONFIDENCE_FLOOR`; and the Guide skill edit that lands
`provenance: 'agent_attested'` on `WriteEvidence`. Parts 01 + 02 release
together; Parts 03, 04, 05 each depend on 01 + 02; Part 04 also depends on
03; Part 05 is independent of 03 + 04.

Libraries used: libcli (existing `documentation` slot), libmock (existing
`createMockSupabaseClient`, `createMockQueries`), libskill (existing
`deriveSkillMatrix`), libpreflight (no change).

## Parts

| # | Slice | Depends on | Parallel after | Agent |
| --- | --- | --- | --- | --- |
| 01 | Schema: proto field + DB migration + validation module + `WriteEvidence` handler + handler tests | — | — | engineering agent |
| 02 | Round-robin producer migration (`evidence.js` + test fixtures) | 01 | — | engineering agent |
| 03 | Artifact-driven producer + orchestrator wiring + criterion 1 + criterion 6 e2e verification | 01, 02 | — | engineering agent |
| 04 | Landmark surfaces: confidence-floor module + readiness/timeline/coverage commands + formatters + `fit-landmark` `--help` interpolation + tests | 01, 02, 03 | — | engineering agent |
| 05 | Guide skill update (`evaluate-evidence` step (e)) + provenance verification | 01 | — | engineering agent |

Parts 01 and 02 **must ship in the same release**: landing Part 01
alone leaves every existing round-robin row tagged `human_attested`
(the DB column default) until Part 02 re-tags it on the next transform
run, which silently inflates the human-attested class in criterion 5's
breakdown. Plan-a-01 § Step 1.3 documents the residue path.

Parts 02 and 03 must land in order because 03's determinism contract
(per-class DELETE, ordered insert, ON CONFLICT) relies on 02 having
narrowed the round-robin's delete scope and added the guard. Part 04
must land after 02 + 03 because its coverage per-provenance breakdown
reads `synthetic_placeholder` and `artifact_interpreted` rows that
only those parts produce — landing 04 against an unmigrated DB would
render an "all human_attested" view that misleads consumers. Part 05
is independent of 02–04 because the Guide skill produces
`agent_attested` rows whose handler-side validation is Part 01-only.

## Cross-cutting

- **Migration filename.** New migrations follow the existing
  `YYYYMMDDHHMMSS_<slug>.sql` convention seen on
  `20260514000000_organization_people_kind.sql`. This plan dates the new file
  `20260603000000_evidence_provenance.sql` — the implementer adjusts the date
  prefix to their merge day if needed, preserving sort order against
  `20260514000000_*`.
- **Codegen.** Part 01 edits `services/map/proto/map.proto`; `just codegen`
  regenerates `generated/types/`, `generated/services/map/`, and
  `generated/definitions/map.js`. The implementer commits the regenerated
  files in the same commit as the proto edit.
- **Provenance vocabulary.** A single module
  `products/map/src/activity/provenance.js` is the source of truth for
  `PROVENANCE_CLASSES` and the validation guard. Importers: round-robin
  producer (Part 02), artifact-driven producer (Part 03), `WriteEvidence`
  handler (Part 01), landmark coverage helper (Part 04). The four-class
  set is `synthetic_placeholder`, `artifact_interpreted`,
  `agent_attested`, `human_attested` (design § Provenance).
- **Package export edit.** Part 01 Step 1.4 explicitly adds
  `"./activity/provenance": "./src/activity/provenance.js"` to
  `products/map/package.json`'s `exports` map. The
  [`check-workspace-imports`](https://github.com/forwardimpact/monorepo/blob/main/scripts/check-workspace-imports.mjs)
  guard runs on every PR through `bun run context` and will fail if
  Parts 01, 02, 03, or 04 import the path before the export exists.
- **Test runner.** All tests use `bun test`. New test files match the
  existing `*.test.js` convention under `products/map/test/activity/` and
  `products/landmark/test/`.
- **Mocking.** Producer tests hand-roll a minimal supabase fake (the existing
  `transform-evidence.test.js` already does this because
  `createMockSupabaseClient` doesn't cover `.delete().eq().eq()` /
  `.upsert({ onConflict })`). Command tests reuse `createMockQueries` from
  libmock.
- **CLI/Skill parity.** Part 04 does not add a new `documentation` entry; it
  interpolates the floor value into the description of the existing "Find
  Growth Areas and Build Evidence" entry. `--help` thus carries the floor
  value without changing the skill's `## Documentation` block (no parity
  edit required in `.claude/skills/fit-landmark/SKILL.md`).
- **Idempotency in tests.** The criterion 6 determinism test (Part 03) runs
  the full transform pass twice against the same fixture and asserts the
  projection `(artifact_id, skill_id, level_id, marker_text, matched,
  provenance)` is equal between runs.

## Risks

- **Codegen drift on proto edit.** `services/map/proto/map.proto`'s
  `WriteEvidenceRequest` change adds an optional field at tag 7; the field
  number is uncontested. Implementer must commit `just codegen` output in
  the same commit; CI's `Context/metadata` job fails otherwise. Plan Part 01
  Step 1.2 names the regeneration step explicitly.
- **`ON CONFLICT DO NOTHING` on supabase-js.** The supabase JS client
  expresses this as `.upsert(rows, { onConflict, ignoreDuplicates: true })`,
  which the existing `WriteEvidence` handler already uses. The round-robin
  producer migration in Part 02 swaps `.insert(rows)` for the same
  `.upsert(..., { onConflict, ignoreDuplicates: true })` shape; the
  determinism contract holds because the artifact-driven producer (Part 03)
  has already written its rows by then. The hand-rolled mock in
  `transform-evidence.test.js` must learn to recognise `.upsert()`.
- **The per-(repo, skill) floor amplifies on data the test fixtures don't
  control.** The floor fires unconditionally even when no marker scored
  against the artifact. The Part 03 e2e harness against the BioNova
  fixture is the only path that asserts criterion 1(c) end-to-end; unit
  tests assert the floor rule in isolation against synthetic inputs.
- **Guide skill's `step (e)` is markdown read by an LLM at runtime, not a
  unit-testable function.** Part 05 verifies criterion 7 by (a) inspecting
  the edited line in the skill body and (b) running the skill against a
  seeded persona with at least one scoreable artifact and reading the
  `provenance` column back. Step (b) requires Guide's full stack running
  locally; the implementer falls back to (a) when (b) is not available, and
  the verification text records which path was taken.
- **`fit-landmark sources` is unchanged by this plan.** Spec § Out of
  scope makes that explicit; if the implementer notices a `sources`-shaped
  drift in the design's surface table, the answer is "out of scope, raise
  a follow-on issue."

## Execution

Sequential after Part 01 unless explicitly noted. Suggested order: 01 →
02 → 03 → 04 → 05. Parts 04 and 05 can also fan out after 01: 02 → 03
→ implement, while 04 and 05 each open their own branch from `main`
post-01. The implementer picks based on coordination bandwidth; the
default execution path is single-agent sequential.

— Staff Engineer 🛠️
