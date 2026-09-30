---
title: "Adopt Jidoka in Your Repository"
description: "Install the Jidoka skill pack, create the root instruction layers, add the checks to your check command and CI, then watch the line stop on a planted defect."
---

Your repository has prompt files that grew one at a time. One file repeats
another, and no one knows which file owns which rule. This page takes you to a
repository where every instruction is on one layer, and a check stops the line
when a layer drifts. The [home page](/) describes the layers themselves.

## Prerequisites

- Node.js 22+ and npm
- A git repository, and a check command you already run before commit
- Claude Code in your terminal
- The `apm` agent package manager
- ripgrep (`rg`) on your PATH, because the rules and the conventions both use
  it

## Install the pack

```sh
apm install forwardimpact/jidoka-skills
```

The install writes skills under `.claude/skills/`. One skill sets up the
architecture. The other skills author a layer, author jobs, author invariant
rules, and run the maintenance loop. The checks ship as a separate package.

## Install the CLI

```sh
npm install --save-dev @forwardimpact/jidoka
```

The package adds a `jidoka` binary to your local `node_modules/.bin`. This
means `npx jidoka` resolves to it in every command below, and so does an `npm`
script. A clean CI runner resolves it the same way from the lockfile. Nothing
depends on a global install.

## Decide the jobs shape first

The setup skill cannot make this decision for you. The way your repository is
packaged decides it.

| What your repository is                    | Jobs shape                |
| ------------------------------------------ | ------------------------- |
| One deployable, one library, or a monolith | A single static `JTBD.md` |
| Many packages, each with its own manifest  | Generated `.jobs` blocks  |

With a static file, you write the entries yourself. With generated blocks, the
check reads a `jobs` array from each manifest. If you are not sure, use the
static file.

## Run the setup skill

```sh
echo "Set up Jidoka" | claude
```

The skill starts with an entry gate. It looks for instruction layers that
already exist, because it repairs those in place and never overwrites them.
Answer the jobs-shape question with the decision you made above.

The skill then creates the root layers and the invariant directory:

| Artifact                   | Layer | What it holds                            | Cap       |
| -------------------------- | ----- | ---------------------------------------- | --------- |
| `CLAUDE.md`                | L1    | Project identity, and where things are   | 192 lines |
| `CONTRIBUTING.md`          | L2    | Contribution standards and policies      | 320 lines |
| `JTBD.md`                  | L2    | The jobs each persona needs the repo for | 320 lines |
| `.jidoka/invariants/*.mjs` | n/a   | Your repository's own declarative rules  | n/a       |

`CLAUDE.md` loads on every run, so its cap protects your context budget. It
gives orientation: what the repository is, who it serves, and which skill to
use for each task. `CONTRIBUTING.md` sets the rules: the invariants, the
quality commands, and the security policy. Do not repeat one file inside the
other. A rule with two homes drifts apart. For the directory shape around
these files, see the [Monorepo standard](https://www.monorepo.team/).

`CLAUDE.md` also has a Jobs and Checklists section. That section says where
the jobs are and how to find every pause point:

```sh
rg '<job '                  # Jobs To Be Done
rg '<read_do_checklist'     # entry gates — read each item, then do it
rg '<do_confirm_checklist'  # exit gates — do from memory, then confirm
```

Keep those tag names exactly as they are. Contributors, agents, and the checks
all search for them. A renamed tag hides a gate.

The setup also puts one starter rule into `.jidoka/invariants/`. It fails any
file that contains a leftover git merge-conflict marker. An empty invariant
directory enforces nothing, so the starter rule gives you a way to test the
wiring.

## Wire the checks

The bare command runs the layer check and the jobs check. Each check also runs
on its own:

```sh
npx jidoka                # layer caps and jobs
npx jidoka instructions   # layer length and checklist caps
npx jidoka jtbd --fix     # regenerate stale jobs blocks
npx jidoka invariants     # your own rule modules
```

Call them from the command your contributors already run:

```json
{
  "scripts": {
    "check": "npx jidoka && npx jidoka invariants"
  }
}
```

Then call `npm run check` from your CI job. Confirm that `rg` is available
there too. A clean runner has nothing on its PATH, so a `jidoka` that only
your own laptop can find fails on the first pull request. The local install
above lets `npx jidoka` run on that runner. Record the exact command in
`CONTRIBUTING.md`.

## Watch the line stop

Test the whole path. Plant one defect that the starter rule catches:

```sh
printf '%s HEAD\n' '<<<<<<<' >> notes.md
npm run check
```

The run fails. The finding shows the rule, the file, and the line number, and
its hint tells you to resolve the conflict. Delete `notes.md` and run the check
again. A real defect now stops the line before it can merge.

## Verify

- `CLAUDE.md`, `CONTRIBUTING.md`, and `JTBD.md` exist and fit inside their
  caps, and `CLAUDE.md` points at `JTBD.md` and the tagged checklists.
- `.jidoka/invariants/` contains a rule module, and `CONTRIBUTING.md` records
  both that directory and the command that runs it.
- The check passes from a clean checkout, with no global `jidoka` on your
  PATH.

## What's next

<div class="grid">

<!-- part:card:../layered-instructions -->
<!-- part:card:../layered-instructions/write-jobs -->
<!-- part:card:../stop-the-line -->
<!-- part:card:../stop-the-line/write-invariant-rules -->

</div>
