---
title: Distribute Skill Packs
description: Stage a skill pack into APM's .apm/ layout so a bare install pulls skills and agents together — one command from a source tree to an installable repository.
---

You have a set of skills and agent profiles you want a team to install, and you
have picked a package manager — APM — to distribute them. The trap is the
layout: put your skills in a root `skills/` directory and the installer finds
them, but put your agents next to them in `agents/` and they install for
nobody. The installer never scans that path. Agents have to live under
`.apm/agents/` with an `.agent.md` suffix, and skills under `.apm/skills/`, or a
bare install silently drops half the pack. `fit-pack` writes that layout for
you. Point it at a source tree, and it stages skills, agents, and their shared
references into a target repository, generates the manifest and a README, and
leaves you a clean tree to commit and push.

## Prerequisites

- Node.js 18+
- A **source tree** holding the content to ship: a `skills/` directory with one
  subdirectory per skill (each containing a `SKILL.md`) and, optionally, an
  `agents/` directory of `*.md` agent profiles.
- A **target repository** checked out locally — the repository you publish the
  pack from. `fit-pack` writes into its working tree; it never commits or
  pushes.

No global install is needed; run the CLI through `npx`:

```sh
npx fit-pack --help
```

## Understand the layout it produces

APM discovers a package's primitives by directory convention. `fit-pack` writes
the canonical form into your target repository:

```text
<target>/
  apm.yml                          # package manifest
  README.md                        # install command + skill/agent tables
  .apm/
    skills/
      <skill-name>/SKILL.md        # one directory per skill
    agents/
      <agent-name>.agent.md        # one file per agent profile
      references/                  # shared files skills and agents cite
```

Two rules are load-bearing, and getting either wrong is the failure this guide
exists to prevent:

- **Skills live under `.apm/skills/`.** A bare `apm install <owner>/<repo>`
  walks that directory for `SKILL.md` files.
- **Agents live under `.apm/agents/` with the `.agent.md` suffix.** APM's agent
  discovery keys on that suffix. A plain `.md` file, or an agent placed in a
  root `agents/` directory, is invisible to the installer.

## Stage the pack

Run `fit-pack stage` against your checked-out target repository:

```sh
npx fit-pack stage \
  --from .claude \
  --prefix kata \
  --into ./skills-repo \
  --name kata-skills \
  --pack-version 1.2.3 \
  --with-agents \
  --description "Agents and skills for the Kata workflow" \
  --readme-title "Kata Skills" \
  --readme-intro "Agents and skills for the Kata workflow."
```

The options:

| Option           | Meaning                                                        |
| ---------------- | -------------------------------------------------------------- |
| `--from`         | Source dir holding `skills/` and `agents/` (default `.claude`) |
| `--prefix`       | Select which skills ship — `kata` selects `skills/kata-*`      |
| `--into`         | Target repository working tree to write into                   |
| `--name`         | APM package name (the installed repository's short name)       |
| `--pack-version` | Version stamped into `apm.yml` and each `SKILL.md`             |
| `--with-agents`  | Also stage agent profiles into `.apm/agents/`                  |
| `--description`  | One-line description written into `apm.yml`                    |
| `--readme-title` | README H1                                                      |
| `--readme-intro` | README intro paragraph                                         |

On success it reports what it staged:

```text
✓ Staged 12 skill(s) and 6 agent(s) into ./skills-repo
```

`--prefix` is how one source tree feeds several packs. With
`--prefix kata` only `skills/kata-*` directories ship; a `skills/fit-map`
directory in the same source is left out. Omit `--with-agents` for a
skills-only pack — the shared `references/` still ship, because skills cite them
too.

## Review what was written

`fit-pack` injects a `license` field and a `metadata` version block into every
staged `SKILL.md`, so the installed skill records the version it came from
without you editing source files:

```sh
head -8 ./skills-repo/.apm/skills/kata-review/SKILL.md
```

```text
---
name: kata-review
description: Grade a single artifact against quality criteria
license: Apache-2.0
metadata:
  version: "1.2.3"
  author: forwardimpact
---
```

The generated `apm.yml` is a minimal, valid package manifest:

```yaml
name: kata-skills
version: 1.2.3
description: >-
  Agents and skills for the Kata workflow
author: forwardimpact
license: Apache-2.0
includes: auto
```

And `README.md` carries the install command and a table of everything in the
pack, so a visitor to the repository sees how to install it and what they get.

## Publish the repository

`fit-pack` stops at the working tree. You own the commit:

```sh
cd ./skills-repo
git add -A
git commit -m "Publish pack v1.2.3"
git push
git tag v1.2.3 && git push origin v1.2.3
```

Consumers then install the whole pack — skills and agents together — with a
single command:

```sh
apm install <owner>/skills-repo
```

## Re-stage to update or migrate

Running `fit-pack stage` again is the update path. It rewrites `.apm/`, the
manifest, and the README from the current source, and it **retires any earlier
flat layout** — a root `skills/` or `agents/` directory left over from a hand-built
pack is removed in the same run. Migrating an existing pack repository to the
correct layout is therefore a single `stage` followed by a commit.

Because the output is deterministic, an unchanged source produces an unchanged
tree: re-running when nothing changed leaves `git status` clean, so you only
ever commit real differences.

## Verify

You have reached the outcome of this guide when:

- `npx fit-pack stage` writes `.apm/skills/<name>/`, `.apm/agents/<name>.agent.md`,
  `.apm/agents/references/`, `apm.yml`, and `README.md` into your target
  repository.
- Each staged `SKILL.md` carries the injected `license` and `metadata.version`.
- `--prefix` selects only the matching skills, and `--with-agents` controls
  whether agent profiles are staged.
- After you commit and push, `apm install <owner>/<repo>` installs both the
  skills and the agents.

## What's next

<div class="grid">

<!-- part:card:../integrate-standard -->

<!-- part:card:../prove-changes -->

</div>
