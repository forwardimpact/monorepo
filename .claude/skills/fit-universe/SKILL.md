---
name: fit-universe
description: >
  Synthetic data generation CLI. Generates framework definitions, organizational
  documents, activity data, and personal knowledge base content from a universe
  DSL file. Use when generating example data, testing with synthetic datasets,
  or working with the universe DSL.
---

# fit-universe CLI

Generate synthetic data for the entire Forward Impact suite from a single DSL
file. The CLI orchestrates parsing, entity generation, optional LLM prose, and
rendering into multiple output formats.

## When to Use

- Generating example data for development or testing
- Creating synthetic pathway frameworks for new installations
- Producing organizational documents, activity records, and KB content
- Testing pipeline changes end-to-end
- Writing or editing universe DSL files

---

## CLI Reference

```sh
npx fit-universe                     # Structural generation only (no LLM)
npx fit-universe --cached            # Use cached prose (fast, repeatable)
npx fit-universe --generate          # Generate prose via LLM (requires LLM_TOKEN)
npx fit-universe --cached --strict   # Fail on cache miss
npx fit-universe --load              # Load raw docs to Supabase Storage
npx fit-universe --only=pathway      # Render only one content type
npx fit-universe --dry-run           # Show what would be written
npx fit-universe --universe=path     # Custom universe file
```

### Content Types

Use `--only=<type>` to generate a single content type:

| Type       | Output Directory          | Contents                        |
| ---------- | ------------------------- | ------------------------------- |
| `html`     | `examples/organizational` | Articles, guides, FAQs, courses |
| `pathway`  | `examples/pathway`        | YAML framework files            |
| `raw`      | `examples/activity`       | Roster, GitHub events, evidence |
| `markdown` | `examples/personal`       | Briefings, notes, KB content    |

### Prose Modes

| Mode       | Flag         | Description                   |
| ---------- | ------------ | ----------------------------- |
| `no-prose` | _(default)_  | Structural only, no LLM calls |
| `cached`   | `--cached`   | Read from `.prose-cache.json` |
| `generate` | `--generate` | Call LLM, write to cache      |

---

## Universe DSL

Universe files define a complete synthetic environment. This monorepo's universe
DSL is at `examples/universe.dsl`. A minimal reference DSL ships with
libsyntheticgen at `libraries/libsyntheticgen/data/default.dsl` for quick
testing; projects provide their own DSL file.

### Top-Level Blocks

```dsl
universe Name {
  domain "example.dev"
  industry "technology"
  seed 42

  org hq { ... }
  department engineering { ... }
  team backend { ... }
  people { ... }
  project alpha { ... }
  snapshots { ... }
  scenario launch_push { ... }
  framework { ... }
  content guide_html { ... }
  content basecamp_markdown { ... }
}
```

### Key Blocks

**org / department / team** — Organizational hierarchy with headcounts,
managers, and repo assignments.

**people** — Count, name theme, level distribution, discipline distribution.

**project** — Cross-team initiatives with timelines and prose topics.

**snapshots** — GetDX snapshot generation (quarterly intervals).

**scenario** — Time-bounded effects on teams (commit volume, DX driver
trajectories, evidence generation).

**framework** — Full pathway framework: levels, capabilities with skills,
behaviours, disciplines with skill tiers, tracks, drivers, and stages.

**content** — Output content blocks specifying article/blog/FAQ counts, persona
configurations, and briefing counts.

---

## Data Resolution

This monorepo's universe DSL is `examples/universe.dsl`. Use `--universe=path`
to specify a different file. Without `--universe`, the CLI falls back to the
minimal reference DSL bundled with libsyntheticgen.

All generated output writes to `examples/` at the monorepo root.

---

## Prose Cache

The prose cache is stored at `libraries/libuniverse/.prose-cache.json`. This
file is pre-populated for the BioNova universe (440+ keys). Use `--cached` to
read from it without LLM calls.

When using `--generate`, new prose is appended to the cache after generation
completes. Subsequent runs with `--cached` will reuse all generated content.

---

## Dataset Blocks

The universe DSL may include `dataset` and `output` blocks that require external
tools (Synthea, SDV, Faker). If these tools are not installed, the pipeline will
fail **after** rendering but **before** writing files to disk.

**Workaround:** Create a copy of the DSL without `dataset`/`output` blocks:

```sh
sed '/^  dataset /,/^  }/d; /^  output /d' examples/universe.dsl > /tmp/universe-nodatasets.dsl
npx fit-universe --universe=/tmp/universe-nodatasets.dsl --cached
```

**Note:** The `--only` flag only gates which render types execute (html,
pathway, raw, markdown). It does **not** skip dataset generation — datasets
always run when present in the DSL.

---

## Environment

Generation requires `LLM_TOKEN` and `LLM_BASE_URL` when using `--generate` mode.
Load environment via `scripts/env.sh`:

```sh
ENV=local STORAGE=local AUTH=none ./scripts/env.sh npx fit-universe --generate
```

Or use the Makefile's env loading for consistency. `LLM_TOKEN` is always
available in the standard environment (see CLAUDE.md).

---

## Feeding Generated Content to Guide

After generation, copy HTML files to the Guide knowledge pipeline:

```sh
cp examples/organizational/*.html data/knowledge/
make process-resources    # Create resource documents
make process-graphs       # Build RDF graph index
make process-vectors      # Build vector index (requires TEI)
```

## Verification

After generation, the CLI runs cross-content validation automatically and
reports pass/fail for each check. Validate the generated pathway data
separately:

```sh
npx fit-map validate --data=examples/pathway
```
