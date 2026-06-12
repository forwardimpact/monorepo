# Forward Impact Engineering

[![Context](https://github.com/forwardimpact/monorepo/actions/workflows/check-context.yml/badge.svg)](https://github.com/forwardimpact/monorepo/actions/workflows/check-context.yml)
[![Data](https://github.com/forwardimpact/monorepo/actions/workflows/check-data.yml/badge.svg)](https://github.com/forwardimpact/monorepo/actions/workflows/check-data.yml)
[![Quality](https://github.com/forwardimpact/monorepo/actions/workflows/check-quality.yml/badge.svg)](https://github.com/forwardimpact/monorepo/actions/workflows/check-quality.yml)
[![Test](https://github.com/forwardimpact/monorepo/actions/workflows/check-test.yml/badge.svg)](https://github.com/forwardimpact/monorepo/actions/workflows/check-test.yml)
[![Security](https://github.com/forwardimpact/monorepo/actions/workflows/check-security.yml/badge.svg)](https://github.com/forwardimpact/monorepo/actions/workflows/check-security.yml)

## The Problem

Engineering organizations lack shared definitions of quality. Promotions stall
because managers can't point to what 'senior' means. Staffing decisions rely on
gut feel. The only available metrics single out individuals. Engineers can't see
what's expected of them, and coding agents follow generic practices instead of
organizational standards.

## The Goal

> "The aim of leadership should be to improve the performance of [engineers] and
> [agents], to improve quality, to increase output, and simultaneously to bring
> pride of workmanship to people."
>
> — W. Edwards Deming

## Who Hires These Products

### Engineering Leaders

Define what good engineering looks like, staff teams to succeed, and measure
outcomes without blaming individuals.

| Job                             | Products |
| ------------------------------- | -------- |
| Define the Engineering Standard | Map      |
| Staff Teams to Succeed          | Summit   |
| Measure Engineering Outcomes    | Landmark |

### Empowered Engineers

Understand expectations, find growth areas, prepare for the day ahead, and
equip and trust their agent teams — grounded in their organization's
agent-aligned engineering standard.

| Job                                         | Products |
| ------------------------------------------- | -------- |
| See What's Expected — for Humans and Agents | Pathway  |
| Get Judgment Grounded in the Standard       | Guide    |
| Be Prepared and Productive                  | Outpost  |

## Quick Start

Install Pathway and Guide from npm, then generate installation-specific service
code:

```sh
npm install @forwardimpact/pathway @forwardimpact/guide
npx fit-codegen --all
```

Browse your agent-aligned engineering standard:

```sh
npx fit-pathway discipline --list
npx fit-pathway job software_engineering J060
```

Guide requires a running service stack — see the
[getting started guide](websites/fit/docs/getting-started/engineers/index.md)
for setup.

## Learn More

- [Jobs To Be Done](JTBD.md) – The jobs users hire our products for
- [Documentation](websites/fit/docs/) — Getting started, guides, reference, and
  architecture internals
- [CONTRIBUTING.md](CONTRIBUTING.md) — Pull request workflow, git conventions,
  and quality commands
- [CLAUDE.md](CLAUDE.md) — Context for coding agents

## License

Apache-2.0
