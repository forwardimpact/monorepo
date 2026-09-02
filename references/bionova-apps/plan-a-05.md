# Plan Part 05 — Deployment, Success-Criteria Smoke, and Interviews

Wire the Railway deployment, the smoke script that proves the spec's
success criteria, and the interview loop. All paths are relative to the
`bionova-apps/` repo root.

## Railway watch-path model

One Railway config per service, with watch paths bound to that service's
directory, so a push rebuilds only the changed services. A handlers
change also redeploys the site through the deploy workflow's
changed-path service mapping, because the site bundles the handlers.
The deploy workflow detects the changed paths on a push to `main`,
installs the Railway CLI from a pinned npm version (never a `curl | sh`
flow that resolves "latest"), and runs with a read-only `GITHUB_TOKEN`.
Without Railway account access, defer the deploy verification per plan
§ Risks.

## Success-criteria smoke

`scripts/smoke.sh` asserts one row per criterion against a freshly
booted stack:

| Criterion | Assertion |
| --- | --- |
| SC1 | Every expected service reports healthy, embeddings are seeded, and each of the six prose tables carries non-null, non-empty text. The prose-text half is **not yet met by the shipped repository**: its SC1 checks assert row counts today |
| SC2 | The `/api/*` search for "high blood sugar" matches on condition names, so an unrelated trial in a diabetes-named therapeutic area cannot satisfy it |
| SC3 | The eligibility check returns `eligible` for the committed matching-patient fixture |
| SC4 | `faq`, `consentSummary`, and `explainer` are non-empty through the `/api/*` surface. The shipped smoke already asserts these |
| SC5 | CLI `--json` search ids equal the web `/api/*` search ids |
| SC6 | A staff CLI update propagates to PostgREST, the web JSON surface, and the rendered page |
| SC7 | The render half re-runs the seed build and verifies `SEED.sha256`; it never touches the live database. The DB half re-pushes onto a reset schema and compares a data digest; it is destructive, so an explicit `SMOKE_DESTRUCTIVE=1` gates it (C6) |

## Eligibility fixture

`scripts/build-fixture.sh` regenerates the committed matching-patient
fixture from the live, seeded database. It reads the trial's single
`criteria` row: age comes from the `inclusion` JSONB range midpoint,
required conditions from `inclusion.conditions_required`, the ecog
answer from the inclusion ecog cap (0 when absent), and one true answer
per `inclusion.custom[]` string. Commit the regenerated JSON whenever
the seed changes.

## Interviews

The committed `.github/workflows/kata-interview.yml` workflow and the
Substrate Contract guide are normative (design § Interviewing Polaris
carries the three Polaris-specific mappings). The interview loop runs on
the `fit-terrain substrate` verbs: `init`, `check`, `provision`, `pick`,
and `issue`. `init` writes the committed substrate-contract migration
that maps the seed schema onto the contract views.

## Docs

Deployment and operations pages exist under `docs/` and link from the
README: how to push, roll back, view logs, re-seed, and rotate the
service-role key.

## Verification

- `smoke.sh` covers SC1 through SC7 and asserts non-null prose text.
- `fit-terrain substrate check` passes against the booted stack.
- A dispatched interview completes.

— Staff Engineer 🛠️
