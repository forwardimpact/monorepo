# Spec 1130 — BioNova Demo: End-to-End Forward Impact Showcase

An external team should be able to take Forward Impact's tooling — shared
libraries, the engineering standard, the Kata agent team, the synthetic data
pipeline — and build a working product from scratch. Not a toy. A
MONOREPO.md-compliant repository with a self-hosted Supabase stack, a Next.js
frontend, a CLI, and deterministic seed data generated from a single DSL file.
No end-to-end proof of this exists today.

## Problem

Forward Impact publishes shared libraries (`libcli`, `libui`, `libformat`,
`libtemplate`, `librepl`), an engineering standard, and a Kata agent team — but
there is no complete demonstration that an external team can consume these tools
to build a real product autonomously. The terrain pipeline generates
organizational and engineering data but has no clinical domain support, so it
cannot seed a healthcare application. The pitch to engineering leaders and
boards lacks a concrete, running artifact.

### Who is affected

- **Engineering leaders** evaluating Forward Impact for their organization — no
  working reference implementation exists outside the monorepo itself.
- **Platform builders** adopting shared libraries — no external consumer example
  to follow.
- **The Forward Impact team** — the pitch has no live demo to anchor it.

## Proposal

Build a synthetic pharmaceutical company ("BioNova Therapeutics") as the
setting for a complete demonstration. The demo comprises three deliverables
that depend on each other:

1. **Clinical domain support in the terrain pipeline** — extend the DSL grammar,
   AST, `libsynthetic*` libraries, and `libterrain` so `fit-terrain generate`
   produces clinical trial data, patient-facing prose, SQL migrations, and
   vector-embeddable text blocks.

2. **Story DSL clinical rewrite** — write the concrete `story.dsl` content
   (conditions, sites, trials, criteria, projects, scenarios, datasets, outputs)
   that exercises the new pipeline capabilities.

3. **BioNova Finder application** — a patient-facing clinical trial search
   application in its own MONOREPO.md-compliant repository (`bionova-apps`),
   consuming Forward Impact shared libraries from npm and seeded by the terrain
   pipeline.

These are specified individually in specs 1140, 1150, and 1160.

## Scope

### Included

- Terrain pipeline: clinical domain block, entity generation, prose pipeline,
  SQL migration rendering, embeddings JSONL rendering, Synthea
  operationalization, clinical HTML templates.
- Story DSL: 6 conditions, 3-5 sites, 6 trials with criteria, clinical content,
  3 new projects, 2 new scenarios, updated datasets and outputs.
- Finder application: Next.js frontend, CLI (`bionova-finder`), shared handlers,
  Supabase Edge Functions, self-hosted Supabase stack (PG On Rails), pgvector
  semantic search, eligibility screener.

### Excluded

- **SCRATCHPAD-DEMO-PITCH.md** — the C-suite pitch deck is not a software
  deliverable.
- Real patient data or HIPAA compliance — all data is synthetic.
- Mobile-native apps — responsive web only.
- Integration with ClinicalTrials.gov or other real registries.
- Publishing to the `fit-*` namespace — BioNova is a separate repo.

## Success Criteria

1. `fit-terrain generate` produces SQL migrations and embeddings JSONL from a
   story.dsl containing a `clinical {}` block. Verify: `bun run fit-terrain
   generate --mode no-prose` completes without error and generates files at the
   configured output paths.

2. The BioNova Finder application starts from `docker compose up` and displays
   seeded clinical trial data. Verify: `setup.sh` completes, `/search` returns
   trial results, `/trials/:id` shows trial detail.

3. All domain data is deterministic (seed 42) and regenerable from scratch.
   Verify: two consecutive `fit-terrain generate` runs produce identical output.

4. The Finder CLI (`bionova-finder search`, `bionova-finder trial <id>`) returns
   the same data as the web interface. Verify: CLI output matches web response
   for the same trial ID.
