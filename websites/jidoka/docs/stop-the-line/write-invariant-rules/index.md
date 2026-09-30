---
title: Enforce Your Repository's Own Invariants
description: Write a declarative rule module so that the check fails on a forbidden import, a value that disagrees across two files, or a broken directory shape. The engine ships with the CLI, and the policy stays in your repository.
---

`jidoka invariants` is a generic host. It finds every `*.rules.mjs` file under
`.jidoka/invariants/`, runs each module's rules through one engine, and reports
the findings. The engine ships with the CLI, and the policy stays in your
repository. The line can therefore stop on a rule that the standard itself
knows nothing about.

This guide takes you from a rule in your head to a module that fails the build
when someone breaks the rule. It assumes you already run the checks.
[Stop the Line on Instruction Drift](/docs/stop-the-line/) covers that setup.

## Prerequisites

- Node.js 22+
- `@forwardimpact/jidoka` installed as a development dependency, so that
  `npx jidoka` runs in your repository
- A `.jidoka/invariants/` directory
- `apm install forwardimpact/jidoka-skills` to write the module with an agent

## Step 1: State the invariant, then choose its subjects

Write the rule as a single claim the code must satisfy.

> Files under `src/` must not import `node:child_process`.

Apply one test first. Severity has a single useful value, and any finding fails
the run. This means that if the repository can ship with the rule broken, the
rule is a convention, and a convention belongs in an instruction layer. A claim
that needs an "and" states two invariants, so write two modules. Put the claim
at the top of each module as a comment, because a teammate reads it first when
the check fails.

Then choose the **subjects**, the things the rule judges, and the **scope** that
groups them. A subject is a file, a manifest, a matched line, or one
restatement of a value, and a scope is a label you invent. Each rule refers to
exactly one scope. File subjects report once per file, and matched-line
subjects report once per line.

## Step 2: Collect the subjects in `build`

`build(kit)` returns `{ subjects, ctx }`. `subjects` contains one array per
scope. `ctx` contains what the rules read later, such as a deny-list. The kit
provides every collector:

| Helper | Returns | Use it for |
| --- | --- | --- |
| `scan({ dirs, match, skip, under, read })` | `{ path, rel, text }` per file | file subjects |
| `scanAst({ ...scan, extract, locations })` | `{ path, rel }` plus your `extract(ast)` merge | import bans and syntax-level rules |
| `grep({ pattern, patterns, globs, caseSensitive, dedupe })` | `{ path, lineNo, text }` per match | a banned string, where every match is a violation |
| `restatementDrift({ entries, equal })` | one subject per restatement, each with `ok` | a value that must agree across files |
| `readText`, `readJson`, `config(name, fallback)` | text, object, co-located JSON or YAML | manifests and your own policy data |
| `listDir(path, { dirsOnly })` | entry names | a required directory shape |

These rules apply to every module. Never import the engine package, because
your
module loads in places where that package is not available. Never read the
filesystem or spawn a subprocess, because the engine routes file access through
its own runtime. Import only `yaml`, `acorn`, or a sibling file, and return
plain data.

`skip` takes directory **names**, and a glob there matches nothing. `grep` is
case-insensitive until you set `caseSensitive: true`. The engine ignores a
top-level `exclude`, so put it on a `patterns` entry.

The agreement shape needs no traversal. Give `restatementDrift` a `key`, the
`expected` value from the source file, and the consumers as `{ path, pattern }`
pairs. Capture group one becomes `restated`, and `ok` contains the result of
the comparison.

## Step 3: Declare the rules

`rules` is a static array, or a `(ruleKit) => array` factory that uses the
helpers. Each rule object has an `id` that prints with the finding. It also has
a `scope`, a `severity` of `"fail"`, an optional `when` guard, a `check`, a
`message`, and a `hint`.

`check(subject, ctx)` returns `null` when the subject is clean. It returns a
truthy item when the subject is in violation, and that item becomes the
finding. It returns an array of items to raise one finding for each offending
line.

Keep one concern per rule. Two failure modes on one scope are two rules with
two ids, so that each finding points to one rule. Two helpers do most of the
work:

- `parseError(scope)` fails any subject that has a `parseError` string, which
  `scanAst` sets on a file it cannot parse. Include it in every AST-derived
  scope. If you leave it out, a file with a syntax error passes without a
  finding.
- `failAll(scope, { id, message, hint, when })` fails every subject in the
  scope. Use it when `build` already decided that each subject is a violation.
  That is true for a `grep` match and for a drift subject that you gate on
  `!s.ok`.

## Step 4: Make the finding show the file at fault

The finding takes `path` from the subject and `lineNo` from the item, or from
the subject when the item has none. A subject with no `path` renders as
`(no path)`, and your teammate then has to search the repository for the
offender. Put the location on the data. `scan` sets `path`, and you set it
yourself on a subject that you build from a manifest or a directory listing.
Get `lineNo` from `locations: true` and `node.loc.start.line`, or from an
offset through `lineAt`.

## A complete module

This module enforces the claim from step 1. It also grandfathers the files that
already violate it.

```js
// Invariant: files under src/ must not import node:child_process. Calls go
// through the shared runner. A monotone deny-list covers the migration.

import { stringify as stringifyYaml } from "yaml";

const BANNED = "node:child_process";
const violates = (s) => Boolean(s.lines?.length);

function importSites({ scanAst, walk }) {
  return scanAst({
    dirs: ["src", "packages"],
    skip: ["node_modules", "dist", "generated", "test"],
    match: (name) => name.endsWith(".js"),
    locations: true,
    extract: (ast) => {
      const lines = [];
      walk(ast, (n) => {
        if (n.type === "ImportDeclaration" && n.source?.value === BANNED)
          lines.push(n.loc.start.line);
      });
      return { lines };
    },
  });
}

export default {
  name: "no-child-process",

  build: (kit) => ({
    subjects: { "src-file": importSites(kit) },
    ctx: { deny: kit.config("no-child-process.deny.yml", { files: [] }) },
  }),

  seed: (kit) =>
    stringifyYaml({
      files: importSites(kit).filter(violates).map((s) => s.rel),
    }),

  rules: ({ parseError }) => [
    parseError("src-file"),
    {
      id: "no-child-process.import",
      scope: "src-file",
      severity: "fail",
      when: (s, ctx) => !s.parseError && !ctx.deny.files.includes(s.rel),
      check: (s) => (violates(s) ? s.lines.map((lineNo) => ({ lineNo })) : null),
      message: () => `imports "${BANNED}"`,
      hint: "call the shared runner, or list the file in no-child-process.deny.yml while you migrate",
    },
  ],
};
```

The collector is a named function, so `seed` and `build` share it and the
deny-list never drifts from the rule. `config` reads a file next to the module,
so the rule and its data go in one commit.

## Grandfather a migration, then shrink the list

Add a `seed` only when the invariant arrives in a codebase with existing
violations:

```sh
npx jidoka invariants --seed no-child-process \
  > .jidoka/invariants/no-child-process.deny.yml
```

The list must only shrink. Every pull request removes entries, and nothing adds
one. A deny-list that grows means an invariant that no one intends to reach.

## Run it

```sh
npx jidoka invariants   # add --json for machine output
```

The engine loads modules in filename order. A malformed default export stops
the run with the error `default export must be { name, build, rules }` and the
name of the file.

## Verify

This guide is complete when:

- The check passes on your clean branch, and a planted violation fails it with
  your `id`, your message, and the offending file and line.
- A planted syntax error in the same scope reports a parse error.
- Your repository's own check command runs `jidoka invariants`, so the line
  stops before a violation merges.

## What's next

<div class="grid">

<!-- part:card:.. -->

<!-- part:card:../../layered-instructions -->

<!-- part:card:../../getting-started -->

</div>
