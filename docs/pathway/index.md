---
title: Pathway
description: Career progression web app and CLI for exploring roles and generating agent teams.
---

## Purpose

Pathway is the primary interface for interacting with engineering competency
data. It provides tools for browsing career paths, generating job descriptions,
creating agent team profiles, and preparing interviews.

## Features

### Web Application

Interactive browser at http://localhost:3000:

- **Job Builder** — Select discipline, track, and grade to explore roles
- **Skill Browser** — View all skills with level descriptions
- **Career Progression** — Compare grades and identify growth areas
- **Interview Prep** — Generate role-specific question sets
- **Agent Preview** — Preview generated agent profiles

### CLI

Command-line access to all functionality:

```sh
npx fit-pathway dev                # Start web app
npx fit-pathway skill --list       # List all skills
npx fit-pathway job <d> <g>        # Generate job definition
npx fit-pathway agent <d>          # Generate agent profiles
```

### Agent Generation

Create VS Code Custom Agent profiles (`.agent.md`) and Agent Skills files
(`SKILL.md`):

```sh
npx fit-pathway agent <discipline> --track=<track> --output=./agents
```

### Static Site

Export everything as a static website:

```sh
npx fit-pathway build
```

## Related Documents

- [Agents](agents.md) — Agent profile generation and SKILL.md format
- [Reference](reference.md) — File organization, CLI, templates
