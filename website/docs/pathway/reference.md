---
title: Technical Reference
description: File organization, module index, templates, and CLI command reference for the Pathway package.
---

## File Organization

### Map (`products/map/`)

Data model, validation, and loading.

| File                       | Purpose                                                     |
| -------------------------- | ----------------------------------------------------------- |
| `src/loader.js`            | YAML file loading and parsing                               |
| `src/validation.js`        | Referential integrity and data validation                   |
| `src/schema-validation.js` | JSON Schema validation                                      |
| `src/levels.js`            | Type definitions, skill proficiencies, behaviour maturities |
| `src/modifiers.js`         | Capability and skill modifier utilities                     |
| `src/index-generator.js`   | Browser index generation                                    |
| `src/index.js`             | Public API exports                                          |

### Model (`libraries/libpathway/`)

Pure business logic and derivation.

| File                 | Purpose                                                 |
| -------------------- | ------------------------------------------------------- |
| `src/derivation.js`  | Core derivation functions (skills, behaviours, drivers) |
| `src/agent.js`       | Agent profile generation                                |
| `src/job.js`         | Job preparation for display                             |
| `src/job-cache.js`   | Job caching for performance                             |
| `src/profile.js`     | Unified profile derivation (human + agent)              |
| `src/modifiers.js`   | Capability and skill modifier resolution                |
| `src/checklist.js`   | Stage transition checklist derivation                   |
| `src/toolkit.js`     | Tool derivation from skill references                   |
| `src/interview.js`   | Interview question selection                            |
| `src/progression.js` | Career path analysis and gap identification             |
| `src/matching.js`    | Job matching and gap analysis                           |
| `src/policies/`      | Filtering, sorting, and threshold policies              |

### Pathway (`products/pathway/`)

Presentation layer — formatters, pages, components.

| Directory            | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `src/formatters/`    | Output formatting (shared, DOM, markdown) |
| `src/pages/`         | Web page modules                          |
| `src/components/`    | Reusable UI components                    |
| `src/commands/`      | CLI command handlers                      |
| `src/slides/`        | Presentation slide modules                |
| `src/lib/`           | Shared utilities                          |
| `src/css/`           | Stylesheets                               |
| `templates/`         | Mustache templates for agent output       |
| `bin/fit-pathway.js` | CLI entry point                           |

---

## Formatter Reference

Each entity has a formatter directory with three files:

| File          | Pattern                | Side Effects     |
| ------------- | ---------------------- | ---------------- |
| `shared.js`   | Pure text transforms   | None             |
| `dom.js`      | DOM element creation   | Creates elements |
| `markdown.js` | Markdown string output | None             |

### Available Formatters

| Entity     | Directory                | Key Exports                        |
| ---------- | ------------------------ | ---------------------------------- |
| Agent      | `formatters/agent/`      | Profile, skill document formatting |
| Behaviour  | `formatters/behaviour/`  | Maturity display, profile tables   |
| Capability | `formatters/capability/` | Capability cards, skill grouping   |
| Checklist  | `formatters/checklist/`  | Read/confirm checklist formatting  |
| Discipline | `formatters/discipline/` | Discipline cards, tier display     |
| Driver     | `formatters/driver/`     | Coverage display, driver cards     |
| Level      | `formatters/level/`      | Level badges, level tables         |
| Job        | `formatters/job/`        | Full job document formatting       |
| Skill      | `formatters/skill/`      | Level badges, matrix tables        |
| Stage      | `formatters/stage/`      | Stage cards, lifecycle flow        |
| Track      | `formatters/track/`      | Modifier display, track cards      |

---

## CLI Reference

### Entry Point

```sh
npx fit-pathway <command> [arguments] [options]
```

### Entity Commands

All entities support `--list` to enumerate available values:

```sh
npx fit-pathway skill --list
npx fit-pathway skill <id>            # Show skill details

npx fit-pathway discipline --list
npx fit-pathway discipline <id>

npx fit-pathway level --list
npx fit-pathway level <id>

npx fit-pathway track --list
npx fit-pathway track <id>

npx fit-pathway behaviour --list
npx fit-pathway behaviour <id>

npx fit-pathway capability --list
npx fit-pathway capability <id>

npx fit-pathway stage --list
npx fit-pathway stage <id>

npx fit-pathway driver --list
npx fit-pathway driver <id>

npx fit-pathway tool --list          # Derived from skill toolReferences
```

### Job Command

Generate a complete job definition:

```sh
npx fit-pathway job <discipline> <level> [--track=<track>]
```

**Arguments:**

- `discipline` — Discipline ID (e.g., `software_engineering`)
- `level` — Level ID (e.g., `L3`)

**Options:**

- `--track=<id>` — Track ID (e.g., `platform`)

### Agent Command

Generate AI agent profiles:

```sh
npx fit-pathway agent <discipline> [--track=<track>] [--output=<dir>]
```

**Arguments:**

- `discipline` — Discipline ID

**Options:**

- `--track=<id>` — Track ID
- `--output=<dir>` — Output directory (default: stdout)

### Build Command

Build the static website:

```sh
npx fit-pathway build [--url=<base-url>]
```

**Options:**

- `--url=<url>` — Base URL for the published site

---

## Template Reference

### Agent Profile Template

```
templates/agent.md.mustache
```

Variables: `roleTitle`, `specialization`, `skills`, `behaviours`, `constraints`,
`handoffs`, `workingStyles`

### Skill Document Template

```
templates/skill.md.mustache
```

Variables: `skillName`, `description`, `useWhen`, `stages` (with `focus`,
`activities`, `ready` per stage)

---

## NPM Scripts

| Script              | Purpose                         |
| ------------------- | ------------------------------- |
| `npm start`         | Build and serve the static site |
| `npm run dev`       | Live development server         |
| `npm run check`     | Format, lint, test, validate    |
| `npm run check:fix` | Auto-fix formatting and linting |
| `npm run test`      | Run unit tests                  |
| `npm run test:e2e`  | Run Playwright E2E tests        |
| `npm run validate`  | Validate data files             |

---

## Related Documentation

- [Pathway Overview](/docs/pathway/) — Architecture and formatter pattern
- [Agents](/docs/pathway/agents/) — Agent profile generation details
- [Map](/docs/map/) — Data model and validation
