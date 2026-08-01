---
name: jidoka-setup
description: >
  Bootstrap the Jidoka instruction architecture in a repository. Use when a
  repo has no layered agent instructions yet. Use when you adopt the Jidoka
  standard. Use when you wire the `jidoka` checks into the repository. The
  line then stops the moment a layer drifts, a job goes stale, or an invariant
  breaks.
---

# Set Up the Jidoka Architecture

Stand up the
[Jidoka](https://www.jidoka.team/)
instruction architecture in a repository. It holds the root identity and jobs
files, the invariant directory, and the `jidoka` checks. The checks stop the
line the moment any of them drifts.

Run this once per repository. For later work use the sibling skills:
[jidoka-layer](../jidoka-layer/SKILL.md) for instruction layers,
[jidoka-jtbd](../jidoka-jtbd/SKILL.md) for jobs,
[jidoka-invariant](../jidoka-invariant/SKILL.md) for custom rules, and
[jidoka-audit](../jidoka-audit/SKILL.md) for the maintenance loop.

## When to Use

- A repository has no layered agent instructions yet
- You adopt the Jidoka standard in an existing repository
- You wire the `jidoka` checks into a repository's check command and CI

## Checklists

<read_do_checklist goal="Internalize the architecture before scaffolding">

- [ ] Confirm the eight layers and their one-job-each separation are clear.
- [ ] Confirm no instruction layers exist yet. If some do, repair them with
      jidoka-layer and do not overwrite them.
- [ ] Decide the jobs structure (see Step 1) before you create JTBD.md.

</read_do_checklist>

<do_confirm_checklist goal="Verify the architecture stands before committing">

- [ ] `CLAUDE.md`, `CONTRIBUTING.md`, and `JTBD.md` exist and stay within
      their caps.
- [ ] `CLAUDE.md` carries a Jobs and Checklists section that points at JTBD.md
      and the tagged pause-point checklists.
- [ ] `.jidoka/invariants/` holds the `no-conflict-markers` starter rule, and
      CONTRIBUTING.md points at the invariants tooling so contributors can find
      and add rules.
- [ ] The repository's check command and CI both call the check through an
      invocation a clean runner resolves. CONTRIBUTING.md records the concrete
      command.
- [ ] The wired check passes from a clean checkout. It does not depend on a
      binary already installed on `PATH`.

</do_confirm_checklist>

## Process

### Step 1: Decide the jobs structure

The jobs layer (L2) has two shapes. Pick by how the repo is packaged. Do not
pick by preference.

- **Single static `JTBD.md`** — the repo is one unit (one deployable, one
  library, a monolith). Author Big Hire entries directly in `JTBD.md`. Nothing
  generates them.
- **Generated `.jobs` blocks** — the repo is genuinely many packages, each
  with its own `package.json`. Each package declares `jobs` in its manifest.
  `jidoka jtbd --fix` generates the catalog and job blocks into the
  README and root `JTBD.md`.

When in doubt, choose the static file. It has fewer moving parts. See
[references/structure-decision.md](references/structure-decision.md).

### Step 2: Create the root layers (L1, L2)

Create the auto-loaded identity and on-demand standards files. Keep each within
its cap (L1 ≤ 192 lines; L2 ≤ 320 lines).

- **`CLAUDE.md`** (L1) — project identity: what the repo is, who it serves,
  where things live, and how to route to skills. It orients. It does not
  prescribe a procedure. The L1 property is that it surfaces the discovery
  conventions. So include a brief **Jobs and Checklists** section. That section
  names where jobs live and how `rg` finds jobs and checklists. Copy the
  starter and adapt its first line to the jobs shape from Step 1:

  ```sh
  cat .claude/skills/jidoka-setup/assets/jobs-and-checklists.md
  ```

  Keep the tag names verbatim. They are the discovery contract contributors
  and the `jidoka` checks rely on.
- **`CONTRIBUTING.md`** (L2) — contribution standards: the architectural
  invariants, the quality commands, security policy, and the universal
  checklists.
- **`JTBD.md`** (L2) — the jobs, per Step 1. Use jidoka-jtbd to author
  entries to spec.

Do not restate one file in another. CLAUDE.md orients. CONTRIBUTING.md governs.

### Step 3: Create the invariant directory

Create `.jidoka/invariants/` and seed it with the starter rule. The repo's own
declarative checks live in that directory. `jidoka invariants` discovers
every `*.rules.mjs` under it. An empty directory enforces nothing, so the wired
check has nothing to prove.

Copy the bundled starter rule verbatim so every new repo begins with one live
invariant:

```sh
cp .claude/skills/jidoka-setup/assets/no-conflict-markers.rules.mjs \
   .jidoka/invariants/
```

[`no-conflict-markers`](assets/no-conflict-markers.rules.mjs) fails any tracked
file that carries a leftover git merge-conflict marker. It is generic by
design. It is language-agnostic and needs no configuration. It fires only on an
unambiguous defect. So it holds from the first commit in any repository that
uses it. It also proves the pipeline end to end. The check discovers the
directory, a module loads, and a planted marker fails the check.

Add repo-specific rules on top with
[jidoka-invariant](../jidoka-invariant/SKILL.md). Keep or remove the
starter once the repo has invariants of its own.

Point CONTRIBUTING.md at this layer so contributors can find and extend it.
Name where the rules live (`.jidoka/invariants/*.rules.mjs`). Name the `jidoka
invariants` command that runs them. Point at
[jidoka-invariant](../jidoka-invariant/SKILL.md) for how to author a rule.
This is the invariant *tooling*. It is distinct from the architectural
non-negotiables CONTRIBUTING.md already states in prose.

### Step 4: Wire the checks into the repository

Wire the check into the repository's check command and CI so the check enforces
every layer, job, and invariant before merge. The CLI exposes four entry points:

```text
jidoka                # instructions + jtbd (and invariants if present)
jidoka instructions   # layer length and checklist caps only
jidoka jtbd --fix     # regenerate stale catalog and job blocks
jidoka invariants     # the repo's own rule modules
```

Invoke it through an entry point the run environment can resolve. A clean CI
runner has nothing on `PATH`. It has no workspace to resolve a bare `jidoka`
against. So wire the registry-resolvable form. That form is the published CLI
package `@forwardimpact/jidoka`, run through the repository's package manager.
Record that concrete command in CONTRIBUTING.md. Use the same command in the
lint/check task and the CI job. Never use one that only resolves on a
contributor's pre-provisioned machine.

### Step 5: Verify the bootstrap

Verify the wired check the way CI runs it, from a clean dependency resolution. A
`jidoka` already on your `PATH` masks an invocation that cannot resolve on a
fresh runner. So confirm the repository's check command passes on a clean
checkout. Your own shell is not enough. A clean run means the layers fit their
caps and the jobs validate. Fix any finding before you commit. Route each
finding by subcommand the same way
[jidoka-audit](../jidoka-audit/SKILL.md) does.

## Documentation

- [Jidoka Instruction Architecture Standard](https://github.com/forwardimpact/monorepo/blob/main/JIDOKA.md)
  — the eight layers, their caps, and the rules that separate them.
- [Jidoka website](https://www.jidoka.team/)
  — the standard's story: built-in quality, stop the line.
