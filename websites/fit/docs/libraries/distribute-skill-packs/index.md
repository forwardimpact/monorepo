---
title: Distribute Skill Packs
description: Stage a skill pack into APM's .apm/ layout so a bare install pulls skills and agents together. One command turns a source tree into an installable repository.
---

You have a set of skills and agent profiles you want a team to install. You
have also picked a package manager, APM, to distribute them. The layout is
where installs fail. If you put your skills in a root `skills/` directory,
the installer finds them. If you put your agents next to them in `agents/`,
the installer skips them. The installer never scans that path.

Agents must live under `.apm/agents/` with an `.agent.md` suffix. Skills must
live under `.apm/skills/`. If they do not, a bare install silently drops half
the pack.

`fit-pack` writes that layout for you. Point it at a source tree. It
stages skills, agents, and their shared references into a target repository.
It generates the manifest and a README. It leaves you a clean tree to commit
and push.

## Prerequisites

- Node.js 22+
- A **source tree** that holds the content to ship. It has a `skills/`
  directory with one subdirectory per skill. Each subdirectory has a
  `SKILL.md`. An optional `agents/` directory holds `*.md` agent profiles.
- A **target repository** checked out locally. This is the repository you
  publish the pack from. `fit-pack` writes into its working tree. It never
  commits or pushes.

You need no global install. Run the CLI through `npx`:

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
      x-<name>.md                  # only the shared files this pack cites (flat)
                                   # omitted entirely when the pack cites none
```

Two rules are load-bearing. If you get either one wrong, you hit the failure
this guide exists to prevent:

- **Skills live under `.apm/skills/`.** A bare `apm install <owner>/<repo>`
  walks that directory for `SKILL.md` files.
- **Agents live under `.apm/agents/` with the `.agent.md` suffix.** APM's agent
  discovery keys on that suffix. A plain `.md` file is invisible to the
  installer. An agent in a root `agents/` directory is invisible too.

## Stage the pack

Run `fit-pack stage` against your checked-out target repository:

```sh
npx fit-pack stage \
  --from .claude \
  --prefix fit \
  --into ./skills-repo \
  --name fit-skills \
  --pack-version 1.2.3 \
  --with-agents \
  --description "Agents and skills for the Forward Impact engineering standard" \
  --readme-title "Forward Impact Skills" \
  --readme-intro "Agents and skills for the Forward Impact engineering standard."
```

The options:

| Option           | Meaning                                                                             |
| ---------------- | ----------------------------------------------------------------------------------- |
| `--from`         | Source dir with `skills/` and `agents/` (default `.claude`)                         |
| `--prefix`       | Select which skills ship. Repeatable. `fit` selects `skills/fit` and `skills/fit-*` |
| `--all`          | Stage every skill under `--from`. It ignores `--prefix`                             |
| `--into`         | Working tree of the target repository to write into                                 |
| `--name`         | APM package name (the installed repository's short name)                            |
| `--pack-version` | Version stamped into `apm.yml` and each `SKILL.md`                                  |
| `--with-agents`  | Also stage agent profiles into `.apm/agents/`                                       |
| `--description`  | One-line description written into `apm.yml`                                         |
| `--readme-title` | README H1 (default: the `--name` value)                                             |
| `--readme-intro` | README intro paragraph                                                              |

You must always pass `--into`, `--name`, and `--pack-version`. You must also
select the skills. Pass `--prefix` one or more times, or pass `--all`. The
command exits with a usage error when you pass neither.

On success it reports what it staged. The count is the number of skills and
agents from your source tree that matched. It reflects the `--prefix` you chose
and whether you passed `--with-agents`:

```text
✓ Staged 17 skill(s), 8 agent(s), and 4 reference(s) into ./skills-repo
```

That line is an example. A `--prefix fit` source with seventeen `skills/fit-*`
directories and eight agent profiles reports those seventeen and eight. The
third count is the shared references the pack cites. Your numbers will differ.
The counts are your check that `fit-pack` selected the right set.

`--prefix` is how one source tree feeds several packs. With `--prefix fit`, only
`skills/fit` and `skills/fit-*` directories ship. A `skills/other-tool`
directory in the same source stays out. Pass `--prefix` again to add a second
family to the same pack.

Pass `--all` instead to ship every skill under
`--from`. Use `--all` when the source directory is itself the pack boundary.
Omit `--with-agents` for a skills-only pack. The shared `x-*.md` references
a skill cites still ship.

`fit-pack` ships a reference only when the pack cites it. It parses the
markdown links in every staged skill file and, with `--with-agents`, every
staged profile. It then follows links between references until the set is
closed. A reference that nothing in the pack links stays out. So a
skills-only pack carries no agent-only protocol files. A pack that cites no
reference and ships no profile gets no `.apm/agents/` directory at all.

`fit-pack` then checks its own work. It rereads the staged tree and looks for
every reference filename the tree names. A name that belongs to a reference
that did not ship stops the command with an error. A citation the parser
cannot read therefore fails the publish. It does not ship a broken link. Cite
a reference by a full URL when you want the pack to link it without carrying
it.

## Review what `fit-pack` wrote

`fit-pack` injects a `license` field and a `metadata` version block into every
staged `SKILL.md`. The installed skill then records the version it came from,
and you edit no source files:

```sh
head -8 ./skills-repo/.apm/skills/fit-map/SKILL.md
```

```text
---
name: fit-map
description: Define what good engineering means for every role
license: Apache-2.0
metadata:
  version: "1.2.3"
  author: forwardimpact
---
```

The generated `apm.yml` is a minimal, valid package manifest:

```yaml
name: fit-skills
version: 1.2.3
description: >-
  Agents and skills for the Forward Impact engineering standard
author: forwardimpact
license: Apache-2.0
includes: auto
```

`README.md` carries the install command and a table of everything in the pack. A
visitor to the repository sees how to install it and what they get.

## Publish the repository

`fit-pack` stops at the working tree. You own the commit:

```sh
cd ./skills-repo
git add -A
git commit -m "Publish pack v1.2.3"
git push
git tag v1.2.3 && git push origin v1.2.3
```

Consumers then install the whole pack, skills and agents together, with a single
command:

```sh
apm install <owner>/skills-repo
```

## Re-stage to update or migrate

Run `fit-pack stage` again to update a pack. It rewrites `.apm/`, the manifest,
and the README from the current source. It also
**retires any earlier flat layout**. In the same run it removes a root `skills/`
or `agents/` directory left over from a hand-built pack. So you migrate an
existing pack repository to the correct layout with a single `stage` and a
commit.

The output is deterministic, so an unchanged source produces an unchanged tree.
A re-run when nothing changed leaves `git status` clean. You only ever commit
real differences.

## Verify

You have reached the outcome of this guide when:

- `npx fit-pack stage` writes `.apm/skills/<name>/`, `apm.yml`, and
  `README.md` into your target repository. It writes
  `.apm/agents/<name>.agent.md` with `--with-agents`, and
  `.apm/agents/x-<name>.md` for each reference the pack cites.
- Each staged `SKILL.md` carries the injected `license` and `metadata.version`.
- `--prefix` selects only the skills that match, and `--with-agents` controls
  whether the command stages agent profiles.
- After you commit and push, `apm install <owner>/<repo>` installs both the
  skills and the agents.

## What's next

<div class="grid">

<!-- part:card:tarball-distribution -->

<!-- part:card:discovery-index -->

<!-- part:card:../integrate-standard -->

<!-- part:card:../typed-contracts -->

</div>
