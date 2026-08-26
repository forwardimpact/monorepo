---
title: "Adopt Jidoka in Your Repository"
description: "Install the Jidoka skill pack, lay out the root instruction layers, wire the checks into your check command and CI, then watch the line stop on a deliberate breach."
---

Your repository holds prompt files that grew one at a time. One file repeats
another, and nobody knows which one owns which rule. This page takes you to a
repository where every instruction sits on one layer, and a check stops the line
the moment a layer drifts. The [home page](/) covers the layers themselves.

## Prerequisites

- Node.js 22+ and npm
- A git repository, and a check command you already run before commit
- Claude Code in your terminal
- The `apm` agent package manager
- ripgrep (`rg`) on your PATH, which the rules and the conventions both call

## Install the pack

```sh
apm install forwardimpact/jidoka-skills
```

The install writes skills under `.claude/skills/`. One skill bootstraps the
architecture. The others author a layer, author jobs, author invariant rules,
and run the maintenance loop. The checks ship as a separate package.

## Decide the jobs shape first

The setup skill cannot decide this for you. Packaging decides it, not taste.

| What your repository is                    | Jobs shape                |
| ------------------------------------------ | ------------------------- |
| One deployable, one library, or a monolith | A single static `JTBD.md` |
| Many packages, each with its own manifest  | Generated `.jobs` blocks  |

You author a static file's entries yourself. Generated blocks instead read a
`jobs` array from each manifest. When unsure, take the static file.

## Run the setup skill

```sh
echo "Set up Jidoka" | claude
```

The skill opens with an entry gate. It looks for instruction layers that already
exist, because it repairs those in place and never overwrites them. Answer the
jobs-shape question with your decision above.

The skill then creates the root layers and the invariant directory:

| Artifact                   | Layer | What it holds                            | Cap       |
| -------------------------- | ----- | ---------------------------------------- | --------- |
| `CLAUDE.md`                | L1    | Project identity, and where things live  | 192 lines |
| `CONTRIBUTING.md`          | L2    | Contribution standards and policies      | 320 lines |
| `JTBD.md`                  | L2    | The jobs each persona hires the repo for | 320 lines |
| `.jidoka/invariants/*.mjs` | —     | Your repository's own declarative rules  | —         |

`CLAUDE.md` loads on every run, so its cap protects your context budget. It
orients. It names what the repository is, who it serves, and how to route to a
skill. `CONTRIBUTING.md` governs. It states the invariants, the quality
commands, and the security policy. The costly mistake is to restate one file
inside the other. The rule then has two homes that drift apart. For the
directory shape around them, see the
[Monorepo standard](https://www.monorepo.team/).

`CLAUDE.md` also carries a Jobs and Checklists section. That section names where
jobs live and how to find every pause point:

```sh
rg '<job '                  # Jobs To Be Done
rg '<read_do_checklist'     # entry gates — read each item, then do it
rg '<do_confirm_checklist'  # exit gates — do from memory, then confirm
```

Keep those tag names byte-for-byte. They are the discovery contract that
contributors, agents, and the checks rely on. A renamed tag hides a gate.

The setup also drops one starter rule into `.jidoka/invariants/`. It fails any
file that carries a leftover git merge-conflict marker. An empty invariant
directory enforces nothing, so the starter gives your wiring something to prove.

## Wire the checks

The bare command runs the layer and jobs checks. Each check also runs alone:

```sh
npx @forwardimpact/jidoka              # layer caps and jobs
npx @forwardimpact/jidoka instructions # layer length and checklist caps
npx @forwardimpact/jidoka jtbd --fix   # regenerate stale jobs blocks
npx @forwardimpact/jidoka invariants   # your own rule modules
```

Call them from the command your contributors already run:

```json
{
  "scripts": {
    "check": "npx @forwardimpact/jidoka && npx @forwardimpact/jidoka invariants"
  }
}
```

Then call `npm run check` from your CI job, and confirm that `rg` resolves
there too. A clean runner has nothing on its PATH. So a bare command that only
a provisioned laptop resolves fails on the first pull request. Record the
concrete invocation in `CONTRIBUTING.md`.

## Watch the line stop

Prove the path end to end. Plant one defect the starter rule catches:

```sh
printf '%s HEAD\n' '<<<<<<<' >> notes.md
npm run check
```

The run fails. The finding names the rule, the file, and the line number, and
its hint tells you to resolve the conflict. Delete `notes.md` and run the check
again. A real defect now stops the line before it can merge.

## Verify

- `CLAUDE.md`, `CONTRIBUTING.md`, and `JTBD.md` exist inside their caps, and
  `CLAUDE.md` points at `JTBD.md` and the tagged checklists.
- `.jidoka/invariants/` holds a rule module, and `CONTRIBUTING.md` names both
  that directory and the command that runs it.
- The check passes from a clean checkout, with no `jidoka` on your PATH.

## What's next

<div class="grid">

<!-- part:card:../layered-instructions -->
<!-- part:card:../layered-instructions/write-jobs -->
<!-- part:card:../stop-the-line -->
<!-- part:card:../stop-the-line/write-invariant-rules -->

</div>
