---
name: coaligned-invariant
description: >
  Author a declarative invariant rule module for `coaligned invariants`.
  Use when a repository needs to enforce its own architectural rule — a
  forbidden import, a value that must agree across files, a directory shape —
  as a `.coaligned/invariants/*.rules.mjs` module the CLI discovers and runs.
---

# Write Invariant Rules

`coaligned invariants` is a generic host. It finds every `*.rules.mjs`
under `.coaligned/invariants/`, runs each module's declarative rules through a
shared engine, and reports findings. The policy lives in the repository; the
CLI ships only the engine.

Write one module per invariant. A module never imports the engine — it loads
into consuming repos where the engine package is not resolvable. It
declares only policy; the injected kits own all mechanism.

## When to Use

- The repository needs to enforce an architectural rule of its own — a
  forbidden import, a value that must agree across files, a directory shape
- An existing rule module needs a new rule, a scope change, or a migration
  deny-list

## Checklists

<do_confirm_checklist goal="Verify the rule module is sound before committing">

- [ ] The module's top comment states the invariant in one sentence.
- [ ] `build` collects subjects through the kit only — no direct `fs` or
      subprocess access.
- [ ] Each rule reports on violation and returns `null` when clean.
- [ ] A grandfather `seed` exists only if the invariant landed on existing
      violations, and its deny-list is monotone.
- [ ] `coaligned invariants` fails on a planted violation and passes on
      clean code.

</do_confirm_checklist>

## Process

### Step 1: State the invariant in one sentence

Write the rule as a single claim the code must satisfy ("src files must not
import `node:child_process`", "the version literal must agree across the
manifest and the docs page"). If you cannot state it in one sentence, it is two
invariants — write two modules. Capture the sentence as the module's top
comment.

### Step 2: Choose the subjects

Subjects are the things the rule judges, grouped by **scope** (a label you
pick). Decide what one subject is — a file, a manifest, a matched line, a
cross-file agreement — and which scope name holds it. A module may declare
several scopes.

### Step 3: Write `build(kit)`

`build` receives the build kit and returns `{ subjects, ctx? }`. Use the kit to
collect subjects; never reach for `fs` or a subprocess directly. Return one
array per scope, plus optional `ctx` the rules read.

See [references/build-kit.md](references/build-kit.md) for the full kit, and
[references/example.md](references/example.md) for a `build` worked end to end.

### Step 4: Declare the rules

`rules` is a static array, or a `(ruleKit) => array` factory. Each rule names a
`scope`, a `severity`, an optional `when` guard, a `check` that returns a truthy
report on violation (else `null`), and a `message`/`hint`. The build step finds
candidates; the rules decide pass or fail.

See [references/rule-kit.md](references/rule-kit.md) for the rule shape and the
`parseError`/`failAll` helpers. A worked module is in
[references/example.md](references/example.md).

### Step 5: Add a `seed` only for migrations

When an invariant lands on a codebase with existing violations, grandfather
them: add an optional `seed(kit)` that prints a deny-list, store it as
co-located YAML, and have `build` read it via `kit.config`. Each migration PR
removes entries; the list is monotone, never added to. Refresh with
`coaligned invariants --seed <module-name>`.

### Step 6: Run it

Drop the module in `.coaligned/invariants/` and run:

```sh
coaligned invariants            # run every module
coaligned invariants --json     # machine output
coaligned invariants --seed <name>   # print a module's seed text
```

Any finding fails the run. Confirm the rule fires on a known violation and
passes on clean code before committing.

## Documentation

- [Co-Aligned Instruction Architecture Standard](https://github.com/forwardimpact/monorepo/blob/main/COALIGNED.md)
  — where invariants sit in the layered architecture.
- [libcoaligned README](https://github.com/forwardimpact/monorepo/blob/main/libraries/libcoaligned/README.md)
  — the build kit, the rule kit, and the module contract in full.
