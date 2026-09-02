# Plan 2320-a: Re-cut the BioNova Polaris Reference

Execute [spec.md](spec.md) and [design-a.md](design-a.md): rewrite
`references/bionova-apps/` from 11 files (3,930 lines) into the 8 target
files at 1,530 budgeted lines against the 1,700-line ceiling. Each step
below rewrites one target file as a clean replacement. The content sources
are the design § File map, the capability verifications in design
§ Capability placement, and the shipped `forwardimpact/bionova-apps`
repository as the single source of reality. Fenced blocks survive only as
commands and data shapes at 10 lines or fewer (design § Code-to-intent
rule). The whole change is one monorepo PR that touches only
`references/bionova-apps/`.

Libraries used: none.

## Conventions for every rewrite step

- Replace the file's full content. Do not edit the old text incrementally.
- Wrap prose at 80 columns. `rumdl fmt` reflows prose but not tables or
  fences, so verify line budgets after `bun run check:fix`.
- Cite hard-won constraints by row id (C1–C9 from the § Risks table Step 4
  writes). Parts never restate a constraint row.
- State each capability as intent plus the verification that design
  § Capability placement assigns to that file.
- Correct every drift-table claim (spec § The record drifted) in the file
  that carries it. Stale exact pins leave per spec § Version policy; the
  record keeps only the three load-bearing minimums.
- Scope every step-verify `rg` to the file the step rewrites. An unscoped
  `rg` matches this spec directory and the wider monorepo.

## Step 1 — Verify reality against the shipped repository

Confirm every reality claim the re-cut will write, before writing it.
Read-only: the bionova-apps repository is out of scope (spec § Excluded).

Files: none in the monorepo (scratch clone and notes only).

```sh
SCRATCH=$(mktemp -d)
gh repo clone forwardimpact/bionova-apps "$SCRATCH/bionova-apps"
git -C "$SCRATCH/bionova-apps" log --oneline --reverse | head -40
```

Confirm each row with a file path or commit SHA and keep the notes for
Steps 2–9 and the PR body:

| Claim to confirm | Where in bionova-apps |
| --- | --- |
| Web stack is hand-rolled Tailwind components, not shadcn/ui | `products/polaris/site/` dependencies; commit `5efe9de` |
| Next 15.5, Node 22, Deno 2.x (lockfile v5), eslint 10 | site `package.json`, root `engines`/`.tool-versions`, `services/polaris-functions/deno.lock`, root eslint dep; bionova specs 30/40/50 |
| `criteria` is one row per trial with `inclusion`/`exclusion` JSONB | seed migration for `criteria`; `eligibility-check` reader |
| `smoke.sh` asserts row counts, not prose text (SC1 gap stands) | `scripts/smoke.sh` |
| Edge-function security posture: request body caps, generic error responses | `services/polaris-functions/` source |
| `storage-init` oneshot provisions the `trial-documents` bucket | `docker-compose.yml` |
| Structural counts still hold: 12 compose services, 4 edge functions, 8 handlers, 9 CLI commands, 9 pages + 6 `/api/*` routes | `docker-compose.yml`, `services/polaris-functions/`, `products/polaris/handlers/src/`, `products/polaris/cli/src/definition.js`, `products/polaris/site/src/app/` |
| The REPL output convention the shipped REPL implements | `products/polaris/cli/src/repl.js` |
| First-week fix commits exist for the constraints table | `git log` for `eb29652`, `d7d908d`, `eb1114a` |
| The Polaris CLI pins `@forwardimpact/libutil` from npm | `products/polaris/cli/package.json` |
| A committed `kata-interview.yml` workflow exists | `.github/workflows/` |

Verify: every row resolves to a concrete path or SHA. Record any delta
against the spec's drift table for the PR body.

## Step 2 — Rewrite `spec.md` (budget 190)

State WHAT the reference proves and the criteria that gate a rebuild.

Files modified: `references/bionova-apps/spec.md`.

Sections, in order:

| Section | Content |
| --- | --- |
| Title + intro | `# BioNova Polaris Application`. What Polaris is; the two proofs (shared libraries outside the monorepo, `fit-terrain` + DSL outside the monorepo). Drops the spec-1160 framing. |
| Problem | Condensed: who hires the reference and why (Platform Builders; the pitch anchor). |
| Users + core capabilities | Current tables, condensed. Technology-stack paragraph corrected: self-hosted Supabase, Next.js App Router, hand-rolled Tailwind components. No shadcn/ui claim. |
| Capability inventory | Both tables from spec 2320 § Capability inventory, row for row (Supabase patterns; FIT capabilities incl. `libutil`). |
| Version policy | The three load-bearing minimums: `fit-terrain` >= 0.1.41, Bun >= 1.2.9, Deno 2.x. A rebuild resolves current versions and records them in `PROVENANCE.md` and the PR body. |
| Scope | Included/excluded, condensed. Keeps: synthetic data only, no DSL edits in bionova-apps, self-hosted only. |
| Success criteria | SC1–SC7 as one criterion per line. SC1 and SC4 assert non-null prose text, not row counts alone. Then the five visual outcomes V1–V5 from spec 2320 § Visual outcome, marked **not yet met by the shipped repository**. |

Removed: the Prerequisites section, the data-seeding walkthrough, and every
stale exact pin.

Verify: `wc -l` <= 190;
`rg -c 'not yet met' references/bionova-apps/spec.md` >= 1;
`rg -q libutil references/bionova-apps/spec.md` passes.

## Step 3 — Rewrite `design-a.md` (budget 190, hard cap 200)

State WHICH components exist and the contracts between them.

Files modified: `references/bionova-apps/design-a.md`.

Content kept, condensed:

| Section | Condensed to |
| --- | --- |
| Architecture | The mermaid diagram, trimmed. |
| Components | The component table. Stack claims naming shadcn/ui are corrected here and in the stack lines. |
| Shared libraries | The table gains `libutil`. The render split is corrected: the CLI renders through `libformat`; the web surface renders React. |
| Handlers | The eight-handler table. |
| Schema summary | A table of table names, key columns, and source entities. The `criteria` row states one row per trial with `inclusion`/`exclusion` JSONB carrying `custom[]`. |
| RLS | The three policy classes. |
| Edge functions | The four-function table. |
| Topology | The connection-topology paragraph. |
| Key decisions | The table keeps the settled "Seed source vendored" row. The version row points at spec § Version policy. |

Gains: § Visual token contract with the six token groups from design 2320
§ Visual token contract (surface colors, status mapping, type scale,
geometry, contrast, responsive floor).

Removed: full column DDL and migration SQL, § Prerequisite library changes,
and the inline `kata-interview.yml` plus persona-command samples.
§ Interviewing Polaris becomes a short pointer section: the committed
workflow in bionova-apps and the Substrate Contract guide are normative;
the design names only the two Polaris-specific mappings (own compose-stack
substrate command; patient interviews omit `persona-select-command`).

Verify: `wc -l` <= 200 (target 190);
`rg shadcn references/bionova-apps/design-a.md` empty; the fence scan from
Step 11 passes on this file.

## Step 4 — Rewrite `plan-a.md` (budget 150)

State the rebuild strategy, the part index, and the one home for hard-won
constraints.

Files modified: `references/bionova-apps/plan-a.md`.

Sections, in order:

| Section | Content |
| --- | --- |
| Approach | One paragraph: vendor the DSL, render locally, build by capability cluster, verify each part against a local compose boot. |
| Repository boundary | The separate-repository rule condensed to one callout plus the working-directory line. The implementer never writes bionova-apps files inside the monorepo. |
| Part index | 5 parts with scope one-liners. Dependencies are strictly sequential: 01 → 02 → 03 → 04 → 05. |
| Libraries used | One line: the six `@forwardimpact` libraries plus build-time `fit-terrain`. |
| Risks | Opens with the consolidated hard-won constraints table (design § Hard-won constraints table names § Risks as its home). Row ids C1–C9, one row per design category: C1 images and ports, C2 connection routing, C3 probes, C4 auth coherence, C5 render safety, C6 seed lifecycle, C7 bundled runtime, C8 toolchain minimums (points at spec § Version policy), C9 TEI operations. Each row: the constraints, the symptom when violated, and the evidence commit where one exists (`eb29652`, `d7d908d`, `eb1114a`). After the table, the risk rows a rebuilder cannot see in the parts: npm version drift beyond the minimums; absent Railway account access defers the deploy verification. |

Removed: the Prerequisites table, the r2/r3 revision history, and the
monorepo STATUS handoff. references/CLAUDE.md § Keep a reference current
owns the maintenance loop; the plan links it once.

Verify: `wc -l` <= 150;
`rg -c '^\| C[1-9]' references/bionova-apps/plan-a.md` prints 9;
`rg 'wiki/STATUS' references/bionova-apps/plan-a.md` empty.

## Step 5 — Rewrite `plan-a-01.md` (budget 180)

Part 01: repo bootstrap through the skill gates plus the PG On Rails stack.

Files modified: `references/bionova-apps/plan-a-01.md`.

Source: current plan-a-01.md. Content as intent:

- Skill gates: `monorepo-setup` (running `jidoka-setup`, `kata-setup`) is a
  hard gate with its own done-when checklist. The part carries only the
  bionova-specific extensions: the Polaris workspace layering intent (ESM
  workspaces, `fit-terrain` as a build-time devDependency, engine minimums
  per spec § Version policy), the bionova `.gitignore` appends (rendered
  seed, runtime data volumes, reconstitutable skill packs), and the five
  bionova-only CI concerns (`check-compose`, `check-seed`, `check-edge`,
  `check-e2e`, `deploy`) as one row each. No skeleton hand-off inventory.
- Compose stack: one table of the 12 services with role and probe class;
  cite C1, C2, C3, and C9 instead of restating image tags, connection
  routing, probe text, and TEI options.
- Kong: the five-route table (`/rest`, `/auth`, `/realtime`, `/storage`,
  `/functions`) with the key-auth note.
- Postgres init: the bracket-script intent (create the missing `postgres`
  role first; extensions, password alignment, and grants last, as
  `supabase_admin`; the init scripts defer to the image's own bootstrap
  and never re-create its roles or schemas).
- `.env` contract: the key list and the JWT-key coherence rule (anon and
  service-role keys are JWTs signed with `JWT_SECRET`, kept in sync with
  Kong); cite C4.

Verify (stated in the file, per design § Capability placement): all 12
services reach healthy and the `storage-init` oneshot completes; each Kong
route answers; PostgREST answers through Kong on `/rest/v1` and handler
clients target it exclusively.

Step verify: `wc -l` <= 180;
`rg -q storage-init references/bionova-apps/plan-a-01.md` passes.

## Step 6 — Rewrite `plan-a-02.md` (budget 240)

Part 02: hand-written schema, vendored DSL, and the deterministic seed
pipeline.

Files modified: `references/bionova-apps/plan-a-02.md`.

Source: current plan-a-02.md and plan-a-03.md, plus the `match_conditions`
migration intent from current plan-a-05.md step 2. Content as intent:

- Hand-written migrations, one intent row each: `interest_signals` (text FK
  to `trials`, score check, RLS enabled), the RLS policy migration (staff
  writes on `trials`/`criteria`, anon insert + staff read on
  `interest_signals`, the self-contained `auth.jwt()` helper, the anon
  INSERT grant, and the service-role GRANT on every product table that the
  edge-function PostgREST writes depend on), the `condition_embeddings`
  unique index (distinct 14-digit version), and the `match_conditions` RPC
  (`vector(384)`, threshold and count parameters). Terrain owns every
  `public_read` policy; the hand-written file adds none.
- Vendor-verbatim procedure: copy `story.dsl` + `prose-cache.json`
  byte-for-byte at a recorded provenance SHA; write `SOURCE.sha256`.
- Determinism anchors: `PROVENANCE.md` contents (repo + SHA, render
  command, resolved `fit-terrain` version), `SEED.sha256` as the
  byte-reproducibility anchor.
- Seed render and staging: the design § Code-to-intent rule example is the
  normative statement for `build-seed.sh` (verify `SOURCE.sha256`, render
  with `--output-root` into a disposable directory, refuse the repo root,
  assert the six prose tables, stage under versions that sort before the
  hand-written migrations); cite C5 and C6.
- Setup sequence: `db push --include-all`, PostgREST schema reload after
  push, and the destructive reset path for a re-seed; cite C6.

Verify (stated in the file, per placement): the anon and service-role JWTs
verify against `JWT_SECRET` and a staff-role JWT passes the trials write
policy; the five pgTAP RLS assertions pass; a re-render matches
`SEED.sha256` byte for byte and `SOURCE.sha256` matches the monorepo at the
provenance SHA; the embeddings row count matches the JSONL and a
plain-language query returns condition matches through `match_conditions`.

Step verify: `wc -l` <= 240;
`rg -q match_conditions references/bionova-apps/plan-a-02.md` passes;
`rg -q service_role references/bionova-apps/plan-a-02.md` passes.

## Step 7 — Rewrite `plan-a-03.md` (budget 180)

Part 03: edge functions and the shared handler layer.

Files modified: `references/bionova-apps/plan-a-03.md`.

Source: current plan-a-04.md and plan-a-05.md. Content as intent:

- Four edge-function behavior contracts, one table row each: `embed-seed`
  (reads the mounted JSONL, embeds through TEI, idempotent upsert through
  the unique index), `eligibility-check` (pure scorer over the trial's
  `criteria` row, no LLM; the four score rules), `notify-updates` (pg_net
  trigger on `trials.status` change, logs a would-notify stub),
  `sync-listings` (pg_cron schedule; re-reads staged seed SQL and upserts).
- Security posture: request body caps and generic error responses, written
  from the Step 1 findings.
- Eight handler shapes: one table (handler, CLI command, web route, data
  incl. the prose field each surfaces). Handlers accept a frozen
  `InvocationContext` and return plain data.
- Template layer: `libtemplate` loads the shared templates through the
  exported templates-dir; the CLI renders them with `libformat`; the web
  surface renders React directly.

Verify (stated in the file, per placement): per-function curl checks; a
repeat `embed-seed` run adds no rows; a status UPDATE fires the pg_net
trigger; `cron.job` lists the schedule; handler tests pass offline with an
injected fetch; both surfaces return identical data; the handlers unit
imports `libtemplate`'s entry symbol.

Step verify: `wc -l` <= 180; all four function names, all eight handler
names, and `libtemplate` present
(`rg -c ... references/bionova-apps/plan-a-03.md`).

## Step 8 — Rewrite `plan-a-04.md` (budget 220)

Part 04: the CLI and web surfaces, with the visual token layer.

Files modified: `references/bionova-apps/plan-a-04.md`.

Source: current plan-a-06.md and plan-a-07.md. Content as intent:

- CLI: the nine-command table (args, options, handler), the `--json`
  escape hatch for smoke parity, admin auth (`--token` or
  `SUPABASE_SERVICE_ROLE_KEY`), and the REPL conventions as intent rows
  (slash commands; the output convention Step 1 confirmed from the shipped
  REPL). No definition or REPL source listings.
- Web: the route table (nine pages, six `/api/*` JSON route handlers, the
  health route) and the three context bootstraps as intent (page, admin
  with the staff cookie, request). Pages are Server Components that call
  the shared handlers; the JSON surface lives at distinct `/api/*` paths.
- Standalone build: cite C7 (`outputFileTracingRoot`, `POLARIS_ABOUT_PATH`,
  plain `bun install`) instead of restating the Dockerfile.
- Library placement: `libcli` and `librepl` in the CLI, `libui` in the
  site, `libformat` in the CLI render step, `libutil` pinned in the CLI
  manifest. Styling is hand-rolled Tailwind components; the component
  library stays an implementation choice.
- Visual token layer: apply all six groups of the design § Visual token
  contract (semantic surface colors, the status mapping with human labels,
  the type scale, the spacing and radius geometry, WCAG AA contrast in
  light and dark themes, the 390 px responsive floor).

Verify (stated in the file, per placement): each library's entry symbol is
imported by its consuming unit; an admin upload through Kong lands in
`trial-documents`; the five visual outcomes from the re-cut spec, checked
on the running site and marked **not yet met by the shipped repository**.

Step verify: `wc -l` <= 220;
`rg shadcn references/bionova-apps/plan-a-04.md` empty;
`rg -q 'not yet met' references/bionova-apps/plan-a-04.md` passes.

## Step 9 — Rewrite `plan-a-05.md` (budget 180)

Part 05: deployment, the success-criteria smoke, and interviews.

Files modified: `references/bionova-apps/plan-a-05.md`.

Source: current plan-a-08.md, plus the current design-a.md § Interviewing
Polaris for the interview pointers. Content as intent:

- Railway watch-path model: one config per service, watch paths bound to
  each service directory, the site redeploys when the handlers change; the
  deploy workflow installs the Railway CLI from a pinned npm version and
  runs with read-only `GITHUB_TOKEN`.
- SC smoke: one table row per SC1–SC7 with its assertion. SC1 asserts each
  prose table carries non-null, non-empty text (not row counts alone). SC4
  asserts `faq`, `consentSummary`, and `explainer` are non-empty through
  the `/api/*` surface. Mark the prose-text assertions **not yet met by
  the shipped repository** (its `smoke.sh` asserts row counts today, per
  Step 1). SC7 has a non-destructive render half (`SEED.sha256`) and a DB
  half gated behind `SMOKE_DESTRUCTIVE=1`; cite C6.
- Fixture procedure against the real schema: `build-fixture.sh` reads the
  trial's single `criteria` row; age from the `inclusion` JSONB range
  midpoint, required conditions from `inclusion.conditions_required`, one
  true answer per `inclusion.custom[]` string. Commit the regenerated JSON
  whenever the seed changes.
- Interviews: the committed `kata-interview.yml` workflow and the Substrate
  Contract guide are normative; the record points at them and names the
  substrate verbs (`init`, `check`, `provision`, `pick`, `issue`).
- Docs: deployment and operations pages exist and link from the README.

Verify (stated in the file, per placement): `smoke.sh` covers SC1–SC7 and
asserts non-null prose text; `fit-terrain substrate check` passes; a
dispatched interview completes.

Step verify: `wc -l` <= 180;
`rg -qF 'non-null' references/bionova-apps/plan-a-05.md` passes;
`rg -q build-fixture references/bionova-apps/plan-a-05.md` passes.

## Step 10 — Delete the retired files

Remove the three filenames the 5-part cut retires. The design § File map
closing line retires the names plan-a-04.md through plan-a-08.md; Steps 8
and 9 rewrite plan-a-04.md and plan-a-05.md in place, so only the last
three are deleted.

Files deleted: `references/bionova-apps/plan-a-06.md`,
`references/bionova-apps/plan-a-07.md`,
`references/bionova-apps/plan-a-08.md`.

Verify: `ls references/bionova-apps/*.md | wc -l` prints 8.

## Step 11 — Run the success-criteria gates

Run every mechanical gate from spec § Success Criteria, then the repo
check.

Files: none.

```sh
wc -l references/bionova-apps/*.md        # total <= 1700; design-a.md <= 200
ls references/bionova-apps/*.md | wc -l   # exactly 8
awk 'FNR==1{if(f)print p": unclosed fence"; f=0; p=FILENAME}
  /^[[:space:]]*(```|~~~)/{if(f){if(n>10)print FILENAME":"NR" fence "n" lines"; f=0}
  else{f=1;n=0}; next} f{n++}
  END{if(f)print p": unclosed fence"}' \
  references/bionova-apps/*.md            # prints nothing
rg -n 'shadcn|create-next-app|1\.46\.3|9\.39\.4|20\.19\.0|[Nn]ode[: ]20|nodejs 20|[Dd]eno[: ]1\.|wiki/STATUS|scripts/bootstrap\.sh|KATA_KILLSWITCH|SETUP\.md' \
  references/bionova-apps/                # prints nothing
```

The drift-scan patterns match the stale strings as the current record
spells them (`denoland/deno:1.46.3`, `"eslint": "9.39.4"`, `20.19.0`,
`nodejs 20`, `create-next-app`), so a carried-over pin fails loudly.

Capability-inventory coverage (SC3), one term per inventory row:

```sh
for t in 'Row-Level Security' embed-seed eligibility-check notify-updates \
  sync-listings PostgREST GoTrue JWT_SECRET match_conditions pgvector \
  trial-documents MinIO 'transaction pooler' libcli libui libformat \
  libtemplate librepl libutil InvocationContext 'fit-terrain build' \
  story.dsl prose-cache.json PROVENANCE.md SOURCE.sha256 SEED.sha256 \
  monorepo-setup jidoka-setup kata-setup kata-interview substrate \
  '--output-root'; do
  rg -qF -e "$t" references/bionova-apps/ || echo "MISSING: $t"
done                                      # prints nothing
```

Then `bun run check:fix && bun run check` passes (SC8), and the line
budgets above still hold after the reflow.

Verify: every command output matches its comment.

## Risks

- **The reflow eats budget headroom.** `rumdl fmt` re-wraps prose at 80
  columns and can add lines after the budgets were met. The 170-line gap
  between the 1,530 budget and the 1,700 ceiling absorbs this. Verify
  budgets only after `bun run check:fix` (Step 11).
- **The shipped repository moves.** bionova-apps runs its own Kata loop
  (last push 2026-09-01). If Step 1 finds a reality claim in the spec's
  drift table already superseded, write what the repository at HEAD shows
  and record the delta in the PR body. The version policy makes such drift
  non-blocking.
- **The security posture may not exist repo-side.** Design § Capability
  placement assigns body caps and generic errors to plan-a-03, but the
  current record never states them. If Step 1 finds the shipped functions
  do not implement the posture, state it as intent, mark it not yet met
  like the visual outcomes, and note it in the PR body.
- **Local rumdl drift.** The local rumdl flags pre-existing markdown that
  CI passes. If `bun run check` fails on `format:md`/`lint:md`, confirm the
  flagged files are under `references/bionova-apps/` before treating the
  failure as a regression of this change.

## Execution recommendation

One unit, one PR, steps sequential in the order above. Route to
`staff-engineer` through `kata-implement`: the artifact is a spec-shaped
engineering record whose gate is accuracy against the shipped repository,
not prose quality. Suggested branch `feat/2320-bionova-reference-recut`,
PR title `docs(2320): re-cut the bionova-apps reference record` (the
id-as-scope form matches `design(2320)` on main).

— Staff Engineer 🛠️
