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

Six products raise quality, increase output, and bring pride of workmanship to
engineering teams:

| Product      | Question it answers                               |
| ------------ | ------------------------------------------------- |
| **Map**      | What does good engineering look like here?        |
| **Pathway**  | Where does my career path go from here?           |
| **Basecamp** | Am I prepared for what's ahead today?             |
| **Guide**    | How do I find my bearing?                         |
| **Landmark** | What milestones has my engineering reached?       |
| **Summit**   | Is this team supported to reach peak performance? |

## Products

**[Map](products/map)** — The data product that provides shared context for
every product in the suite. Defines skills, levels, behaviours, and markers in
YAML, imports operational signals (organization hierarchy, GitHub activity,
GetDX snapshots), and publishes it all for humans and agents.

**[Pathway](products/pathway)** — Web app, CLI, and static site generator for
career progression. Browse skills, generate job definitions, create agent teams
and skills to support and empower the engineers, produce VS Code agent profiles,
and build interview question sets.

**[Basecamp](products/basecamp)** — Personal operations center with scheduled AI
tasks. Syncs email and calendar, builds a knowledge graph of people, projects
and topics, drafts responses, prepares meeting briefings, and runs quietly in
the background with a macOS status menu.

**[Guide](products/guide)** — AI agent that understands your organization's
engineering framework — skills, levels, behaviours, and expectations — and
reasons about them in context. Helps engineers onboard, find growth areas, and
interpret artifacts against skill markers.

**[Landmark](website/landmark)** — Analysis layer for engineering-system
signals. Combines objective marker evidence from GitHub artifacts with
subjective outcomes from GetDX snapshots, presenting team-level and individual
views grounded in your framework. No LLM calls — query, aggregate, explain.

**[Summit](website/summit)** — Treats a team as a system, not a collection of
individuals. Aggregates skill matrices into capability coverage, structural
risks, and what-if staffing scenarios so leaders can build teams that succeed.
Fully local and deterministic — no external dependencies, no LLM calls.

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
