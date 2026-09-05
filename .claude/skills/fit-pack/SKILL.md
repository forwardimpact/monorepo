---
name: fit-pack
description: >
  Distribute a skill pack so agents and engineers can install it through their
  package manager. Use when you publish skills and agents to a shared
  repository. Use when a bare install pulls skills but silently drops agents.
  Use when you need the install to land in APM's conventional layout. It stages
  skills, agents, and references into one repository tree with a generated
  manifest and README.
---

# Distribute Skill Packs

`fit-pack` stages a set of skills and agent profiles into a repository. It uses
the layout package managers expect. You then commit and push that repository as
the installable pack. It exists so one tested code path owns the layout. An
installer reads the same shape every time.

## When this matters

A pack repository whose skills sit in a root `skills/` directory installs its
skills fine. But agents in a sibling `agents/` directory install for nobody.
The installer never scans there. Agents must live under `.apm/agents/` with an
`.agent.md` suffix. Skills must live under `.apm/skills/`. `fit-pack` writes
exactly that layout. A bare `apm install <owner>/<repo>` then pulls skills and
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

- `.apm/skills/<name>/` — every `skills/<pack>-*` directory from `--from`.
  `fit-pack` injects `license` and a `metadata` version block into each
  `SKILL.md`.
- `.apm/agents/<name>.agent.md` — each `agents/*.md` profile. `fit-pack`
  renames it to the `.agent.md` suffix the installer discovers. This happens
  only with `--with-agents`.
- `.apm/agents/x-<name>.md` — shared reference files that skills and profiles
  cite. `fit-pack` parses the links in every staged skill file. With
  `--with-agents` it also parses every staged profile. It follows links
  between references and ships only that set. They ship flat, with no
  `references/` subdir. A pack that cites none gets no `.apm/agents/` at all.
- `apm.yml` — the package manifest (`name`, `version`, `description`).
- `README.md` — install command and a table of the staged skills and agents.

## Sequence

1. **Check out the target repository** you publish the pack from. `fit-pack`
   writes into its working tree. It does not commit or push.
2. **Stage** with `npx fit-pack stage`. Pass `--prefix` to select which skills
   ship (`--prefix kata` selects `skills/kata-*`). Omit `--with-agents` for a
   skills-only pack. The references its skills cite still ship.
3. **Review** the generated `.apm/` tree, `apm.yml`, and `README.md`. The
   command fails when the staged tree names a reference that did not ship. A
   link shape it cannot read raises that error instead of publishing a broken
   link.
4. **Commit and push** the target repository. Then tag the release.

When you stage again, `fit-pack` retires any earlier flat `skills/` or
`agents/` layout. One run migrates an existing pack repository.

## Documentation

- [Distribute Skill Packs](https://www.forwardimpact.team/docs/libraries/distribute-skill-packs/index.md)
  — Stage a skill pack into APM's .apm/ layout so a bare install pulls skills
  and agents together
- [Build Tarball and Git-Repo Packs](https://www.forwardimpact.team/docs/libraries/distribute-skill-packs/tarball-distribution/index.md)
  — Build distributable packs as flat and APM tarballs and a static bare git
  repo, with byte-identical output across runs
- [Publish a Skill Discovery Index](https://www.forwardimpact.team/docs/libraries/distribute-skill-packs/discovery-index/index.md)
  — Emit a .well-known/skills/ discovery index so an agent can find and load
  skills over the web
