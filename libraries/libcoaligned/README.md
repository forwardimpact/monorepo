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
  // Walk the repo and return plain subjects per scope (plus optional
  // shared ctx the rules read).
  build: async ({ root, runtime }) => ({
    subjects: { "src-file": [{ path, smells }] },
    ctx: { deny },
  }),
  // Declarative rules over those subjects.
  rules: [{ id, scope, severity, when, check, message, hint }],
  // Optional: text for `coaligned invariants --seed <name>` — e.g. a
  // regenerated grandfather deny-list.
  seed: async ({ root, runtime }) => "…",
};
```

Findings render in the same ESLint-style format as the other subcommands
(`--json` for machine output); any finding fails the run.
