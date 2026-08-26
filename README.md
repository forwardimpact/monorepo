# Forward Impact Engineering

[![Context](https://github.com/forwardimpact/monorepo/actions/workflows/check-context.yml/badge.svg)](https://github.com/forwardimpact/monorepo/actions/workflows/check-context.yml)
[![Data](https://github.com/forwardimpact/monorepo/actions/workflows/check-data.yml/badge.svg)](https://github.com/forwardimpact/monorepo/actions/workflows/check-data.yml)
[![Quality](https://github.com/forwardimpact/monorepo/actions/workflows/check-quality.yml/badge.svg)](https://github.com/forwardimpact/monorepo/actions/workflows/check-quality.yml)
[![Test](https://github.com/forwardimpact/monorepo/actions/workflows/check-test.yml/badge.svg)](https://github.com/forwardimpact/monorepo/actions/workflows/check-test.yml)
[![Build](https://github.com/forwardimpact/monorepo/actions/workflows/check-build.yml/badge.svg)](https://github.com/forwardimpact/monorepo/actions/workflows/check-build.yml)
[![Security](https://github.com/forwardimpact/monorepo/actions/workflows/check-security.yml/badge.svg)](https://github.com/forwardimpact/monorepo/actions/workflows/check-security.yml)

## The Problem

Engineering organizations lack shared definitions of quality. Promotions stall
because managers can't point to what 'senior' means. Leaders staff teams on gut
feel. The only available metrics single out individuals. Engineers can't see
what their organization expects of them. Coding agents follow generic practices
instead of organizational standards.

## The Goal

> "The aim of leadership should be to improve the performance of [engineers] and
> [agents], to improve quality, to increase output, and simultaneously to bring
> pride of workmanship to people."
>
> — W. Edwards Deming

## Who Hires These Products

### Engineering Leaders

Define what good engineering looks like. Staff teams to succeed. Measure
outcomes and do not blame individuals.

| Job                             | Products |
| ------------------------------- | -------- |
| Define the Engineering Standard | Map      |
| Staff Teams to Succeed          | Summit   |
| Measure Engineering Outcomes    | Landmark |

### Empowered Engineers

Understand expectations. Find growth areas. Prepare for the day ahead. Equip
and trust your agent teams. Ground each of these in your organization's
agent-aligned engineering standard.

| Job                                       | Products |
| ----------------------------------------- | -------- |
| See What's Expected of Humans and Agents  | Pathway  |
| Get Judgment Grounded in the Standard     | Guide    |
| Be Prepared and Productive                | Outpost  |

## Quick Start

Install Pathway and Guide from npm. Then generate installation-specific service
code:

```sh
npm install @forwardimpact/pathway @forwardimpact/guide
npx fit-codegen generate --all
```

Browse your agent-aligned engineering standard:

```sh
npx fit-pathway discipline --list
npx fit-pathway job software-engineering J060
```

Guide needs a service stack that runs. See the
[getting started guide](websites/fit/docs/getting-started/engineers/index.md)
for setup.

## Public Sites

Five sites publish the products and the standards:

- [www.forwardimpact.team](https://www.forwardimpact.team) — Map, Pathway,
  Guide, Landmark, Summit, Outpost, and Gear
- [www.gemba.team](https://www.gemba.team) — Gemba, the agent-runtime platform
- [www.kata.team](https://www.kata.team) — Kata, the agent-team practice
- [www.jidoka.team](https://www.jidoka.team) — Jidoka, the
  instruction-architecture standard
- [www.monorepo.team](https://www.monorepo.team) — the Monorepo structure
  standard

## Learn More

- [Jobs To Be Done](JTBD.md) – The jobs users hire our products for
- [Documentation](websites/fit/docs/) — Getting started, guides, reference, and
  architecture internals
- [CONTRIBUTING.md](CONTRIBUTING.md) — Pull request workflow, git conventions,
  and quality commands
- [CLAUDE.md](CLAUDE.md) — Context for coding agents

## License

Apache-2.0
