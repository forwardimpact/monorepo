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

Universe files define a complete synthetic environment. The default file is at
`libraries/libuniverse/data/default.dsl`.

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

The production universe DSL lives at `libraries/libuniverse/data/universe.dsl`.
The default test universe is `libraries/libuniverse/data/default.dsl`. Use
`--universe=path` to specify a custom file.

All generated output writes to `examples/` at the monorepo root.

---

## Environment

Generation requires `LLM_TOKEN` and `LLM_BASE_URL` when using `--generate` mode.
These are always available in the standard environment (see AGENTS.md).

```sh
npx fit-universe --generate          # Uses LLM_TOKEN from environment
```

## Verification

After generation, the CLI runs cross-content validation automatically and
reports pass/fail for each check. Validate the generated pathway data
separately:

```sh
npx fit-map validate --data=examples/pathway
```
