---
title: Enforce Your Repository's Own Invariants
description: Write a declarative rule module so the check fails on a forbidden import, a value that disagrees across two files, or a broken directory shape. The engine ships with the CLI. The policy stays in your repository.
---

`jidoka invariants` is a generic host. It discovers every `*.rules.mjs` file
under `.jidoka/invariants/`, runs each module's rules through one engine, and
reports the findings. The engine ships with the CLI. The policy stays in your
repository, so the line stops on a rule the standard knows nothing about.

This guide takes you from one such rule in your head to a module that fails
the build when somebody breaks it. It assumes you already run the checks.
[Stop the Line on Instruction Drift](/docs/stop-the-line/) covers that setup.

## Prerequisites

- Node.js 22+
- `npx @forwardimpact/jidoka` runs in your repository
- A `.jidoka/invariants/` directory
- `apm install forwardimpact/jidoka-skills` to author the module with an agent

## Step 1: State the invariant, then choose its subjects

Write the rule as a single claim the code must satisfy.

> Files under `src/` must not import `node:child_process`.

Apply one test first. Severity has a single useful value, and any finding fails
the run. So if the repository can ship with the rule broken, the rule is a
convention, and a convention belongs in an instruction layer. A claim that needs
an "and" states two invariants. Write two modules. Put the claim at the top of
each one as a comment, where a teammate reads it first when the check fails.

Then pick the **subjects**, the things the rule judges, and the **scope** that
holds them. A subject is a file, a manifest, a matched line, or one restatement
of a value. A scope is a label you invent, and each rule names exactly one. A
file subject reports once per file, a matched-line subject once per line.

## Step 2: Collect the subjects in `build`

`build(kit)` returns `{ subjects, ctx }`. `subjects` holds one array per scope.
`ctx` holds what the rules read later, such as a deny-list. The kit owns every
collector:

| Helper | Returns | Use it for |
| --- | --- | --- |
| `scan({ dirs, match, skip, under, read })` | `{ path, rel, text }` per file | file subjects |
| `scanAst({ ...scan, extract, locations })` | `{ path, rel }` plus your `extract(ast)` merge | import bans and syntax-level rules |
| `grep({ pattern, patterns, globs, caseSensitive, dedupe })` | `{ path, lineNo, text }` per match | a banned string, where every match is a violation |
| `restatementDrift({ entries, equal })` | one subject per restatement, each with `ok` | a value that must agree across files |
| `readText`, `readJson`, `config(name, fallback)` | text, object, co-located JSON or YAML | manifests and your own policy data |
| `listDir(path, { dirsOnly })` | entry names | a required directory shape |

Standing rules hold for every module. Never import the engine package, because
your module loads where that package does not resolve. Never read the filesystem
or spawn a subprocess, because the engine routes file access through its own
runtime. Import only `yaml`, `acorn`, or a sibling file. Return plain data.

Three details cost an hour each. `skip` takes directory **names**, and a glob
there matches nothing. `grep` is case-insensitive until `caseSensitive: true`.
A top-level `exclude` is ignored, so put it on a `patterns` entry instead.

The agreement shape needs no traversal. Give `restatementDrift` a `key`, the
`expected` value from the source file, and consumers as `{ path, pattern }`
pairs. Capture group one becomes `restated`, and `ok` holds the comparison.

## Step 3: Declare the rules

`rules` is a static array, or a `(ruleKit) => array` factory that pulls in the
helpers. Each rule object names an `id` that prints with the finding, its
`scope`, a `severity` of `"fail"`, an optional `when` guard, a `check`, a
`message`, and a `hint`.

`check(subject, ctx)` returns `null` when the subject is clean. It returns a
truthy item when the subject is in violation, and that item becomes the
finding. It returns an array of items to raise one finding per offending line.

Keep one concern per rule. Two failure modes on one scope are two rules with
two ids, and the ids make each finding attributable. Two helpers do most work:

- `parseError(scope)` fails any subject carrying a `parseError` string, which
  `scanAst` sets on a file it cannot parse. Include it in every AST-derived
  scope. Leave it out and a file with a syntax error passes in silence.
- `failAll(scope, { id, message, hint, when })` fails every subject in the
  scope. Use it when `build` already decided each subject is a violation, which
  holds for a `grep` match and for a drift subject you gate on `!s.ok`.

## Step 4: Make the finding name the file at fault

The finding takes `path` from the subject and `lineNo` from the item, falling
back to the subject. A subject with no `path` renders as `(no path)`, and your
teammate then searches the repository by hand for the offender. So carry the
location on the data. `scan` sets `path`, and you set it yourself on a subject
you assemble from a manifest or a directory listing. Get `lineNo` from
`locations: true` and `node.loc.start.line`, or from an offset through `lineAt`.

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
deny-list never diverges. `config` reads a file beside the module, so the rule
and its data land in one commit.

## Grandfather a migration, then shrink the list

Add a `seed` only when the invariant lands on existing violations:

```sh
npx @forwardimpact/jidoka invariants --seed no-child-process \
  > .jidoka/invariants/no-child-process.deny.yml
```

Keep the list monotone. Every pull request removes entries, and nothing adds
one. A deny-list that grows is an invariant nobody intends to reach.

## Run it

```sh
npx @forwardimpact/jidoka invariants   # add --json for machine output
```

The engine loads modules in filename order. A malformed default export stops
the run with `default export must be { name, build, rules }`, naming the file.

## Verify

You have reached the outcome of this guide when:

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
