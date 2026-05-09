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
  Each Landmark command takes `--email` for self-scope and `--manager` for
  reports-scope (e.g.
  `products/landmark/src/commands/voice.js:34-67`). The caller's identity is
  not bound to which option they may pass; nothing structurally prevents a
  caller from passing `--manager <anyone>`.

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

The design must produce an authenticated caller identity at every Landmark
invocation site, including local development. This spec does not pick the
mechanism (Supabase OAuth, signed JWT, local-dev static identity, etc.); it
requires that one exists, that it is non-bypassable, and that it is the sole
source of scope. The mechanism is a design decision; the existence of the
mechanism is a spec requirement.

## Scope (in)

| Area                  | Surface                                                                      | What changes                                                                                                                                                                                                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RLS migration         | `products/map/supabase/migrations/<new>.sql`                                 | New migration enables RLS and adds SELECT policies keyed on the resolved caller identity for every `activity.*` table Landmark reads today: `organization_people`, `evidence`, `github_artifacts`, `getdx_snapshots`, `getdx_snapshot_team_scores`, `getdx_snapshot_comments`. The `service_role` retains write access; `authenticated` and `anon` lose blanket SELECT. |
| Scope contract        | Landmark JS read path (`products/map/src/activity/queries/*` consumers)      | The `Engineer | Manager | <higher-tier>` distinction becomes a typed value carried through every Landmark read call, derived from the authenticated caller's identity, not from `--email`/`--manager` options. The set of recognized tiers and the source of the caller-to-tier mapping is a design choice; the spec requires only that the mapping be the sole source of scope. |
| Read-path client      | `products/landmark/src/lib/supabase.js`                                      | Landmark's read path cannot reach the service-role key. Reads execute under the resolved caller's identity. The service-role key remains available only to the write path (Map ingestion).                                                                                                                                       |
| Source inventory CLI  | New `fit-landmark sources --email <e>` command                               | Lists every row retained about engineer `<e>`, grouped by row class, including row count, oldest row timestamp, newest row timestamp, declared retention window, and projected fall-off date. The wiring (file layout, dispatcher registration) is a design choice.                                                              |
| Retention metadata    | `products/map/supabase/migrations/<new>.sql`                                 | Each row class in the migration carries a declared retention window in schema metadata. The mechanism (per-table `COMMENT`, an `activity.retention_policies` table, etc.) is a design choice. The metadata is the single source of truth that the source-inventory command renders from.                                          |
| Empty/error contract  | `products/landmark/src/lib/empty-state.js`                                   | RLS-induced empty results render an empty-state message (existing or new key — design choice), not a "table not found" error. Auth-resolution failures (no caller identity) error explicitly with a hint to authenticate, not silently.                                                                                          |
| Tests                 | `products/map/test/`, `products/landmark/test/`                              | Cover policy enforcement (Engineer scope sees only own rows; Manager scope sees own + direct reports); cover the source-inventory command output shape; cover error behavior when no caller identity resolves.                                                                                                                    |

## Scope (out)

- **Slices 2–4 of #829.** `claude_code_sessions` ingestion, `evaluate-evidence`
  trace integration, and Copilot ingestion are deferred under the umbrella
  issue and are not covered here.
- **Authentication mechanism.** *How* a caller's identity is resolved is a
  design decision (see Architectural precondition above).
- **Higher-than-Manager scope tiers.** A Director-style tier (e.g.
  manager-of-managers walk) is recognized as a likely future need but its
  schema source — `manager_email` transitive closure, an HRIS join, GitHub
  team membership, etc. — is unspecified in `activity.organization_people`
  today. This spec requires only Engineer and Manager. Adding higher tiers is
  a follow-up.
- **Retention enforcement.** Declaring the retention window per row class is
  in scope. The cron, daemon, or scheduled job that physically deletes
  past-retention rows is a separate concern and out of scope for this slice;
  the schema declaration is the substrate it will read from. Engineer-facing
  copy must reflect that the fall-off date is what *will* happen when
  enforcement lands, not a guarantee of deletion today.
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
| 2  | An `authenticated` or `anon` client whose caller identity does not place them in scope for a row cannot SELECT that row.                                                                                | Behavioural test: connect as `authenticated` with caller identity bound to engineer A; SELECT from each table in criterion 1 and assert only A's rows return. Repeat with `anon` and assert zero rows return for every table.                                                                                                                              |
| 3  | The Landmark read path cannot reach the service-role key. A Landmark command invoked without a resolvable caller identity fails with a typed authentication error before any query is issued.          | Static inspection: `grep -r MAP_SUPABASE_SERVICE_ROLE_KEY products/landmark/src/` returns no occurrence in any read path (matches limited to a write-path module if present, or zero matches if no write path lives in Landmark). Behavioural test: invoke any Landmark command with no caller identity bound; assert non-zero exit and an "authenticate first" hint, with no Supabase query issued. |
| 4  | Scope is a typed value carried by every Landmark read call, derived from the authenticated caller's identity. Engineer scope sees own rows only; Manager scope sees own rows and direct reports' rows. | Test fixtures: two callers (engineer A; manager M with direct reports A and B) issue the same read; assert A sees only A's rows; M sees A, B, and M's rows. The recognized tier set and the source of caller-to-tier mapping is named in the design.                                                                                                       |
| 5  | `fit-landmark sources --email <e>` lists every row class retained about `<e>` that the caller is in scope for, with row count, oldest row timestamp, newest row timestamp, declared retention window, and projected fall-off date for the oldest row. Row classes with zero rows for `<e>` are omitted from the listing. | Integration test: seed fixtures with rows in `evidence`, `github_artifacts`, `getdx_snapshot_comments`, `getdx_snapshot_team_scores`, `organization_people` for `<e>`; invoke `fit-landmark sources --email <e>` as `<e>`; assert each populated class appears with the five fields populated; assert classes seeded with zero rows for `<e>` are absent from the output. |
| 6  | Each `activity.*` row class declares its retention window in schema metadata. The source-inventory command reads the displayed retention window from the same metadata location the migration writes it to.                                                       | Behavioural test: change the retention window in a test migration; rerun `fit-landmark sources --email <e>`; assert the displayed window changes accordingly. Static inspection: the source-inventory command's retention-window query targets the migration-written metadata location with no fallback constants.                                          |
| 7  | A Manager-scope caller running `fit-landmark sources --email <not-self-not-report>` returns zero rows; the command renders an empty-state message, not a "table not found" error.                       | Behavioural test: as Manager M with reports A, B, invoke `fit-landmark sources --email C` (where C is outside M's subtree); assert exit 0 and an empty-state message; assert the rendered string comes from the empty-state registry.                                                                                                                       |
| 8  | The service-role key remains the write-path credential. Map's ingestion pipelines continue to write to `activity.*` tables unchanged.                                                                  | Behavioural test: run an existing ingestion verification (`bunx fit-map activity verify` against a seeded fixture, per `products/map/bin/fit-map.js`'s registered subcommands) on the migrated schema; assert verification passes and all expected rows are present. Static inspection: ingestion code paths still construct a service-role client.        |
| 9  | For every Landmark command that accepts `--email` (`voice`, `evidence`, `readiness`, `practice`, `practiced`, `coverage`, `timeline`, `marker`), an Engineer-scope caller bound to `<self>` invoking the command with `--email <self>` returns the same set of rows the pre-change command returned for the same input. | Test: capture pre-change row sets for each command/`--email <self>` invocation against a fixture; rerun post-change with an Engineer-scope caller bound to `<self>`; assert row-set equality (presence and field values), tolerating ordering and incidental output drift (timestamps in headers, error wording). Commands that do not accept `--email` (`health` takes `--manager`; `org` and `snapshot` take other args) are exercised by criterion 4's scope test. |

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
  migration must cover.
- Scope as command-option convention:
  `products/landmark/src/commands/voice.js:34-67` (`runVoiceCommand`
  dispatches on `--email` vs `--manager`; the dispatcher trusts the option
  rather than deriving scope from caller identity).
- Existing empty-state registry: `products/landmark/src/lib/empty-state.js`
  (`EMPTY_STATES` already carries entries the design can reuse or extend; the
  spec does not pre-decide which key the source-inventory command uses).
- Source issue: [#829](https://github.com/forwardimpact/monorepo/issues/829),
  §"Privacy architecture this requires" and §"Recommended posture".
- Sequencing: This is Slice 1 of #829. Slice 2 (`claude_code_sessions` +
  `claude_code_artifact_links`), Slice 3 (`evaluate-evidence` reads traces),
  and Slice 4 (Copilot at organization aggregate) are downstream specs and do
  not begin until this slice is stable on `main`.
