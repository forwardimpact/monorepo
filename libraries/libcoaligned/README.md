# libcoaligned

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Co-Aligned architecture checks — enforce instruction-layer length caps, JTBD
invariants, and the repo's own declarative invariant rule modules.

<!-- END:description -->

## Getting Started

```sh
npx coaligned                   # run every check (instructions + jtbd)
npx coaligned instructions      # enforce L1–L7 length and checklist caps
npx coaligned jtbd              # validate JTBD entries against package.json
npx coaligned jtbd --fix        # regenerate catalog and job blocks in place
npx coaligned invariants        # run the repo's own rule modules
```

The `instructions` and `jtbd` subcommands implement the contract described in
[COALIGNED.md](https://github.com/forwardimpact/monorepo/blob/main/COALIGNED.md):

- `instructions` — every layer (L1 CLAUDE.md, L2 CONTRIBUTING.md / JTBD.md,
  L3 agent profile, L4 agent reference, L5 SKILL.md, L6 skill reference,
  L7 checklist block) is gated by a line cap **and** a word cap. Either breach
  fails.
- `jtbd` — each `package.json .jobs` entry is validated against the JTBD
  schema; with `--fix`, marker-delimited blocks in `<dir>/README.md`,
  `<dir>/<pkg>/README.md`, and root `JTBD.md` are regenerated.

## Invariants

`coaligned invariants` is a generic host for a repository's own invariant
checks. It resolves the project root (from any subdirectory), loads every
`*.rules.mjs` module under `.coaligned/invariants/`, and runs each module's
declarative rule catalogue through the shared rules engine. The policies stay
in the repository; the CLI ships only the engine.

A rule module's default export is:

```js
export default {
  name: "ambient-deps",
  // `build` (and `seed`) receive the injected build kit; the module never
  // imports the engine (it loads into consuming repos via npx, where the
  // package is not resolvable from `.coaligned/`). Return plain subjects per
  // scope, plus optional shared ctx the rules read.
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
  // Optional: text for `coaligned invariants --seed <name>` — e.g. a
  // regenerated grandfather deny-list. Also receives the build kit.
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

Findings render in the same ESLint-style format as the other subcommands
(`--json` for machine output); any finding fails the run.

## Documentation home

libcoaligned shares the **Run a Predictable Platform** job goal with the
service-lifecycle libraries (librc, libsupervise, libtelemetry, libpreflight),
but its full guide home is the Co-Aligned standard at
<https://www.coaligned.team/> and [COALIGNED.md](../../COALIGNED.md), not the
service-lifecycle guide tree under `websites/fit/docs/libraries/`.

**Decision (2026-06-27):** this is deliberate scope separation, not a gap. The
`coaligned` checks run at **authoring time** against a repository's instruction
layers and JTBD blocks; the service-lifecycle libraries run at **service
runtime** against a live process. Mixing the two into one guide would blur the
audience. The service-lifecycle Big Hire carries a one-line cross-link to the
Co-Aligned standard so a reader who lands there can find this check, and that is
the only link the service-lifecycle tree should carry. Future doc audits should
treat the absence of a service-lifecycle guide page for `coaligned` as intended.
