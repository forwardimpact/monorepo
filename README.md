# Forward Impact

Great engineering comes from improving the performance of people and machines
together.

## Vision

Our apps define skills, behaviours, and career paths that apply equally to human
engineers and coding agent teams—raising quality, increasing output, and
bringing pride of workmanship to both.

## Apps

| Package                                | Purpose                                        |
| -------------------------------------- | ---------------------------------------------- |
| [@forwardimpact/schema](apps/schema)   | Schema definitions and data loading            |
| [@forwardimpact/model](apps/model)     | Derivation engine for roles and agent profiles |
| [@forwardimpact/pathway](apps/pathway) | Web app and CLI for career progression         |

## Quick Start

```sh
git clone https://github.com/forwardimpact/pathway.git
cd pathway
npm install
npm start
```

Open http://localhost:3000 to explore.

## Documentation

- [Overview](docs/index.md) — Vision and high-level concepts
- [Schema](docs/schema/index.md) — Data model and validation
- [Model](docs/model/index.md) — Derivation logic
- [Pathway](docs/pathway/index.md) — Web app and CLI

## Development

```sh
npm run check      # Format, lint, test
npm run validate   # Validate YAML data
npm run test:e2e   # End-to-end tests
```

## License

Apache-2.0
