# libcoaligned

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Co-Aligned architecture checks — enforce instruction-layer length caps and JTBD
invariants across the repo.

<!-- END:description -->

## Getting Started

```sh
npx coaligned                   # run every check (instructions + jtbd)
npx coaligned instructions      # enforce L1–L7 length and checklist caps
npx coaligned jtbd              # validate JTBD entries against package.json
npx coaligned jtbd --fix        # regenerate catalog and job blocks in place
```

The two subcommands implement the contract described in
[COALIGNED.md](https://github.com/forwardimpact/monorepo/blob/main/COALIGNED.md):

- `instructions` — every layer (L1 CLAUDE.md, L2 CONTRIBUTING.md / JTBD.md,
  L3 agent profile, L4 agent reference, L5 SKILL.md, L6 skill reference,
  L7 checklist block) is gated by a line cap **and** a word cap. Either breach
  fails.
- `jtbd` — each `package.json .jobs` entry is validated against the JTBD
  schema; with `--fix`, marker-delimited blocks in `<dir>/README.md`,
  `<dir>/<pkg>/README.md`, and root `JTBD.md` are regenerated.
