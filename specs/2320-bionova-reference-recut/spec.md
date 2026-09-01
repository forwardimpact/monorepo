# Spec 2320: Re-cut the BioNova Polaris Reference

**Classification:** internal. The change lands in `references/`, which is
neither `products/` nor `services/`. The reference it improves serves the
Platform Builders persona: it proves that Forward Impact libraries and the
synthetic-data pipeline compose into a product outside the monorepo.

**Persona and job:** Platform Builders → Build Agent-Capable Systems
(JTBD.md). The reference is the artifact that proves this job's tools work
outside the monorepo. Engineering Leaders benefit second: the pitch cites a
live application.

## Problem

The `references/bionova-apps/` record is the living template for the shipped
`forwardimpact/bionova-apps` repository.
[references/CLAUDE.md](../../references/CLAUDE.md) gives the record one job:
stay current, so the implementation can be recreated from it. The record fails
that job in four ways.

### The record duplicates its implementation

The record holds 3,930 lines across 11 files. Fenced code blocks carry 1,406
of those lines (36 percent). The blocks hold full shell scripts, SQL
migrations, CI workflows, and JS modules that the built repository already
contains in tested and reviewed form. plan-a-08 is 66 percent code. plan-a-06
is 63 percent code. Each block is a second copy that drifts independently of
the first. Every maintenance pass must reconcile both copies.

### The record drifted from the shipped repository

The first week of bionova-apps history (2026-06-30 through 2026-07-08)
corrected boot defects and reconciled the repository with the monorepo
baseline. The record absorbed most of those fixes as scattered prose. Several
of its claims are now false:

| Record claims | Repository reality |
| --- | --- |
| The web surface uses shadcn/ui | Hand-rolled Tailwind components. Repo commit `5efe9de` corrected the same claim in the product README. |
| `create-next-app@14.2`, Node 20, Deno 1.46.3, eslint 9 | Next 15.5, Node 22, Deno 2.x (lockfile v5), eslint 10, migrated through bionova specs 30, 40, and 50. |
| The fixture script reads per-criterion `kind`/`spec` rows | `criteria` holds one row per trial with `inclusion`/`exclusion` JSONB. The printed script cannot run. |
| A trailing monorepo PR flips the spec-1160 STATUS row | Spec 1160 is closed. references/CLAUDE.md § Keep a reference current owns the maintenance loop. |

Verify the reality column against the repository itself, per
references/CLAUDE.md § Keep a reference current (add the repository to the
session, then read its history).

### The record restates what skills own

The `monorepo-setup` skill, with `jidoka-setup` and `kata-setup`, owns the
repository skeleton, the check workflows, and the wiki bootstrap.
references/CLAUDE.md routes shared content to the owning layer: "Never restate
in the spec what an authoritative layer owns. Point to it instead." The record
still enumerates the skeleton artifacts the skill leaves behind and repeats
its ownership rules across parts. Reference-specific extensions stay in the
record: the bionova-only check concerns and the Polaris gitignore appends are
not skill-owned.

### The record specifies no visual outcome

The record names a styling stack and zero visual success criteria. The shipped
app is functionally correct and visually flat, and each defect is visible in
the repository source: the site's Tailwind config defines seven flat colors,
no component carries a dark-mode variant, one badge component serves every
trial status, the trial pages render raw enums such as `active_not_recruiting`
to patients, and the navigation has no mobile breakpoint. A reference that
anchors a pitch must look like a product a team would ship.

## Proposal

Re-cut the record to eight files and at most 1,700 lines. Keep every
capability the reference exists to prove. Specify each capability as intent
plus verification. The built repository is the executable evidence. The record
stops carrying implementation code.

### Target shape

| File | Carries |
| --- | --- |
| `spec.md` | WHAT/WHY, capability inventory, success criteria with visual outcomes |
| `design-a.md` | Architecture, schema summary, design-token contract, key decisions |
| `plan-a.md` | Approach, repository-boundary rule, part index, consolidated hard-won constraints, risks |
| `plan-a-01.md` | Repo bootstrap through the skill gates + the PG On Rails stack |
| `plan-a-02.md` | Hand-written schema + vendored DSL + deterministic seed pipeline |
| `plan-a-03.md` | Edge functions + shared handlers |
| `plan-a-04.md` | CLI + web surfaces, with the visual token layer |
| `plan-a-05.md` | Deployment + success-criteria smoke |

### Capability inventory

These capabilities are the reference's reason to exist. The re-cut keeps every
row as a named requirement with a verification.

Supabase patterns:

| Capability | Requirement |
| --- | --- |
| Row-Level Security | Three policy classes: public read on seed tables, staff-JWT writes on trials and criteria, anonymous insert with staff-only read on `interest_signals`. |
| Edge functions | Four Deno functions: `embed-seed` (idempotent upsert through a unique index), `eligibility-check` (pure scorer, no LLM), `notify-updates` (pg_net trigger on status change), `sync-listings` (pg_cron schedule). |
| Data API | PostgREST is the only data API. Kong fronts it with the `/rest`, `/auth`, `/realtime`, `/storage`, and `/functions` routes. |
| Auth | GoTrue issues JWTs. The anon and service-role keys are JWTs signed by the shared `JWT_SECRET`. |
| Semantic search | pgvector similarity through a `match_conditions` RPC over 384-dim TEI embeddings. |
| Storage | MinIO behind the Supabase storage API with a `trial-documents` bucket. |
| Connection topology | Only PostgREST connects through the transaction pooler. GoTrue, Storage, and Realtime connect directly to Postgres. |

FIT capabilities:

| Capability | Requirement |
| --- | --- |
| Shared libraries | The record's five (`libcli`, `libui`, `libformat`, `libtemplate`, `librepl`) plus `libutil`, which the shipped CLI pins from npm (`@forwardimpact/libutil` in the Polaris CLI manifest). |
| Shared surface | One handler layer. Both surfaces dispatch through a frozen `InvocationContext`. |
| Synthetic data | `fit-terrain build` against a verbatim-vendored `story.dsl` + `prose-cache.json`, rendered with `--output-root` into a disposable directory. |
| Determinism | `PROVENANCE.md`, `SOURCE.sha256`, and `SEED.sha256` anchor a credential-free, byte-reproducible seed. |
| Scaffolding | `monorepo-setup`, `jidoka-setup`, and `kata-setup` are hard gates. The record points to them and never restates them. |
| Interviews | `kata-interview` runs against the Substrate Contract through the `fit-terrain substrate` verbs. |

### Code becomes intent

Each former code block becomes one statement of what the code must do plus one
verification command. Fenced blocks remain only for commands and data shapes,
and none exceeds 10 lines.

### Visual outcome

The re-cut spec carries these outcomes as success criteria. The re-cut design
names a design-token contract: semantic colors with a status mapping, a type
scale, spacing and radius steps, and light plus dark themes. The component
library stays an implementation choice.

1. A patient tells a recruiting trial from a closed trial at a glance.
2. No raw status enum reaches a patient surface. Every status renders as a
   human label.
3. Light and dark themes both render, and text meets WCAG AA contrast in both.
4. A 390 px viewport shows no horizontal scroll, and the navigation stays
   usable.
5. Each page uses a type scale of at least three steps. Headings, body text,
   and metadata are visually distinct.

### Version policy

The record states only load-bearing minimums: `fit-terrain` >= 0.1.41 (for
`--output-root` and prose-to-SQL), Bun >= 1.2.9 (for `apm install`), and
Deno 2.x (for lockfile v5). A rebuild resolves current versions and records
them in `PROVENANCE.md` and the PR body. Exact pins leave the record. The
evidence for this policy: the record and the repository both pin one release
behind npm today (`fit-terrain` 0.1.41 against 0.1.43, and all five library
pins), so exact pins generate a false drift finding on every pass.

**Compatibility stance:** clean break. The re-cut replaces the 11-file record.
No file keeps content that only serves the old shape.

## Scope

### Included

`references/bionova-apps/*.md` only: the re-cut of all 11 files into the 8
target files.

### Excluded

Any change in the `forwardimpact/bionova-apps` repository. The re-cut names
these gaps as follow-on work for that repository's own Kata loop:

| Follow-on | Gap and its source evidence |
| --- | --- |
| Visual token rebuild | Apply the token contract so the app meets the visual outcomes. Evidence: the site's Tailwind config and components, per § The record specifies no visual outcome. |
| Seed re-apply defect | Staged seed migrations keep stable versions with mutable content, so a re-render never reaches an already-seeded database. The smoke script asserts row counts, not text, so it passes on NULL prose. Evidence: the seed staging scheme in the seed script and the SC1 checks in the smoke script. |
| Screener result view | The web screener discards the plain-language pre-check view model, including the self-assessment disclaimer, and renders only a score badge. Evidence: the eligibility submit route redirects with the score alone. |
| Screener completeness | The web screener collects no age or conditions, so the `eligible` score is unreachable from the web surface. Evidence: the screener component renders only the custom yes/no questions. |

The re-cut record marks the five visual outcomes as not yet met by the shipped
repository. The next maintenance pass carries them repo-side, together with
this table.

## Success Criteria

1. Line budget: `wc -l references/bionova-apps/*.md` totals at most 1,700, and
   exactly the eight target files exist.
2. Code rule: no fenced block exceeds 10 lines. Verify with an `awk` fence
   scan. The review panel verifies the content class (commands and data shapes
   only).
3. Inventory: every capability-inventory row above appears in the re-cut
   record. Verify with `rg` per row term.
4. Routing: skill-owned scaffolding appears only as pointers to
   `monorepo-setup`, `jidoka-setup`, and `kata-setup`. Verify: `rg` finds no
   skeleton hand-off inventory in the re-cut, and the review panel confirms
   that reference-specific extensions (bionova-only check concerns, Polaris
   ignores) stay.
5. Visual: the re-cut spec carries the five visual outcomes as success
   criteria and marks them as not yet met by the shipped repository.
6. Token contract: the re-cut design carries the token contract and stays at
   or under 200 lines. Verify: `wc -l`.
7. Truth: each false claim in the drift table above is corrected in the re-cut
   record, and the smoke criteria assert non-null prose text instead of row
   counts alone.
8. Gates: `bun run check` passes on the re-cut.

The rebuild proof, which recreates bionova-apps from the record, belongs to
the maintenance pass that references/CLAUDE.md § Keep a reference current
defines. These criteria gate the re-cut's form. The next pass exercises the
rebuild.
