# Forward Impact Engineering

> "The aim of leadership should be to improve the performance of man and
> machine, to improve quality, to increase output, and simultaneously to bring
> pride of workmanship to people."
>
> — W. Edwards Deming

## The Problem

Organizations force AI adoption onto engineers without regard for well-being,
quality of their output, or sustainability—creating disharmony between
leadership, engineers, and the AI strategy. What's missing is a human-centered
approach where AI empowers people to do their best work.

## The Vision

Five products raise quality, increase output, and bring pride of workmanship to
engineering teams:

| Product      | Question it answers                            |
| ------------ | ---------------------------------------------- |
| **Map**      | What does good engineering look like here?      |
| **Pathway**  | Where should I grow next?                       |
| **Basecamp** | What do I need to handle today?                 |
| **Landmark** | What does my engineering work demonstrate?      |
| **Summit**   | Can this team deliver what we need?             |

## Products

**[Map](products/map)** — Data product for engineering capability. Defines
skills, levels, behaviours, markers, and drivers in YAML. Owned, validated, and
published for consumption by humans and agents.

**[Pathway](products/pathway)** — Web app and CLI for career progression. Browse
skills, generate job definitions, and create agent teams and skills.

**[Basecamp](products/basecamp)** — Personal knowledge system with scheduled AI
tasks. Sync email, prep meetings, draft responses.

**[Guide](products/guide)** — LLM agent that interprets engineering artifacts
against skill markers. Reads source from Map, writes evidence back to Map.

**Landmark** — Thin analysis layer on Map data. Presents Guide-generated
evidence, GetDX snapshot scores, and trend views. No LLM calls — query,
aggregate, explain.

**Summit** — Views a team as a system, not a collection of individuals.
Aggregates skill matrices into capability coverage, structural risks, and
what-if staffing scenarios. Fully local and deterministic.

## Quick Start

```sh
git clone https://github.com/forwardimpact/pathway.git
cd pathway
npm install
npm start
```

Open http://localhost:3000 to explore.

## Documentation

- [Overview](website/docs/index.md) — Vision and high-level concepts
- [Map](website/docs/map/index.md) — Public data model for AI agents and
  engineers
- [Model](website/docs/model/index.md) — Derivation logic
- [Pathway](website/docs/pathway/index.md) — Web app and CLI
- [Basecamp](website/docs/basecamp/index.md) — Personal knowledge system

## Development

```sh
npm run check      # Format, lint, test
npm run validate   # Validate YAML data
npm run test:e2e   # End-to-end tests
```

## License

Apache-2.0
