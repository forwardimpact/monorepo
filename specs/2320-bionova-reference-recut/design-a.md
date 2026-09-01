# Design 2320-a: Re-cut the BioNova Polaris Reference

The components of this design are documents. The re-cut turns the 11-file
record in `references/bionova-apps/` into 8 files that specify capability
intent and verification. The built `forwardimpact/bionova-apps` repository
stays the executable evidence for every intent statement.

## File map

| Target file | Budget | Content from the current record |
| --- | --- | --- |
| `spec.md` | 190 | Current spec.md, minus the shipped-prerequisites narrative and the data-seeding walkthrough. Gains the capability inventory and the five visual outcomes (marked not yet met). Title drops the spec-1160 framing. |
| `design-a.md` | 190 | Current design-a.md: architecture diagram, component and handler tables, schema summary, RLS classes, key decisions. Gains the token contract. Full column DDL and migration SQL leave. The 10-line headroom under the 200-line skill cap absorbs review growth. |
| `plan-a.md` | 150 | Approach, the separate-repository boundary rule, part index (5 parts), execution order, the consolidated constraints table, risks. The prerequisites table and the r2/r3 revision history leave. |
| `plan-a-01.md` | 180 | Current part 01: skill-gate bootstrap, Polaris workspace layering, compose stack, Kong, Postgres init, `.env` contract. |
| `plan-a-02.md` | 240 | Current parts 02 + 03: hand-written migrations as intent (interest_signals, RLS policies, `match_conditions`, unique index), vendor-verbatim procedure, provenance anchors, seed render and staging intent, setup sequence, the full RLS verification. |
| `plan-a-03.md` | 180 | Current parts 04 + 05: four edge-function behavior contracts, security posture (body caps, generic errors), eight handler shapes, template layer. |
| `plan-a-04.md` | 220 | Current parts 06 + 07: CLI definition and REPL, web routes and context bootstraps, standalone build constraints, the visual token layer application. |
| `plan-a-05.md` | 180 | Current part 08: Railway watch-path model, deploy workflow intent, SC1–SC7 smoke intent, fixture procedure against the real criteria schema, docs. |

Budgets total 1,530 lines against the 1,700-line ceiling. The filenames
`plan-a-04.md` through `plan-a-08.md` of the current record retire; the table
above maps their content into the new parts.

## Deletions

| Content | Why it leaves |
| --- | --- |
| Implementation code blocks | § Code-to-intent rule governs what remains. |
| Skill-owned scaffolding restatement (skeleton hand-off inventory, repeated ownership reminders) | `monorepo-setup`, `jidoka-setup`, and `kata-setup` own it. The record keeps pointers and reference-specific extensions only. |
| Prerequisites A/B narrative and status table | Both shipped in `fit-terrain` 0.1.41. The version policy (re-cut spec § Version policy) replaces them. |
| r2/r3 revision history | The vendor-the-DSL decision is settled. The design's decision table records it. |
| Part-08 step 9 (monorepo STATUS handoff) | Spec 1160 is closed. references/CLAUDE.md § Keep a reference current owns the loop. |
| Inline `kata-interview.yml` and persona-command samples | The committed workflow in bionova-apps is the evidence. The record points to it and to the Substrate Contract guide. |
| Repeated hazard prose | Each hazard becomes one constraints-table row with one home in `plan-a.md`. |

## Code-to-intent rule

Each former code block becomes one intent statement plus one verification
command. Fenced blocks remain only for commands and data shapes, at 10 lines
or fewer. Example: the 40-line `build-seed.sh` listing becomes "The seed
script verifies `SOURCE.sha256`, renders with `--output-root` into a
disposable build directory, refuses the repo root, asserts the six prose
tables, and stages the SQL under versions that sort before the hand-written
migrations. Verify: the script stages at least 15 seed migrations and
`sha256sum -c SEED.sha256` passes."

## Capability placement

Each capability-inventory row from the spec lands in a named home with its
verification beside it.

| Capability | Home | Verification stated in the record |
| --- | --- | --- |
| Stack topology, Kong routes, JWT-key coherence | plan-a-01 | 12 services reach healthy and the `storage-init` oneshot completes; each Kong route answers. |
| Data API (PostgREST-only) | plan-a-01 | PostgREST answers through Kong on `/rest/v1`; handler clients target it exclusively. |
| Auth (GoTrue issuance, signed keys) | plan-a-02 | The anon and service-role JWTs verify against `JWT_SECRET`; a staff-role JWT passes the trials write policy. |
| RLS policy classes (all three) | plan-a-02 | pgTAP: anon read passes; anon trials write fails; staff-JWT write passes; anon `interest_signals` insert passes; anon read-back fails. |
| Vendored DSL, `--output-root`, determinism anchors | plan-a-02 | Re-render matches `SEED.sha256` byte for byte; `SOURCE.sha256` matches the monorepo at the provenance SHA. |
| pgvector + `match_conditions` | plan-a-02 | Embeddings row count matches the JSONL; a plain-language query returns condition matches. |
| Four edge functions | plan-a-03 | Per-function curl checks; a repeat `embed-seed` run adds no rows; a status UPDATE fires the pg_net trigger; `cron.job` lists the schedule. |
| Handler layer + frozen `InvocationContext` | plan-a-03 | Handler tests pass offline with an injected fetch; both surfaces return identical data. |
| Shared libraries | plan-a-03 (`libtemplate` in the handlers) and plan-a-04 (`libcli`, `librepl`, `libformat`, `libui`, `libutil` in the surfaces) | Each library's entry symbol is imported by its consuming unit. |
| Storage bucket | Provisioned by the stack (plan-a-01); exercised by the admin upload (plan-a-04) | An admin upload through Kong lands in `trial-documents`. |
| Visual token contract | plan-a-04 | The five visual outcomes from the spec, checked on the running site. |
| Scaffolding skill gates | plan-a-01 | The skills' own done-when checklists; the record adds no restated steps. |
| `kata-interview` + Substrate Contract | plan-a-05 | `fit-terrain substrate check` passes; a dispatched interview completes. |
| SC smoke | plan-a-05 | `smoke.sh` covers SC1–SC7 and asserts non-null prose text. |

## Hard-won constraints table

One table in `plan-a.md` § Risks consolidates the boot lessons that the
first-week fix commits on forwardimpact/bionova-apps proved (for example
`eb29652`, `d7d908d`, `eb1114a`). Each row is one constraint plus the symptom
when violated. Parts reference rows; they do not restate them. The categories:

| Category | Constraints it carries |
| --- | --- |
| Images and ports | pgbouncer tag suffix and `LISTEN_PORT`, TEI internal port and amd64 platform, distroless PostgREST probe. |
| Connection routing | Pooler-vs-direct split; PostgREST prepared statements and reload channel behind the pooler. |
| Probes | Probe only with tools the image ships; target `127.0.0.1`, never `localhost`. |
| Auth coherence | Anon and service-role keys re-signed whenever `JWT_SECRET` changes; Kong copies stay in sync. |
| Render safety | `--output-root` into a disposable directory (the write sink deletes output path prefixes); prose tables asserted after render (the renderer drops unknown entities silently). |
| Seed lifecycle | `db push --include-all`; PostgREST schema reload after push; stable migration versions carry mutable content, so a re-seed needs the destructive reset path. |
| Bundled runtime | `outputFileTracingRoot`; `POLARIS_ABOUT_PATH`; plain `bun install`. |
| Toolchain minimums | The spec § Version policy line, referenced here, not restated. |
| TEI operations | `--auto-truncate`; host-side model pre-fetch behind TLS-inspecting proxies. |

## Visual token contract

`design-a.md` of the re-cut record defines the contract. `plan-a-04` applies
it.

| Token group | Contract |
| --- | --- |
| Surface colors | `background`, `foreground`, `muted`, `primary`, `accent` as CSS variables with light and dark values. |
| Status mapping | `recruiting` → positive; `not_yet_recruiting` → neutral (upcoming); `active_not_recruiting` → warning (closed to enrollment); `completed` → muted. Each status renders a human label. |
| Type scale | At least three steps (heading, body, metadata) applied on every page. |
| Geometry | One spacing scale and one radius scale; no ad-hoc pixel values. |
| Contrast | WCAG AA in both themes. |
| Responsive floor | 390 px viewport: no horizontal scroll, usable navigation. |

## Key decisions

| Decision | Chosen | Rejected | Why |
| --- | --- | --- | --- |
| Plan granularity | 5 parts by capability cluster | Keep 8 parts; single plan | 8 parts repeat boilerplate per file; a single plan loses PR-sized rebuild boundaries. 5 parts keep one PR per capability cluster. |
| Code in the record | Intent plus verification (§ Code-to-intent rule) | Keep tested listings inline | Two copies drift. The repository is the single tested copy; the record's job is to make it reproducible, not to mirror it. |
| Visual layer | Token contract + outcome criteria, library open | Mandate shadcn/ui | A library mandate re-introduces the drift the repo already corrected (`5efe9de`) and adds five dependency families to an audit-gated repo. Outcomes are testable regardless of library. |
| Version pins | Load-bearing minimums; resolve and record at rebuild | Exact pins per package | Exact pins go stale between passes and generate false drift findings. Minimums encode the real constraints. |
| Constraints record | One consolidated table in `plan-a.md` § Risks | Hazard prose repeated per part; per-part table halves | Scattered restatement inflated the plan and still missed rows. One home per constraint; parts cite rows. |
| Schema placement | Hand-written schema rides with the seed pipeline (old parts 02 + 03 merge into plan-a-02) | Schema with the infrastructure part | The schema's FK targets and its RLS checks need seed data, so a schema-with-infrastructure part cannot verify standalone. The old part 02 had the same defect. |

## Maintenance loop

references/CLAUDE.md § Keep a reference current owns the maintenance pass.
The follow-on table in the spec seeds the first repository-side pass, and that
pass carries the rebuild proof: recreate the repository from the re-cut
record.
