---
name: monorepo-setup
description: >
  Stand up a new Monorepo-standard repository end to end. Bootstrap the
  skeleton, install the skill packs, run jidoka-setup then kata-setup, and
  fill the seams neither owns (root package.json, directory tree, agent
  profiles, CI, remote creation). Use when you create a Forward Impact-style
  repo from nothing, or when one exists but the cross-cutting wiring is
  missing.
---

# Set Up a Monorepo

Orchestrate a full repository bootstrap to the three standards: structure
([Monorepo](https://www.monorepo.team/)), instruction architecture (through the
`jidoka-setup` skill), and the agent team (through the `kata-setup` skill).

This skill owns only the **seams**. The seams are the order of operations and
the artifacts the two setup skills assume but never create. It does not restate
their procedures. When a sub-skill changes, follow it. This skill stays put.
Run it once per repository.

## When to Use

- You create a Forward Impact-style repository from nothing
- A repository exists but the cross-cutting wiring (root manifest, directory
  tree, agent profiles, CI, remote) is missing

## Checklists

<read_do_checklist goal="Confirm the ground before touching the repo">

- [ ] Confirm `gh auth status` shows access to the target owner. Confirm `apm`
      is on PATH.
- [ ] Confirm the target repo does not exist (`gh repo view <owner>/<name>`).
- [ ] Decide the name, the visibility, and the timezone before you generate
      anything.

</read_do_checklist>

<do_confirm_checklist goal="Verify the repo stands before handing off">

- [ ] Confirm git, the root `package.json`, and the Monorepo directory tree
      exist.
- [ ] Confirm `scripts/bootstrap.sh` exists and is executable (the `bootstrap`
      action runs it).
- [ ] Confirm both skill packs and the kata agent profiles are under
      `.claude/`.
- [ ] Confirm you invoked `jidoka-setup` and `kata-setup` as skills and ran
      each to completion. `CLAUDE.md`, `CONTRIBUTING.md`, `JTBD.md`,
      `.jidoka/`, and the agent workflows all exist.
- [ ] Confirm the check workflows exist (`check-quality`, `check-test`,
      `check-context`) and `jidoka` runs clean.
- [ ] Confirm the remote exists, the wiki is on, and `KATA_KILLSWITCH` is
      engaged.
- [ ] Confirm `.claude/settings.json` drives session bootstrap (curl
      `fit-install.sh`, then `scripts/bootstrap.sh`) and the wiki lifecycle.
      Confirm the wiki holds `Home.md`, `MEMORY.md`, and `STATUS.md`.
- [ ] Confirm `SETUP.md` lists the operator's remaining credential steps.

</do_confirm_checklist>

## Process

### Step 1: Bootstrap the skeleton

Run `git init` with default branch `main`. Then add the seam files from
[references/repo-skeleton.md](references/repo-skeleton.md): `.gitignore`,
`scripts/bootstrap.sh`, and the [Monorepo standard][monorepo] top-level
directories. Give each directory a `README.md` that names its jobs. The
`bootstrap` action runs `scripts/bootstrap.sh` in every Kata workflow. Without
it the workflows fail with `exit 127`. See [the Monorepo standard][monorepo]
for what each directory is for. Do not invent structure. Commit.

### Step 2: Add the root package.json

Create the root manifest from
[references/repo-skeleton.md](references/repo-skeleton.md). `jidoka-setup`
assumes this seam. It wires `jidoka` into the check task. It never creates the
manifest. The `jidoka` bin ships in the product package `@forwardimpact/jidoka`
(no bare launcher). So add that package as a devDependency (0.2.0+).

### Step 3: Install the skill packs

```sh
apm install forwardimpact/jidoka-skills forwardimpact/kata-skills --target claude
```

Both sub-skills assume their packs sit in `.claude/skills/`. APM integrates
skills only. Confirm the kata **agent profiles** also landed in
`.claude/agents/`. If they are missing, copy them from the kata-skills repo
(`agents/*.agent.md` → `.claude/agents/<name>.md`, with the flat
`agents/x-*.md` reference files).

The `apm.yml` this writes makes the packs reconstitutable.
`scripts/bootstrap.sh` runs `apm install` on every fresh environment (Step 1).
So you may commit `.claude/skills/` and `.claude/agents/`, or you may gitignore
them as build output. Either choice satisfies the run-time requirement that
they be present.

### Step 4: Invoke jidoka-setup, then kata-setup

These two upstream skills are the reason this orchestration exists. **Invoke
each one as a skill and run it to completion.** Do not read them for reference
and hand-roll their work. Do not move on while one is unfinished. This is a
hard gate. It is not a pointer. The most common failure of this step is to
treat "run jidoka-setup" as prose and to skip the actual skill invocation.

Invoke `jidoka-setup` first, then `kata-setup`. Order matters. The root
identity files must exist before the agent team references them. Each skill
owns its domain end to end. Follow it. Do not restate its steps here. Answer
their configuration prompts with the choices from the entry checklist.

Do not proceed to Step 5 until both skills finish. Confirm each skill left its
artifacts. `jidoka-setup` leaves `CLAUDE.md`, `CONTRIBUTING.md`, `JTBD.md`, and
`.jidoka/`. `kata-setup` leaves the agent workflows under `.github/workflows/`.
If an artifact is missing, the skill did not run. Invoke it before you continue.

### Step 5: Add the check CI

`jidoka-setup` wires `jidoka` into the check task. Add the check workflows that
run on push and pull request. They stay separate from the agent workflows
`kata-setup` generates. Use one workflow per concern. Never use a single
`check.yml`. Add at minimum `check-quality.yml`, `check-test.yml`, and
`check-context.yml`. SHA-pin every action. The templates are in
[references/check-workflows.md](references/check-workflows.md).

### Step 6: Create the remote, then seed and initialize the wiki

Run `gh repo create <owner>/<name> --source=. --push` at the chosen visibility.
Then enable the wiki and **pre-engage the killswitch**
(`gh variable set KATA_KILLSWITCH --body 1`). The agent workflows then stay
dormant until the operator finishes `kata-setup`'s App and secret steps. Those
credential-bound steps cannot run from here. Record them in an operator runbook
(`SETUP.md`).

Then stand up the agent team's memory. Add the `.claude/settings.json` session
hooks. SessionStart curls the pinned `fit-install.sh` release, then runs
`scripts/bootstrap.sh`. Stop pushes the wiki. Run `gemba-wiki init` on the
wiki. Seed the three named ledgers (`Home.md`, `MEMORY.md`, `STATUS.md`)
empty-but-scaffolded. Then run `gemba-wiki push`. The full sequence is in
[references/wiki-init.md](references/wiki-init.md).

### Step 7: Verify the composition

Run the check task. `jidoka` passes clean with the vendored packs and agent
profiles present. Confirm `gh workflow list` shows the generated workflows.
Confirm the wiki clones with its three ledgers through `gemba-wiki pull`.

## Documentation

- [Monorepo][monorepo] — repository structure and the JTBD convention.
- [Jidoka](https://www.jidoka.team/)
  — the layered instruction architecture (owned by `jidoka-setup`).
- [Kata Agent Team](https://www.kata.team/) — the
  agent team and its PDSA loop (owned by `kata-setup`).
- [APM](https://microsoft.github.io/apm/) — the package manager that installs
  the skill packs.

[monorepo]: https://www.monorepo.team/
