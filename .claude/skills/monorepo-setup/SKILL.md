---
name: monorepo-setup
description: >
  Stand up a new Monorepo-standard repository end to end — bootstrap the
  skeleton, install the skill packs, run coaligned-setup then kata-setup, and
  fill the seams neither owns (root package.json, directory tree, agent
  profiles, CI, remote creation). Use when creating a Forward Impact-style repo
  from nothing, or when one exists but the cross-cutting wiring is missing.
---

# monorepo-setup

Orchestrate a full repository bootstrap to the three standards: structure
([Monorepo](https://www.monorepo.team/)),
instruction architecture (via the `coaligned-setup` skill), and the agent team
(via the `kata-setup` skill).

This skill owns only the **seams** — the order of operations and the artifacts
the two setup skills assume but never create. It does not restate their
procedures: when a sub-skill changes, follow it; this skill stays put. Run it
once per repository.

## Procedure

<read_do_checklist goal="Confirm the ground before touching the repo">

- [ ] `gh auth status` shows access to the target owner; `apm` is on PATH.
- [ ] The target repo does not exist yet (`gh repo view <owner>/<name>`).
- [ ] Decide name, visibility, and timezone before generating anything.

</read_do_checklist>

### Step 1 — Bootstrap the skeleton

`git init`, default branch `main`, then the seam files from
[references/repo-skeleton.md](references/repo-skeleton.md): `.gitignore`,
`scripts/bootstrap.sh` (the `bootstrap` action runs it in every Kata workflow —
without it they fail `exit 127`), and the [Monorepo standard][monorepo]
top-level directories, each with a `README.md` naming its jobs. See [the
Monorepo standard][monorepo] for what each directory is for — do not invent
structure. Commit.

### Step 2 — Add the root package.json

Create the root manifest from [references/repo-skeleton.md]. This is the seam
`coaligned-setup` assumes: it wires `npx coaligned` into the check task but
never creates the manifest. The `coaligned` bin ships only inside
`@forwardimpact/libcoaligned` (no bare launcher), so add it as a devDependency,
pinned to a release whose budgets exempt YAML frontmatter (0.1.15+) — otherwise
the published skill packs breach the instruction caps.

### Step 3 — Install the skill packs

```sh
apm install forwardimpact/coaligned-skills forwardimpact/kata-skills --target claude
```

Both sub-skills assume their packs sit in `.claude/skills/`. APM integrates
skills only — confirm the kata **agent profiles** also landed in
`.claude/agents/`. If missing, copy them from the kata-skills repo
(`agents/*.agent.md` → `.claude/agents/<name>.md`, with the flat
`agents/x-*.md` reference files).

The `apm.yml` this writes makes the packs reconstitutable:
`scripts/bootstrap.sh` runs `apm install` on every fresh environment (Step 1),
so you may commit `.claude/skills/` and `.claude/agents/` or gitignore them as
build output — either satisfies the run-time requirement that they be present.

### Step 4 — Invoke coaligned-setup, then kata-setup

These two upstream skills are the reason this orchestration exists. **Invoke
each one as a skill and run it to completion** — do not read them for reference
and hand-roll their work, and do not move on while one is unfinished. This is a
hard gate, not a pointer: the most common failure of this step is treating
"run coaligned-setup" as prose and skipping the actual skill invocation.

Invoke `coaligned-setup` first, then `kata-setup`. Order matters: the root
identity files must exist before the agent team references them. Each skill owns
its domain end to end — follow it, do not restate its steps here. Answer their
configuration prompts with the choices from the entry checklist.

Do not proceed to Step 5 until both have run. Confirm each left its artifacts:
`coaligned-setup` — `CLAUDE.md`, `CONTRIBUTING.md`, `JTBD.md`, and
`.coaligned/`; `kata-setup` — the agent workflows under `.github/workflows/`. If
an artifact is missing, the skill did not run — invoke it before continuing.

### Step 5 — Add the check CI

`coaligned-setup` wires `coaligned` into the check task; add the check workflows
that run on push and pull request — separate from the agent workflows
`kata-setup` generates. One workflow per concern, never a single `check.yml`: at
minimum `check-quality.yml`, `check-test.yml`, and `check-context.yml`. SHA-pin
every action. Templates in [references/check-workflows.md].

### Step 6 — Create the remote, then seed and initialize the wiki

`gh repo create <owner>/<name> --source=. --push` at the chosen visibility, then
enable the wiki and **pre-engage the killswitch** (`gh variable set
KATA_KILLSWITCH --body 1`) so the agent workflows stay dormant until the
operator finishes `kata-setup`'s App and secret steps. Those credential-bound
steps cannot run from here — record them in an operator runbook (`SETUP.md`).

Then stand up the agent team's memory: add the `.claude/settings.json` session
hooks (SessionStart curls the pinned `fit-install.sh` release, then runs
`scripts/bootstrap.sh`; Stop pushes the wiki), `fit-wiki init` the wiki, seed
the three named ledgers (`Home.md`, `MEMORY.md`, `STATUS.md`)
empty-but-scaffolded, and `fit-wiki push`. Full sequence in
[references/wiki-init.md].

### Step 7 — Verify the composition

Run the check task: `coaligned` passes clean with the vendored packs and agent
profiles present. Confirm `gh workflow list` shows the generated workflows, and
that the wiki clones with its three ledgers via `fit-wiki pull`.

## Done When

<do_confirm_checklist goal="Verify the repo stands before handing off">

- [ ] Git, the root `package.json`, and the Monorepo directory tree exist.
- [ ] `scripts/bootstrap.sh` exists and is executable (the `bootstrap` action
      runs it).
- [ ] Both skill packs and the kata agent profiles are under `.claude/`.
- [ ] `coaligned-setup` and `kata-setup` were each invoked as skills and ran to
      completion — `CLAUDE.md`, `CONTRIBUTING.md`, `JTBD.md`, `.coaligned/`, and
      the agent workflows all exist.
- [ ] The check workflows exist (`check-quality`, `check-test`, `check-context`)
      and `coaligned` runs clean.
- [ ] The remote exists, the wiki is on, and `KATA_KILLSWITCH` is engaged.
- [ ] `.claude/settings.json` drives session bootstrap (curl `fit-install.sh`,
      then `scripts/bootstrap.sh`) and the wiki lifecycle, and the wiki holds
      `Home.md`, `MEMORY.md`, and `STATUS.md`.
- [ ] `SETUP.md` lists the operator's remaining credential steps.

</do_confirm_checklist>

## Documentation

- [Monorepo][monorepo] — repository structure and the JTBD convention.
- [Co-Aligned](https://www.coaligned.team/)
  — the layered instruction architecture (owned by `coaligned-setup`).
- [Kata Agent Team](https://www.kata.team/) — the
  agent team and its PDSA loop (owned by `kata-setup`).
- [APM](https://microsoft.github.io/apm/) — the package manager that installs
  the skill packs.

[monorepo]: https://www.monorepo.team/
