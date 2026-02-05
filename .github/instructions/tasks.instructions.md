---
applyTo: "**"
---

# Common Tasks

> **Data-Driven Application**: All entity IDs (skills, disciplines, tracks,
> grades, behaviours) depend on YAML files in `apps/schema/examples/`. Use
> `npx fit-pathway <entity> --list` to discover available values.

## NPM Scripts (Root)

| Script              | Purpose                                |
| ------------------- | -------------------------------------- |
| `npm start`         | Start web app at http://localhost:3000 |
| `npm run check`     | Format, lint, test, SHACL validation   |
| `npm run check:fix` | Auto-fix format and lint issues        |
| `npm run test`      | Run unit tests                         |
| `npm run test:e2e`  | Run Playwright E2E tests               |
| `npm run validate`  | Validate data files                    |
| `npm run pathway`   | Run pathway CLI commands               |

## CLI Tools

| CLI           | Package                  | Purpose                             |
| ------------- | ------------------------ | ----------------------------------- |
| `fit-schema`  | `@forwardimpact/schema`  | Schema validation, index generation |
| `fit-pathway` | `@forwardimpact/pathway` | Web app, entity browsing, agents    |

## Quick Reference

```sh
# Validate data
npx fit-schema validate

# Browse entities
npx fit-pathway skill --list
npx fit-pathway discipline --list

# Generate job definition
npx fit-pathway job <discipline> <grade> --track=<track>

# Generate agent profiles
npx fit-pathway agent <discipline> --track=<track> --output=./agents
```

See package-specific task guides:

- `tasks-schema.instructions.md` — Schema data management
- `tasks-pathway.instructions.md` — Pathway CLI and web app
