# Forward Impact Engineering

[![Quality](https://github.com/forwardimpact/monorepo/actions/workflows/check-quality.yml/badge.svg)](https://github.com/forwardimpact/monorepo/actions/workflows/check-quality.yml)
[![Test](https://github.com/forwardimpact/monorepo/actions/workflows/check-test.yml/badge.svg)](https://github.com/forwardimpact/monorepo/actions/workflows/check-test.yml)
[![Security](https://github.com/forwardimpact/monorepo/actions/workflows/check-security.yml/badge.svg)](https://github.com/forwardimpact/monorepo/actions/workflows/check-security.yml)

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

## Quick Start

Install Pathway and Guide from npm, then generate installation-specific service
code:

```sh
npm install @forwardimpact/pathway @forwardimpact/guide
npx fit-codegen --all
```

Browse your engineering framework:

```sh
npx fit-pathway discipline --list
npx fit-pathway job software_engineering L3
```

Guide requires a running service stack — see the
[getting started guide](website/docs/getting-started/engineers/index.md) for
setup.

## Learn More

- [Documentation](website/docs/) — Getting started, guides, reference, and
  architecture internals
- [CONTRIBUTING.md](CONTRIBUTING.md) — Pull request workflow, git conventions,
  and quality commands
- [CLAUDE.md](CLAUDE.md) — Architecture context for coding agents

## License

Apache-2.0
