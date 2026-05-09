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
  declares no RLS policies on any table. `activity.evidence`,
  `activity.organization_people`, `activity.getdx_snapshots`,
  `activity.getdx_snapshot_comments`, `activity.getdx_snapshot_team_scores`,
  `activity.getdx_teams`, `activity.github_artifacts`, and
  `activity.github_events` are all readable in full by any holder of an
  `authenticated` JWT or the service role.
- **Service-role bypass on read paths.**
  `products/landmark/src/lib/supabase.js:27-39` (`createLandmarkClient`)
  reads from `MAP_SUPABASE_SERVICE_ROLE_KEY` directly. Every Landmark command
  — `voice`, `evidence`, `health`, `readiness`, `coverage`, `practice`,
  `practiced`, `snapshot`, `timeline`, `org`, `marker` — issues queries via
  this single client, which bypasses RLS by design.
- **Scope is a query-parameter convention, not a contract.**
  `services/map/proto/map.proto` expresses the engineer/manager/org-wide
  distinction as three optional fields on the request (`email`,
  `manager_email`, `org`). The caller's identity is not bound to which fields
  they may set; nothing structurally prevents an Engineer-scoped caller from
  passing `org=true`.

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

The secondary job served is **Empowered Engineers → Find Growth Areas**
([JTBD.md § Empowered Engineers: Find Growth Areas](../../JTBD.md#empowered-engineers-find-growth-areas)).
An engineer can only act on evidence-grounded growth conversations if they can
see what evidence is retained about them and for how long. Today they cannot.

## Goal

The Map activity schema and the Landmark CLI together honor a typed scope
contract, enforced at the database via RLS and at the call site via a
middleware that resolves an authenticated caller identity before any read.
Engineers can list the rows retained about them with `fit-landmark sources
--email <self>` and see the retention window for each row class. The
service-role key remains the write-path credential (used by Map's ingestion
pipelines) but is no longer reachable from any read path.

## Scope (in)

| Area | Surface | What changes |
| --- | --- | --- |
| RLS migration | `products/map/supabase/migrations/<new>.sql` | New migration enables RLS on every `activity.*` table touched today (`organization_people`, `getdx_snapshots`, `getdx_teams`, `getdx_snapshot_team_scores`, `getdx_snapshot_comments`, `getdx_initiatives`, `github_events`, `github_artifacts`, `evidence`) and adds SELECT policies expressed against a `viewer_email` argument plus a scope discriminant. The `service_role` retains write access; `authenticated` and `anon` lose blanket SELECT. |
| Scope contract | Map proto + Landmark middleware | The `Engineer | Manager | Director` distinction becomes a typed value carried through every Landmark read path, derived from the authenticated caller's identity, not from arbitrary request fields. Map RPCs that issue reads accept a typed scope and refuse to fall through to a service-role client. |
| Read-path client | `products/landmark/src/lib/supabase.js` | The factory exposes a scoped read client whose connection identity is the resolved caller. The service-role key remains available only to the write path (Map ingestion). Every Landmark command's read calls go through the scoped client. |
| Source inventory CLI | `products/landmark/src/commands/sources.js` (new) + `bin/fit-landmark.js` | New `fit-landmark sources --email <e>` command lists every row retained about engineer `<e>`, grouped by row class (`evidence`, `github_artifacts`, `getdx_snapshot_comments`, `getdx_snapshot_team_scores`, `organization_people`), showing per-class row count, oldest row timestamp, newest row timestamp, declared retention window, and projected fall-off date. |
| Retention metadata | `products/map/supabase/migrations/<new>.sql` | Each `activity.*` row class carries a declared retention window in schema metadata (a per-table `COMMENT` or a dedicated `activity.retention_policies` table — the mechanism is a design choice). The metadata is queryable so the source-inventory command can render it. |
| Empty/error contract | `products/landmark/src/lib/empty-state.js` | RLS-induced empty results render the existing "no rows in scope" empty state — not "table not found." Auth-resolution failures (no caller identity) error explicitly with a hint to authenticate, not silently. |
| Tests | `products/map/test/`, `products/landmark/test/` | Cover policy enforcement (Engineer scope sees only own rows; Manager scope sees own + direct reports; Director scope sees subtree); cover the source-inventory command output shape; cover error behavior when no caller identity resolves. |

## Scope (out)

- **Slices 2–4 of #829.** `claude_code_sessions` ingestion, `evaluate-evidence`
  trace integration, and Copilot ingestion are deferred under the umbrella
  issue and are not covered here.
- **Authentication mechanism.** *How* a caller's identity is resolved (OAuth
  flow with Supabase, signed JWT from a separate identity service, local-dev
  static identity, etc.) is a design decision. The spec requires only that the
  identity exists and is non-bypassable; the mechanism belongs in the design.
- **Retention enforcement.** Declaring the retention window per row class is in
  scope. The cron, daemon, or scheduled job that physically deletes
  past-retention rows is a separate concern and out of scope for this slice;
  the schema declaration is the substrate it will read from.
- **Map ingestion-pipeline rewrites.** The write path keeps the service-role
  key. Ingestion code in `products/map/src/activity/` is not modified beyond
  whatever is required for migrations to apply cleanly.
- **Web UI surfaces.** Landmark's planned web UI (per `products/CLAUDE.md`
  § Invocation context) is not in scope. The scope-contract types it will
  consume are introduced here, but the web binding belongs in a later spec
  alongside the `InvocationContext` work.
- **Synthetic-data pipeline.** `libsyntheticrender` and the Map terrain
  fixtures continue to populate the activity schema via the write path; the
  scope contract does not affect them.
- **Cross-product scope.** Pathway, Summit, Outpost, and Guide do not consume
  the activity schema directly today; their reads (where any) go through Map's
  service surface and inherit Map's enforcement. They are not modified.
- **Backfilling retention.** Rows already in the schema do not get a synthetic
  retention timestamp. The retention clock starts at the row's existing
  `imported_at` / `created_at` / `occurred_at` field — declaring *which* field
  per row class is part of the schema metadata.

## Constraints (downstream-binding)

These are non-negotiable invariants that this spec establishes for every
downstream slice of #829. They are not acceptance criteria for this spec
(this spec ingests no agent-analytics data) but are documented here so the
downstream specs inherit them as binding constraints rather than reopening
them.

| # | Constraint | Why |
| --- | --- | --- |
| C1 | Producer-side metrics (token usage, session count, lines of code, acceptance rate, agent-mode-used-today, daily active users, agent-contribution percentage) never reach an individual-attributed view. Their only legitimate homes are team-level capacity planning and as outcome-ratio denominators at team aggregate. | These metrics invert under measurement-as-target (issue #829 §"Goodhart risk"). At the per-engineer level they reward conformance, not engineering. |
| C2 | Trace bodies (raw prompts, tool inputs, file paths, full Bash, full API request/response) are engineer-only. Manager- and Director-scoped views consume trace-derived evidence rows that route through `WriteEvidence`'s marker-grounding validation, never raw bodies. | Trace bodies are more intimate than a keystroke log. Marker-grounded evidence rows are the sanctioned artifact for cross-scope visibility. |
| C3 | Landmark must never request the four Claude Code content gates (`OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_TOOL_DETAILS`, `OTEL_LOG_TOOL_CONTENT`, `OTEL_LOG_RAW_API_BODIES`). Metric and event streams without those gates are sufficient for marker-grounded evidence. | The combined effect of the four gates is a full conversational record per session. The product never needs that. |
| C4 | Any data sourced from Copilot user-level endpoints, when surfaced above engineer scope, requires a minimum cohort threshold (n ≥ 5 with at least three contributors) before any number is displayed. The vendor will not enforce this for us. | The Copilot user-level API has no documented k-anonymity. The threshold is the product's own. |

## Success criteria

| # | Claim | Verification |
| --- | --- | --- |
| 1 | Every `activity.*` table touched by Landmark today has RLS enabled. | Static check on the migration: `pg_class.relrowsecurity = true` for `activity.organization_people`, `activity.getdx_snapshots`, `activity.getdx_teams`, `activity.getdx_snapshot_team_scores`, `activity.getdx_snapshot_comments`, `activity.getdx_initiatives`, `activity.github_events`, `activity.github_artifacts`, `activity.evidence`. |
| 2 | Each `activity.*` SELECT policy is expressed in terms of a `viewer_email` argument and a typed scope discriminant; no policy uses `USING (true)` or equivalent unconditional access for `authenticated` or `anon`. | Static inspection of the migration: every `CREATE POLICY ... FOR SELECT` references the scope-resolution function or a column-level predicate keyed on the caller's identity; no policy returns true unconditionally. |
| 3 | The Landmark read path cannot reach the service-role key. A Landmark command invoked without a resolvable caller identity fails with a typed authentication error before any query is issued. | Behavioral test: run `fit-landmark voice --email <self>` in a test harness with no caller identity bound; assert the command exits non-zero with an "authenticate first" hint and does not issue a Supabase query. Static inspection: `products/landmark/src/lib/supabase.js`'s read-client factory accepts no `serviceRoleKey` parameter. |
| 4 | Scope is a typed value (`Engineer | Manager | Director`) carried by every Landmark read call, derived from the authenticated caller's identity. The set of rows visible to each scope is documented and verifiable. | Test fixtures: three callers (engineer A; manager M with direct reports A and B; director D over M's subtree) issue the same query; assert A sees only A's rows, M sees A + B + M, D sees the full subtree. The mapping from scope to allowed rows is stated in the design and reflected in policy clauses. |
| 5 | `fit-landmark sources --email <e>` lists every row class retained about `<e>`. Each row class entry carries: row count, oldest row timestamp, newest row timestamp, declared retention window, and projected fall-off date for the oldest row. | Integration test: seed fixtures with rows in `evidence`, `github_artifacts`, `getdx_snapshot_comments`, `getdx_snapshot_team_scores`, `organization_people` for `<e>`; invoke `fit-landmark sources --email <e>`; assert each class appears with the five fields populated; assert classes with zero rows for `<e>` are omitted (or shown as empty, per the design). |
| 6 | Each `activity.*` row class declares its retention window in schema metadata, queryable by the source-inventory command. | Static inspection: the new migration places retention metadata (per-table `COMMENT` or `activity.retention_policies` row) for every row class enumerated in criterion 1. Integration test: `fit-landmark sources` reads the metadata it renders from the same place the migration writes it (no second source of truth). |
| 7 | A Manager-scope caller running `fit-landmark sources --email <not-self-not-report>` returns zero rows; the command renders the existing "no rows in scope" empty state, not a "table not found" error. | Behavioral test: as Manager M with reports A, B, invoke `fit-landmark sources --email C` (where C is outside M's subtree); assert exit 0 and the empty-state message; assert `EMPTY_STATES` is the surface. |
| 8 | The service-role key remains the write-path credential. Map's ingestion pipelines (the `fit-map activity` write path) continue to write to `activity.*` tables unchanged. | Behavioral test: run an existing ingestion fixture (e.g. `fit-map activity import`) against the migrated schema; assert all rows land. Static inspection: ingestion code paths still construct a service-role client; only Landmark's read path is rewired. |
| 9 | Existing Landmark CLI behaviour is preserved for self-scoped reads: an Engineer-scope caller running any existing command (`voice`, `evidence`, `health`, etc.) against their own email sees the same rows they saw before the change. | Snapshot test: run each existing command pre-change with `--email <self>` against a fixture; capture output; rerun post-change with the migrated schema, the same fixture, and an Engineer-scope identity bound to `<self>`; assert byte-equal output for each command. |

## Notes — evidence pointers (for design)

- Activity schema and grants:
  `products/map/supabase/migrations/20250101000000_activity_schema.sql`
  (lines 10–14 schema-level grants; lines 23–32 organization_people; 40–50
  getdx_snapshots; 58–70 getdx_teams; 79–97 getdx_snapshot_team_scores;
  105–114 github_events; 123–134 github_artifacts; 143–152 evidence; 154–156
  blanket grants to `anon, authenticated, service_role`).
- Service-role read path: `products/landmark/src/lib/supabase.js:27-39`
  (`createLandmarkClient` reads `MAP_SUPABASE_SERVICE_ROLE_KEY` directly).
- Scope as query-parameter convention:
  `services/map/proto/map.proto` (`email`, `manager_email`, `org` fields on
  list-style RPCs).
- Existing engineer-only command shape:
  `products/landmark/src/commands/voice.js:33-60` (`runVoiceCommand`
  dispatches on `--email` vs `--manager`; `--email` mode is the engineer-scope
  precedent the source-inventory command will follow).
- Existing empty-state contract:
  `products/landmark/src/lib/empty-state.js` (`EMPTY_STATES` already carries
  "no evidence in scope" copy that RLS-induced empty results can reuse).
- Source issue: [#829](https://github.com/forwardimpact/monorepo/issues/829),
  §"Privacy architecture this requires" and §"Recommended posture".
- Sequencing: This is Slice 1 of #829. Slice 2 (`claude_code_sessions` +
  `claude_code_artifact_links`), Slice 3 (`evaluate-evidence` reads traces),
  and Slice 4 (Copilot at organization aggregate) are downstream specs and do
  not begin until this slice is stable on `main`.
