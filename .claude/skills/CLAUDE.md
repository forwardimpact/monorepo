# Skills

Conventions when working under `.claude/skills/`.

## Published vs internal

Skills prefixed `fit-*` and `kata-*` are published to external consumers via
skill packs. Internal skills (used only by the monorepo's own agents) have no
prefix convention.

## Generic by design

Published skills sync unchanged into consuming repositories that are not this
monorepo. Write every line for a repository you have never seen — one that
installed the skill pack yesterday.

### Keep instructions short

Spend lines only on **load-bearing structure**: sequencing, phase boundaries,
approval gates, checklists, and the invariants that keep the loop safe.
Everything a capable model already knows how to do — write code, read a diff,
search a codebase, phrase a comment — gets no instruction at all. Brevity is the
goal, not just a budget: a shorter skill leaves more room for the model's
pre-trained knowledge and judgment. Length caps are in COALIGNED.md § Length and
Loading.

### Strong opinions on structure only

Be prescriptive about WHAT order, WHICH boundary, WHO approves. Be open-ended
about HOW — do not prescribe tactics for ordinary engineering work.

### No monorepo leakage

- Do not name this monorepo's packages, services, sites, workflows, scopes, file
  paths, or data directories. Two exceptions: invoking `fit-*` / `kata-*` /
  `coaligned` CLIs bare (`gemba-wiki boot`, `gemba-xmr analyze` — never an `npx`
  or `bunx` prefix), and the surfaces every installation carries — CLAUDE.md,
  CONTRIBUTING.md, JTBD.md, KATA.md, `specs/`, `wiki/`, `websites/`.
- Write placeholder forms for anything repo-specific: `websites/<site>`,
  `@<scope>/<pkg>`, `<lockfile>`, `{YYYY}`, `repos/{owner}/{repo}`.
- Quality commands are repo-specific. Write "the repository's check / test /
  format command"; concrete invocations live in the consuming repo's
  CONTRIBUTING.md. Never `bun`, `bunx`, or `just` for repo tasks — those are
  internal-only (root CLAUDE.md § Distribution Model).
- Repo-local data (action inventories, agent rosters, coverage tables) is
  derived live with a command, never snapshotted into a reference file.
- Links that leave the skill folder use fully-qualified public URLs, except
  sibling `kata-*` skills, the pack-shipped agent profiles and references
  (`../../agents/*.md`), and the guaranteed surfaces above. `fit-*` skills ship
  in a separate pack — full URL. Never link this monorepo's issues or PRs:
  provenance rots, and the skill must stand on its own.
- `.coaligned/invariants/skill-genericity.rules.mjs` gates the mechanical
  subset of these rules in CI (`bun run invariants`). On a false positive,
  narrow the rule there — do not leave the flagged content in place.

### No incident-fitting

A workaround for one incident in this monorepo is not a skill instruction.
Before adding a rule, ask: would the failure it prevents occur in a fresh
installation? If not, fix the root cause, or move the rule to the layer that
owns it — agent profile, agent reference, the affected code's local CLAUDE.md,
or CONTRIBUTING.md. If yes, state the principle in one line; do not encode the
specific recovery procedure.

## House style

One template across every pack: descriptive Title Case H1, `## When to Use`,
`## Checklists` near the top, `## Process` with `### Step N: Title` headings,
`## Documentation` last where present. American spelling (`judgment`,
`labeled`); `behaviour` stays — it is the domain term. Point at shared
protocols, do not restate them: the Read Memory step and citation-integrity
mentions are one-sentence pointers to the owning agent reference.
`.coaligned/invariants/skill-template.rules.mjs` gates the mechanical subset
in CI; on a false positive, narrow the rule there.

### The litmus test

Every line must pass: _correct and useful in a repository that installed this
skill pack yesterday?_ A line that needs this monorepo to be true belongs
elsewhere or nowhere.

## `## Documentation` section

Every `fit-*` skill that has a matching CLI (`fit-<name>`) must end with a
`## Documentation` section listing guides as markdown links:

```markdown
## Documentation

- [Guide Title](https://www.forwardimpact.team/docs/<area>/<slug>/index.md) —
  One-sentence description
```

URLs are fully-qualified paths to the markdown source on
`www.forwardimpact.team`. Use the `.md` extension — agents fetch markdown more
reliably than rendered HTML.

## Parity with CLIs

The skill's `## Documentation` list and the CLI's `documentation` array (defined
in the libcli config) must carry **the same entries in the same order** — same
titles, same URLs. When you add, remove, or rename a link in one, update the
other in the same commit.

The CLI lives at:

- Products: `products/<name>/bin/fit-<name>.js`
- Libraries: `libraries/lib<name>/bin/fit-<name>.js`

See [libraries/CLAUDE.md](../../libraries/CLAUDE.md) and
[products/CLAUDE.md](../../products/CLAUDE.md) for the full linking rule, worked
examples, and the JTBD guide structure (Big Hire / Little Hire).
