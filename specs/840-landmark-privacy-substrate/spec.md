# Spec 840 — Landmark privacy substrate (#829 slice 1)

## Problem

Landmark's stated promise to engineers is *"demonstrate engineering progress
without making individuals feel surveilled"*
([JTBD.md § Engineering Leaders: Measure Engineering Outcomes](../../JTBD.md#engineering-leaders-measure-engineering-outcomes)).
Today the data substrate cannot honor that promise. Three concrete gaps are
visible at HEAD `9891ab23`:

- **No row-level security.**
  `products/map/supabase/migrations/20250101000000_activity_schema.sql:10-14`
  grants `ALL` on `activity.*` to `anon, authenticated, service_role` and
  declares no RLS policies on any table. The six tables Landmark reads today —
  `activity.organization_people`, `activity.evidence`,
  `activity.github_artifacts`, `activity.getdx_snapshots`,
  `activity.getdx_snapshot_team_scores`, and
  `activity.getdx_snapshot_comments` (verified by the `from(...)` calls in
  `products/map/src/activity/queries/{org,artifacts,evidence,snapshots,comments}.js`)
  — are all readable in full by any holder of an `authenticated` JWT or the
  service role.
- **Service-role bypass on read paths.**
  `products/landmark/src/lib/supabase.js:27-40` (`createLandmarkClient`)
  reads from `MAP_SUPABASE_SERVICE_ROLE_KEY` directly. Every Landmark command
  — `voice`, `evidence`, `health`, `readiness`, `coverage`, `practice`,
  `practiced`, `snapshot`, `timeline`, `org`, `marker` — issues queries via
  this single client, which bypasses RLS by design.
- **Scope is a query-parameter convention, not a contract.**
  Landmark commands accept `--email` (self-scope) on five surfaces (`voice`,
  `evidence`, `readiness`, `coverage`, `timeline`) and `--manager`
  (reports-scope) on `voice`, `practice`, `practiced`, `health`, and several
  `snapshot`/`org` subcommands; some commands take neither (`marker`,
  `org show`). The caller's identity is not bound to which option they may
  pass — nothing structurally prevents a caller from passing
  `--manager <anyone>` on any command that accepts it. See
  `products/landmark/bin/fit-landmark.js:62-168` for the full surface.

These gaps are already thin for the data Landmark holds today (GetDX comments
attributed to email; per-engineer evidence rows; GitHub artifact rows joined
to email via `github_username`). They become untenable when issue #829's
recommended posture lands the next data sources, which carry *prompts, Bash
commands, file paths, and full API request/response bodies* under a
per-engineer identity. Issue #829 §"Privacy architecture this requires" names
this slice as the precondition for any agent-analytics ingestion: RLS first,
typed scope contract, engineer-visible source inventory, retention clock
declared in schema.

This spec covers that precondition and only that precondition. Slices 2 (Claude
Code at aggregate), 3 (`evaluate-evidence` reads traces), and 4 (Copilot)
remain deferred under issue #829 until this slice is stable.

### JTBD

The job served is **Engineering Leaders → Measure Engineering Outcomes**
([JTBD.md § Engineering Leaders: Measure Engineering Outcomes](../../JTBD.md#engineering-leaders-measure-engineering-outcomes)).
A leader's Big Hire is *"demonstrate engineering progress without making
individuals feel surveilled."* The Anxiety force on this job is *"measurement
feels like surveillance regardless of intent"* — and a substrate where any
authenticated client reads the full activity schema turns that anxiety into a
factual claim. Closing the gap before broadening the data sources is what
distinguishes Landmark from the metrics surfaces it competes with (sprint
velocity, ticket counts, "how's the team doing?").

## Goal

The Map activity schema and the Landmark CLI together honor a typed scope
contract, enforced at the database via RLS and at the call site by deriving
scope from the authenticated caller's identity rather than from request
fields. Engineers can list the rows retained about them with `fit-landmark
sources --email <self>` and see the retention window for each row class. The
service-role key remains the write-path credential (used by Map's ingestion
pipelines) but is no longer reachable from any Landmark read path.

### Architectural precondition (named, not designed here)

The design must produce an authenticated caller identity, and a tier mapping
for that identity, at every Landmark invocation surface — local CLI use,
test harnesses, and CI fixtures. The spec does not pick the mechanism for
either; it requires that both exist, that they are non-bypassable, that the
identity is the sole source of scope, and that the tier mapping derives from
existing schema (`activity.organization_people` is the canonical source of
employment relationships today; the design names whether tier derives from
`manager_email` directly, from a recursive walk, or from a separate column
the design adds).

## Scope (in)

| Area                  | Surface                                                                      | What changes                                                                                                                                                                                                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RLS migration | `products/map/supabase/migrations/<new>.sql` | Enable RLS and add SELECT policies on every `activity.*` table Landmark reads today (six tables enumerated in Problem). Per-row-class scope rule: `evidence`, `github_artifacts`, `organization_people`, `getdx_snapshot_comments` are engineer-attributed (Engineer scope sees rows where `email` matches; Manager scope sees rows for self + direct reports). `getdx_snapshot_team_scores` is team-attributed (Engineer scope sees scores for the team `organization_people` joins them to; Manager scope sees scores for teams they manage). `getdx_snapshots` is org-wide survey-cycle metadata with no per-engineer or per-team identifier (Engineer scope sees all rows). `service_role` retains write access; `authenticated` and `anon` lose blanket SELECT. |
| Scope contract | Landmark JS read path (`products/map/src/activity/queries/*` consumers) | A typed scope value with at least Engineer and Manager members is derived from the authenticated caller's identity and carried through every Landmark read call. The `--email`/`--manager` command options stop being the source of scope. The recognized tier set, the source of caller-to-tier mapping, and the value's structural form are design choices; the spec requires only that the mapping be the sole source of scope. |
| Read-path client | `products/landmark/src/lib/supabase.js` | Landmark's read path cannot reach the service-role key. Reads execute under the resolved caller's identity. The service-role key remains available only to the write path (Map ingestion). |
| Source inventory CLI | New `fit-landmark sources --email <e>` verb (CLI definition, skill `## Documentation` list, and a `websites/fit/docs/products/<slug>/index.md` page must update together per `products/CLAUDE.md` § "CLIs and progressive documentation"). | Lists every row class retained about engineer `<e>`, grouped per row class, including the columns named in success criterion 5. Wiring (file layout, dispatcher registration, doc-slug name) is a design choice. |
| Retention metadata | `products/map/supabase/migrations/<new>.sql` | Each row class in the migration carries a declared retention window in schema metadata. Mechanism (per-table `COMMENT`, an `activity.retention_policies` table, etc.) is a design choice. The metadata is the single source of truth that the source-inventory command renders from. |
| Empty/error contract | `products/landmark/src/lib/empty-state.js` | RLS-induced empty results render an empty-state message (existing or new key — design choice), not a "table not found" error. Auth-resolution failures (no caller identity) error explicitly, identifying authentication as the missing step; specific copy is a design choice. |
| Tests | `products/map/test/`, `products/landmark/test/` | Cover policy enforcement (per-row-class scope rules above); cover the source-inventory command output shape; cover error behavior when no caller identity resolves. |

## Scope (out)

- **Slices 2–4 of #829.** `claude_code_sessions` ingestion, `evaluate-evidence`
  trace integration, and Copilot ingestion are deferred under the umbrella
  issue and are not covered here.
- **Authentication mechanism.** *How* a caller's identity is resolved is a
  design decision (see Architectural precondition above).
- **Higher-than-Manager scope tiers.** No resolved director-tier source
  exists in `activity.organization_people` today. This spec requires only
  Engineer and Manager. Adding higher tiers is a follow-up.
- **Retention enforcement.** Declaring the retention window per row class is
  in scope. The cron, daemon, or scheduled job that physically deletes
  past-retention rows is a separate concern and out of scope for this slice;
  the schema declaration is the substrate it will read from. How the
  source-inventory command communicates that fall-off dates are projections
  rather than guarantees of deletion is a copy choice for the design.
- **Map ingestion-pipeline rewrites.** The write path keeps the service-role
  key. Ingestion code in `products/map/src/activity/` is not modified beyond
  whatever is required for migrations to apply cleanly.
- **`activity.*` tables Landmark does not read today.** `getdx_initiatives`,
  `getdx_teams`, `github_events` are written by Map's ingestion but not
  consumed by Landmark; they are not migrated by this spec. When a future
  slice adds a Landmark read against any of them, that slice extends the
  migration set.
- **`services/map` gRPC proto.** Landmark does not consume the proto; its
  reads go through JS query modules. The proto's scope conventions are a
  separate question for Map's gRPC consumers (Guide via
  `evaluate-evidence`) and are out of scope for this slice. Slice 3 of #829
  may revisit them.
- **Web UI surfaces.** Landmark's planned web UI (per `products/CLAUDE.md`
  § Invocation context) is not in scope. The scope-contract types it will
  consume are introduced here, but the web binding belongs in a later spec.
- **Synthetic-data pipeline.** `libsyntheticrender` and the Map terrain
  fixtures continue to populate the activity schema via the write path; the
  scope contract does not affect them.
- **Cross-product scope.** Pathway, Summit, Outpost, and Guide do not consume
  the activity schema directly today; they are not modified.
- **Backfilling retention.** Rows already in the schema do not get a synthetic
  retention timestamp. The retention clock starts at the row's existing
  `imported_at` / `created_at` / `occurred_at` field — declaring *which* field
  per row class is part of the schema metadata.

## Constraints (downstream-binding)

Issue #829 enumerates four downstream-binding constraints — Goodhart-prone
producer-side metrics never reach an individual-attributed view; trace bodies
are engineer-only; Claude Code content gates default-off; Copilot user-level
data above engineer scope requires a k-anonymity threshold. Slices 2–4
inherit them directly from the issue. They are not acceptance criteria for
this spec (this spec ingests no agent-analytics data) and are not restated
here so the issue remains the canonical source. Each downstream slice's
spec.md cites the issue and the specific constraint(s) its design must
satisfy.

## Success criteria

| #  | Claim                                                                                                                                                                                                  | Verification                                                                                                                                                                                                                                                                                                                                                  |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | Every `activity.*` table Landmark reads today has RLS enabled.                                                                                                                                          | Static check on the migration: `pg_class.relrowsecurity = true` for `activity.organization_people`, `activity.evidence`, `activity.github_artifacts`, `activity.getdx_snapshots`, `activity.getdx_snapshot_team_scores`, `activity.getdx_snapshot_comments`.                                                                                              |
| 2 | An `authenticated` connection bound to engineer A's identity returns only the rows the per-row-class scope rule (Scope-in row 1) admits for A, across all six tables. An `anon` connection returns zero rows from any of the six tables. | Behavioural test for `authenticated`: bind connection identity to A; SELECT from each of the six tables; assert returned rows match the scope rule (engineer-attributed: rows where `email = A`; team-attributed: rows for A's team in `organization_people`; org-wide: all rows). Behavioural test for `anon`: SELECT from each table; assert zero rows. Static inspection: no `CREATE POLICY` admits `anon` for any of the six tables. |
| 3a | No file under `products/landmark/src/` references `MAP_SUPABASE_SERVICE_ROLE_KEY` after the change. | Static inspection: `grep -r MAP_SUPABASE_SERVICE_ROLE_KEY products/landmark/src/` returns zero occurrences (the env var stays in `process.env` for ingestion code in `products/map/src/`, not Landmark). |
| 3b | A Landmark command invoked without a resolvable caller identity fails before any query is issued. | Behavioural test: invoke any Landmark command with no caller identity bound in the harness; assert non-zero exit, an error that identifies authentication as the missing step, and no Supabase query issued (asserted via a query-counting test stub or equivalent). |
| 4 | Scope is bound to the authenticated caller's identity, not to the `--email`/`--manager` command options. Engineer scope sees rows admitted by the per-row-class scope rule for self only; Manager scope sees rows for self plus direct reports; an engineer outside the caller's subtree contributes zero rows. | Test fixtures: three callers (engineer A; manager M with direct reports A and B; engineer C with manager M' ≠ M) issue the same read against each table. Assert A returns only A's admitted rows; M returns A, B, and M's admitted rows; M does not return any of C's rows. Caller-to-tier mapping source is named in the design. |
| 5 | `fit-landmark sources --email <e>` lists every row class retained about `<e>` that the caller is in scope for, with row count, oldest row timestamp, newest row timestamp, declared retention window, and projected fall-off date for the oldest row. Row classes with zero rows for `<e>` are omitted. | Integration test: seed fixtures with rows in `evidence`, `github_artifacts`, `getdx_snapshot_comments`, `getdx_snapshot_team_scores`, `organization_people`, and `getdx_snapshots` for the snapshot cycles `<e>`'s rows fall under; invoke `fit-landmark sources --email <e>` as `<e>`; assert each populated class appears with the five fields populated; assert classes seeded with zero rows for `<e>` are absent from the output. |
| 6 | Changing the retention window in the migration metadata changes the value the source-inventory command renders. | Behavioural test: change the retention window for a row class in a test migration; rerun `fit-landmark sources --email <e>`; assert the displayed window for that class matches the new metadata value. |
| 7 | A Manager-scope caller running `fit-landmark sources --email <not-self-not-report>` returns zero rows; the command renders an empty-state message keyed off the empty-state registry (`EMPTY_STATES` in `products/landmark/src/lib/empty-state.js`), not a "table not found" error. | Behavioural test: as Manager M with reports A, B, invoke `fit-landmark sources --email C` (C outside M's subtree); assert exit 0; assert the rendered string is the empty-state registry value (existing or new key — design choice). |
| 8 | The service-role key remains the write-path credential. Map's ingestion pipelines continue to write to `activity.*` tables unchanged. | Behavioural test: run `bunx fit-map activity verify` (per `products/map/bin/fit-map.js`'s registered subcommands) against a seeded fixture on the migrated schema; assert verification passes. Static inspection: Map's ingestion code paths still construct a service-role client. |
| 9 | For every Landmark command that accepts `--email` (`voice`, `evidence`, `readiness`, `coverage`, `timeline` — verified at `products/landmark/bin/fit-landmark.js:62-168`), an Engineer-scope caller bound to `<self>` invoking the command with `--email <self>` returns the same row set the pre-change command returned for the same input. | Test: capture pre-change row sets for each of the five commands invoked with `--email <self>` against a fixture; rerun post-change under an Engineer-scope caller bound to `<self>`; assert row-set equality (rows present, field values equal). Tolerated drift: row ordering when not user-meaningful, header timestamps, error wording. Substantive drift (missing/added rows, mutated field values) fails the test. Commands that do not accept `--email` are exercised by criterion 4's scope test. |

## Notes — evidence pointers (for design)

- Activity schema and grants:
  `products/map/supabase/migrations/20250101000000_activity_schema.sql`
  (lines 10–14 schema-level grants; 23–32 organization_people; 40–50
  getdx_snapshots; 79–97 getdx_snapshot_team_scores; 123–134 github_artifacts;
  143–152 evidence; 154–156 blanket grants to `anon, authenticated,
  service_role`). `getdx_snapshot_comments` is added by
  `products/map/supabase/migrations/20250101000003_getdx_snapshot_comments.sql`.
  The migration scope in this spec covers all six tables.
- Service-role read path: `products/landmark/src/lib/supabase.js:27-40`
  (`createLandmarkClient` reads `MAP_SUPABASE_SERVICE_ROLE_KEY` directly;
  consumed by every command in `products/landmark/src/commands/`).
- JS query layer Landmark reads through:
  `products/map/src/activity/queries/{org,artifacts,evidence,snapshots,comments}.js`
  — the `from(...)` calls in these files enumerate the six tables the
  migration must cover. `org.js` reads `organization_people` indirectly via
  the `activity.get_team` SQL function
  (`products/map/supabase/migrations/20250101000001_get_team_function.sql`,
  `LANGUAGE sql STABLE`); RLS interaction with the function's `SECURITY
  INVOKER`/`DEFINER` mode and `search_path` is a design consideration.
- Scope as command-option convention:
  `products/landmark/bin/fit-landmark.js:62-168` is the canonical surface
  registry. `products/landmark/src/commands/voice.js:34-67`
  (`runVoiceCommand`) is one example dispatch site that trusts `--email`
  vs `--manager` without deriving scope from caller identity.
- Existing empty-state registry: `products/landmark/src/lib/empty-state.js`
  (`EMPTY_STATES` already carries entries the design can reuse or extend; the
  spec does not pre-decide which key the source-inventory command uses).
- Source issue: [#829](https://github.com/forwardimpact/monorepo/issues/829),
  §"Privacy architecture this requires" and §"Recommended posture".
- Sequencing: This is Slice 1 of #829. Slice 2 (`claude_code_sessions` +
  `claude_code_artifact_links`), Slice 3 (`evaluate-evidence` reads traces),
  and Slice 4 (Copilot at organization aggregate) are downstream specs and do
  not begin until this slice is stable on `main`.
