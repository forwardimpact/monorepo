---
name: fit-pack
description: >
  Distribute a skill pack so agents and engineers can install it through their
  package manager. Use when publishing skills and agents to a shared repository,
  when a bare install pulls skills but silently drops agents, or when you need
  the install to land in APM's conventional layout. Stages skills, agents, and
  references into one repository tree with a generated manifest and README.
---

# Distribute Skill Packs

`fit-pack` stages a set of skills and agent profiles into a repository in the
layout package managers expect, then you commit and push that repository as the
installable pack. It exists so one tested code path owns the layout — the same
shape an installer reads, every time.

## When this matters

A pack repository whose skills sit in a root `skills/` directory installs its
skills fine, but agents placed in a sibling `agents/` directory install for
nobody: the installer never scans there. Agents must live under `.apm/agents/`
with an `.agent.md` suffix, and skills under `.apm/skills/`. `fit-pack` writes
exactly that layout so a bare `apm install <owner>/<repo>` pulls skills and
agents together.

## Layout it produces

Run `npx fit-pack stage` against a checked-out target repository:

```sh
npx fit-pack stage \
  --from .claude \
  --prefix <pack> \
  --into <target-repo> \
  --name <package-name> \
  --pack-version <version> \
  --with-agents \
  --description "<one line>" \
  --readme-title "<title>" \
  --readme-intro "<intro>"
```

It writes into `<target-repo>`:

- `.apm/skills/<name>/` — every `skills/<pack>-*` directory from `--from`, with
  `license` and a `metadata` version block injected into each `SKILL.md`.
- `.apm/agents/<name>.agent.md` — each `agents/*.md` profile, renamed to the
  `.agent.md` suffix the installer discovers (only with `--with-agents`).
- `.apm/agents/references/` — shared reference files that skills and profiles
  cite, shipped for every pack.
- `apm.yml` — the package manifest (`name`, `version`, `description`).
- `README.md` — install command and a table of the staged skills and agents.

## Sequence

1. **Check out the target repository** you publish the pack from. `fit-pack`
   writes into its working tree; it does not commit or push.
2. **Stage** with `npx fit-pack stage`. Pass `--prefix` to select which skills
   ship (`--prefix kata` selects `skills/kata-*`). Omit `--with-agents` for a
   skills-only pack; references still ship.
3. **Review** the generated `.apm/` tree, `apm.yml`, and `README.md`.
4. **Commit and push** the target repository, then tag the release.

Re-staging retires any earlier flat `skills/` or `agents/` layout, so migrating
an existing pack repository is a single run.

## Documentation

- [Distribute Skill Packs](https://www.forwardimpact.team/docs/libraries/distribute-skill-packs/index.md)
  — Stage a skill pack into APM's .apm/ layout so a bare install pulls skills
  and agents together
