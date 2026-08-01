# libinvariant

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Repository invariant checks — instruction-layer length caps, JTBD block
validation, and a declarative rule-module runner over a caller-supplied rules
directory.

<!-- END:description -->

## Getting Started

libinvariant is an import-only library. It ships no CLI. To run the checks,
hire the Jidoka product. Use `npx @forwardimpact/jidoka` or the installed
`jidoka` binary. The product wires these handlers to a command surface.

```js
import {
  checkInstructions,
  checkJtbd,
  checkInvariants,
} from "@forwardimpact/libinvariant";

const findings = await checkInstructions({ root, runtime });
const { findings: jtbdFindings, stale } = await checkJtbd({ root, runtime });
const ruleFindings = await checkInvariants({
  root,
  rulesDir: ".jidoka/invariants",
  runtime,
});
```

The `checkInstructions` and `checkJtbd` handlers implement the contract that
[JIDOKA.md](https://github.com/forwardimpact/monorepo/blob/main/JIDOKA.md)
describes:

- `checkInstructions` — a line cap **and** a word cap gate every layer (L1
  CLAUDE.md, L2 CONTRIBUTING.md / JTBD.md, L3 agent profile, L4 agent
  reference, L5 SKILL.md, L6 skill reference, L7 checklist block). Either
  breach fails.
- `checkJtbd` — the handler validates each `package.json .jobs` entry against
  the JTBD schema. With `fix`, it regenerates the marker-delimited blocks in
  `<dir>/README.md`, `<dir>/<pkg>/README.md`, and root `JTBD.md`.

## Invariants

`checkInvariants` is a generic host for a repository's own invariant checks.
It loads every `*.rules.mjs` module under the caller-supplied `rulesDir`. It
runs each module's declarative rule catalogue through the shared rules
engine. The library carries no discovery default. The product or script that
calls it names the directory (the Jidoka CLI supplies `.jidoka/invariants`).
The policies stay in the repository. The library ships only the engine.

A rule module's default export is:

```js
export default {
  name: "ambient-deps",
  // `build` (and `seed`) receive the injected build kit; the module never
  // imports the engine (it loads into consuming repos via npx, where the
  // package is not resolvable from the rules directory). Return plain
  // subjects per scope, plus optional shared ctx the rules read.
  build: (kit) => ({
    subjects: { "src-file": kit.scanAst({ dirs, match, extract }) },
    ctx: { deny: kit.config("ambient-deps.deny.yml", {}) },
  }),
  // Declarative rules over those subjects: either a static array, or a
  // `(ruleKit) => array` factory that builds them from the rule helpers.
  rules: ({ parseError, failAll }) => [
    parseError("src-file"),
    { id, scope, severity, when, check, message, hint },
  ],
  // Optional: seed text (e.g. a regenerated grandfather deny-list) the
  // caller can print. Also receives the build kit.
  seed: (kit) => "…",
};
```

### The build kit

The engine binds a kit per run. The kit binds to the repo `root`, the
module's own `dir` (for co-located config), and the `runtime` bag. fs and
ripgrep route through the bag, so the engine carries no ambient dependencies.
The module declares only policy. The kit owns the mechanism:

- `scan({ dirs, match, skip?, under?, read? })` — collect files as
  `{ path, rel, text? }`. `under` restricts to the per-package `src`/`test`
  shape.
- `scanAst({ dirs, match, extract, locations?, … })` — read + parse each file
  and merge `extract(ast)`. A parse failure becomes `{ path, rel, parseError }`.
- `parse(src, path, opts?)`, `walk(ast, visit)` — the lower-level AST seam.
- `grep({ pattern | patterns, paths?, globs?, caseSensitive?, onlyMatching?,
  dedupe? })` — ripgrep matches as `{ path, lineNo, text, reason? }`, with
  per-entry `exclude` and built-in de-duplication.
- `restatementDrift({ entries, equal })` — the shared "single source restated
  across consumers" scan + compare (service URLs, scalar values).
- `enumDrift.build(registry)` / `enumDrift.seed(registry)` — the
  enumeration-drift engine. It asserts (or seeds) that every consumer's
  fenced `<!-- enum:TOPIC:PROPERTY -->` block matches its source-of-truth set
  (an fs-glob or md-table probe). Pass a parsed topics registry (e.g.
  `config(topicsFile)`). Pair it with the rule kit's `enumDriftRules`.
- `readText`, `readJson`, `config(name, fallback?)` (co-located JSON/YAML),
  `listDir(path, { dirsOnly? })`.
- `lineAt(text, offset)`, `glob(pattern)`.

### The rule kit

When `rules` is a function it receives the rule helpers:

- `parseError(scope, { id?, hint? })` — fails any subject that carries a
  `parseError` (pair it with `scanAst`).
- `failAll(scope, { id, message, hint?, when? })` — fails every subject in
  scope (the build step already decided each is a violation).
- `enumDriftRules` — the enumeration-drift rule set. Pair it with the build
  kit's `enumDrift` (expose it with `rules: (kit) => kit.enumDriftRules`).

Findings render in the same ESLint-style format across the handlers
(`emitFindingsJson` for machine output). Any finding fails the run.

## Documentation home

libinvariant shares the **Run a Predictable Platform** job goal with the
service-lifecycle libraries (librc, libsupervise, libtelemetry, libpreflight).
Its full guide home is the Jidoka standard at <https://www.jidoka.team/> and
[JIDOKA.md](../../JIDOKA.md). The service-lifecycle guide tree under
`websites/fit/docs/libraries/` is not its guide home.

**Decision (2026-06-27):** this scope separation is deliberate. It is not a
gap. The invariant checks run at **authoring time** against a repository's
instruction layers and JTBD blocks. The service-lifecycle libraries run at
**service runtime** against a live process. One guide for both would blur the
audience. The service-lifecycle Big Hire carries a one-line cross-link to the
Jidoka standard, so a reader who lands there can find this check. The
service-lifecycle tree carries no other link. In a future doc audit, treat the
absence of a service-lifecycle guide page for the invariant checks as
intended.
