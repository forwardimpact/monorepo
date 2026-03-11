---
title: Generating Synthetic Data
description: Use the universe DSL and fit-universe CLI to generate realistic framework definitions, organizational documents, activity records, and knowledge base content.
---

## Overview

`fit-universe` generates synthetic data for the entire Forward Impact suite
from a single DSL file. It produces career framework definitions, organizational
documents, developer activity records, and personal knowledge base content —
everything needed to develop, demo, or test the system without real data.

Generated output lands in `examples/` at the monorepo root.

---

## Quick Start

```sh
# Generate structural data (no LLM needed)
npx fit-universe

# Generate with LLM-written prose (requires LLM_TOKEN)
npx fit-universe --generate

# Use cached prose for fast, repeatable runs
npx fit-universe --cached

# Preview what would be generated
npx fit-universe --dry-run

# Generate only pathway framework data
npx fit-universe --only=pathway
```

---

## Writing a Universe File

A universe file defines the shape of the synthetic world. The default lives at
`libraries/libuniverse/data/default.dsl`.

```dsl
universe MyCompany {
  domain "mycompany.dev"
  industry "fintech"
  seed 42

  org hq {
    name "MyCompany Engineering"
    location "London, UK"
  }

  department engineering {
    name "Engineering"
    parent hq
    headcount 30

    team payments {
      name "Payments Team"
      size 8
      manager @alice
      repos ["payments-api", "billing-service"]
    }
  }

  people {
    count 30
    names "greek_mythology"
    distribution {
      L1 25%
      L2 30%
      L3 25%
      L4 15%
      L5 5%
    }
    disciplines {
      software_engineering 70%
      data_engineering 20%
      engineering_management 10%
    }
  }

  framework { ... }
  content guide_html { ... }
}
```

### Key Blocks

| Block          | Purpose                                                    |
| -------------- | ---------------------------------------------------------- |
| `org`          | Top-level organization with name and location              |
| `department`   | Organizational unit with headcount                         |
| `team`         | Team within a department, with manager and repos           |
| `people`       | People count, level distribution, discipline distribution  |
| `project`      | Cross-team initiative with timeline and prose topic        |
| `snapshots`    | GetDX snapshot generation (quarterly intervals)            |
| `scenario`     | Time-bounded effects on teams (commit volume, DX drivers)  |
| `framework`    | Pathway framework: levels, capabilities, disciplines, etc. |
| `content`      | Output content blocks (article counts, persona configs)    |

---

## What Gets Generated

### Framework data (`examples/pathway/`)

Complete YAML files matching the Map schema — levels, capabilities with skills,
disciplines, behaviours, tracks, stages, and drivers. These files are valid
input for `fit-pathway` and `fit-map validate`.

### Organizational documents (`examples/organizational/`)

HTML articles, guides, FAQs, and course outlines for an internal engineering
knowledge base.

### Activity data (`examples/activity/`)

Roster (organization people), GitHub events and artifacts, GetDX snapshots and
team scores, and skill evidence records.

### Personal content (`examples/personal/`)

Markdown briefings and notes for Basecamp knowledge bases.

---

## Prose Modes

Content generation happens in tiers:

| Tier | What                           | Requires LLM |
| ---- | ------------------------------ | ------------- |
| 0    | Structural entities            | No            |
| 1    | Template-based prose           | Yes           |
| 2    | Deep framework prose (pathway) | Yes           |

Use `--generate` to invoke the LLM. Results are cached in
`.prose-cache.json` — subsequent runs with `--cached` skip LLM calls entirely.
Use `--cached --strict` to fail on cache misses rather than silently skipping.

---

## Validating Output

The CLI runs cross-content validation automatically after generation. To
validate the generated pathway data against the Map schema:

```sh
npx fit-map validate --data=examples/pathway
```

---

## Custom Universe Files

Point to any DSL file with `--universe=path`:

```sh
npx fit-universe --universe=./my-universe.dsl --generate
```

This is useful for generating data for different organizational shapes, team
sizes, or framework configurations without modifying the default.

---

## Related

- [Map](/docs/map/) — Schema and validation for framework data
- [Pathway](/docs/pathway/) — CLI and web app that consumes framework data
- [Model](/docs/model/) — How entities combine into role definitions
