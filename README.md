# Forward Impact Engineering

> "The aim of leadership should be to improve the performance of man and machine,
> to improve quality, to increase output, and simultaneously to bring pride of
> workmanship to people."
>
> — W. Edwards Deming

## The Problem

Organizations force AI adoption onto engineers without regard for well-being,
quality of their output, or sustainability—creating disharmony between
leadership, engineers, and the AI strategy. What's missing is a human-centered
approach where AI empowers people to do their best work.

## The Vision

**Pathway** defines skills, behaviours, and career paths for human engineers and
AI coding agents alike. **Basecamp** gives every engineer a personal knowledge
system, powered by AI agents. Together, they raise quality, increase output, and
bring pride of workmanship to engineering teams.

## Packages

| Package                                          | Purpose                                           |
| ------------------------------------------------ | ------------------------------------------------- |
| [@forwardimpact/schema](apps/schema)             | Schema definitions and data loading               |
| [@forwardimpact/libpathway](libs/libpathway)     | Derivation engine for roles and agent profiles    |
| [@forwardimpact/pathway](apps/pathway)           | Web app and CLI for career progression            |
| [@forwardimpact/basecamp](apps/basecamp)         | Personal knowledge system with scheduled AI tasks |

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
- [Basecamp](docs/basecamp/index.md) — Personal knowledge system

## Development

```sh
npm run check      # Format, lint, test
npm run validate   # Validate YAML data
npm run test:e2e   # End-to-end tests
```

## License

Apache-2.0
