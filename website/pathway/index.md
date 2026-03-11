---
title: Pathway
description: Navigate engineering skills and careers with clarity — browse career paths, generate agent teams, build progression plans.
layout: product
toc: false
hero:
  image: /assets/heros/pathway.svg
  alt: An engineer, an AI robot, and a business professional stand at the base of mountains, studying the trail ahead
  subtitle: Navigate engineering skills and careers with clarity. Whether you're an engineer exploring career progression, a manager building job descriptions, or a team lead deploying AI coding agents — Pathway delivers it through a web app, a CLI, and a static site generator.
  cta:
    - label: Documentation
      href: /docs/pathway/
    - label: View on npm
      href: https://www.npmjs.com/package/@forwardimpact/pathway
      secondary: true
---

> Pathway is your interface to the engineering framework. Feed it a discipline,
> a track, and a level — and it produces a complete job definition. Swap the
> level for a lifecycle stage and you get an agent profile instead. Same data,
> same formula, different outputs.

### What you get

- An interactive web app to explore roles, skills, and career paths
- A CLI for generating job descriptions and agent profiles
- VS Code Custom Agent profiles derived from your framework
- Agent skill files following the open Agent Skills Standard
- A static site export for publishing your career framework
- Interview question sets tailored to each role

---

### Who it's for

**Engineers** who want to understand where they are and where they're heading.
Browse skills, explore what's expected at the next level, and identify growth
areas.

**Managers** building job descriptions. Select a discipline, track, and level —
Pathway generates a complete, consistent job definition.

**Teams adopting AI agents.** Generate VS Code agent profiles and skill files
that match your engineering standards, constrained by lifecycle stage.

---

## The Web Application

The interactive browser gives you:

- **Job Builder** — Select discipline, track, and level to explore complete role
  definitions with skill matrices and behaviour profiles
- **Skill Browser** — View all skills with detailed level descriptions
- **Career Progression** — Compare levels side by side and see what changes
- **Interview Prep** — Generate role-specific question sets for hiring
- **Agent Preview** — See exactly what agent profiles will look like before
  deploying

---

## Quick Start

```sh
npx fit-pathway dev                                       # Launch web app
npx fit-pathway job software_engineering L3 --track=platform  # Job definition
npx fit-pathway agent software_engineering --track=platform   # Agent profiles
npx fit-pathway build --url=https://pathway.myorg.com         # Static site
```
