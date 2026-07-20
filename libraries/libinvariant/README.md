# libinvariant

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Repository invariant checks — instruction-layer length caps, JTBD block
validation, and a declarative rule-module runner over a caller-supplied rules
directory.

<!-- END:description -->

## Getting Started

libinvariant is an import-only library: it ships no CLI. To run the checks,
hire the Jidoka product — `npx @forwardimpact/jidoka` or the installed
`jidoka` binary — which wires these handlers to a command surface.

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

The `checkInstructions` and `checkJtbd` handlers implement the contract
described in
[JIDOKA.md](https://github.com/forwardimpact/monorepo/blob/main/JIDOKA.md):

- `checkInstructions` — every layer (L1 CLAUDE.md, L2 CONTRIBUTING.md /
  JTBD.md, L3 agent profile, L4 agent reference, L5 SKILL.md, L6 skill
  reference, L7 checklist block) is gated by a line cap **and** a word cap.
  Either breach fails.
- `checkJtbd` — each `package.json .jobs` entry is validated against the JTBD
  schema; with `fix`, marker-delimited blocks in `<dir>/README.md`,
  `<dir>/<pkg>/README.md`, and root `JTBD.md` are regenerated.

## Invariants

`checkInvariants` is a generic host for a repository's own invariant checks.
It loads every `*.rules.mjs` module under the caller-supplied `rulesDir` and
runs each module's declarative rule catalogue through the shared rules
engine. The library carries no discovery default — the calling product or
script names the directory (the Jidoka CLI supplies `.jidoka/invariants`).
The policies stay in the repository; the library ships only the engine.

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

The engine binds a kit per run to the repo `root`, the module's own `dir`
(for co-located config), and the `runtime` bag (fs and ripgrep route through
it, so the engine carries no ambient dependencies). The module declares only
policy; the kit owns the mechanism:

- `scan({ dirs, match, skip?, under?, read? })` — collect files as
  `{ path, rel, text? }`; `under` restricts to the per-package `src`/`test`
  shape.
- `scanAst({ dirs, match, extract, locations?, … })` — read + parse each file
  and merge `extract(ast)`; a parse failure becomes `{ path, rel, parseError }`.
- `parse(src, path, opts?)`, `walk(ast, visit)` — the lower-level AST seam.
- `grep({ pattern | patterns, paths?, globs?, caseSensitive?, onlyMatching?,
  dedupe? })` — ripgrep matches as `{ path, lineNo, text, reason? }`, with
  per-entry `exclude` and built-in de-duplication.
- `restatementDrift({ entries, equal })` — the shared "single source restated
  across consumers" scan + compare (service URLs, scalar values).
- `enumDrift.build(registry)` / `enumDrift.seed(registry)` — the
  enumeration-drift engine: assert (or seed) that every consumer's fenced
  `<!-- enum:TOPIC:PROPERTY -->` block matches its source-of-truth set (an
  fs-glob or md-table probe). Pass a parsed topics registry (e.g.
  `config(topicsFile)`); pair with the rule kit's `enumDriftRules`.
- `readText`, `readJson`, `config(name, fallback?)` (co-located JSON/YAML),
  `listDir(path, { dirsOnly? })`.
- `lineAt(text, offset)`, `glob(pattern)`.

### The rule kit

When `rules` is a function it receives the rule helpers:

- `parseError(scope, { id?, hint? })` — fails any subject carrying a
  `parseError` (paired with `scanAst`).
- `failAll(scope, { id, message, hint?, when? })` — fails every subject in
  scope (the build step already decided each is a violation).
- `enumDriftRules` — the enumeration-drift rule set, paired with the build
  kit's `enumDrift` (expose via `rules: (kit) => kit.enumDriftRules`).

Findings render in the same ESLint-style format across the handlers
(`emitFindingsJson` for machine output); any finding fails the run.

## Documentation home

libinvariant shares the **Run a Predictable Platform** job goal with the
service-lifecycle libraries (librc, libsupervise, libtelemetry, libpreflight),
but its full guide home is the Jidoka standard at
<https://www.jidoka.team/> and [JIDOKA.md](../../JIDOKA.md), not the
service-lifecycle guide tree under `websites/fit/docs/libraries/`.

**Decision (2026-06-27):** this is deliberate scope separation, not a gap. The
invariant checks run at **authoring time** against a repository's instruction
layers and JTBD blocks; the service-lifecycle libraries run at **service
runtime** against a live process. Mixing the two into one guide would blur the
audience. The service-lifecycle Big Hire carries a one-line cross-link to the
Jidoka standard so a reader who lands there can find this check, and that is
the only link the service-lifecycle tree should carry. Future doc audits should
treat the absence of a service-lifecycle guide page for the invariant checks
as intended.
