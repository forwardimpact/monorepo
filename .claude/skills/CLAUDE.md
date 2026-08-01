# Skills

Conventions when working under `.claude/skills/`.

## Published vs internal

Skill packs publish the `fit-*` and `kata-*` skills, the `gemba` product skill,
and the `gemba-*` capability skills to external consumers. Internal skills have
no prefix convention. Only the monorepo's own agents use them.

## Generic by design

Published skills sync unchanged into repositories that consume them and are not
this monorepo. Write every line for a repository you have never seen. That
repository installed the skill pack yesterday.

### Keep instructions short

Spend lines only on **load-bearing structure**: sequencing, phase boundaries,
approval gates, checklists, and the invariants that keep the loop safe. A
capable model already knows how to write code, read a diff, search a codebase,
and phrase a comment. Give it no instruction on any of that. Brevity is the
goal. A shorter skill leaves more room for the model's pre-trained knowledge and
judgment. Length caps are in JIDOKA.md § Length and Loading.

### Strong opinions on structure only

Be prescriptive about WHAT order, WHICH boundary, WHO approves. Be open-ended
about HOW. Do not prescribe tactics for ordinary engineering work.

### No monorepo leakage

- Do not name this monorepo's packages, services, sites, workflows, scopes, file
  paths, or data directories. Two exceptions apply. Invoke the `fit-*` /
  `gemba-*` / `kata-*` / `jidoka` CLIs bare (`gemba-wiki boot`,
  `gemba-xmr analyze`), never with an `npx` or `bunx` prefix. Name the surfaces
  every installation carries: CLAUDE.md, CONTRIBUTING.md, JTBD.md, KATA.md,
  `specs/`, `wiki/`, `websites/`.
- Write placeholder forms for anything repo-specific: `websites/<site>`,
  `@<scope>/<pkg>`, `<lockfile>`, `{YYYY}`, `repos/{owner}/{repo}`.
- Quality commands are repo-specific. Write "the repository's check / test /
  format command". Concrete invocations live in the CONTRIBUTING.md of the repo
  that consumes the pack. Never write `bun`, `bunx`, or `just` for repo tasks.
  Those are internal-only (root CLAUDE.md § Distribution Model).
- Derive repo-local data (action inventories, agent rosters, coverage tables)
  live with a command. Never snapshot it into a reference file.
- Links that leave the skill folder use fully-qualified public URLs, except
  sibling `kata-*` skills, the pack-shipped agent profiles and references
  (`../../agents/*.md`), and the guaranteed surfaces above. `fit-*` skills ship
  in a separate pack, so use a full URL. Never link this monorepo's issues or
  PRs. Provenance rots, and the skill must stand on its own.
- `.jidoka/invariants/skill-genericity.rules.mjs` gates the mechanical
  subset of these rules in CI (`bun run invariants`). On a false positive,
  narrow the rule there. Do not leave the flagged content in place.

### No incident-fitting

A workaround for one incident in this monorepo is not a skill instruction.
Before you add a rule, ask whether the failure it prevents would occur in a
fresh installation. If not, fix the root cause. You can also move the rule to
the layer that owns it: agent profile, agent reference, the affected code's
local CLAUDE.md, or CONTRIBUTING.md. If yes, state the principle in one line.
Do not encode the specific recovery procedure.

## House style

One template across every pack: descriptive Title Case H1, `## When to Use`,
`## Checklists` near the top, `## Process` with `### Step N: Title` headings,
`## Documentation` last where present. Use American spelling (`judgment`,
`labeled`). `behaviour` stays, because it is the domain term. Point at shared
protocols. Do not restate them. The Read Memory step and citation-integrity
mentions are one-sentence pointers to the owning agent reference.
`.jidoka/invariants/skill-template.rules.mjs` gates the mechanical subset
in CI. On a false positive, narrow the rule there.

### The litmus test

Every line must pass: _correct and useful in a repository that installed this
skill pack yesterday?_ A line that needs this monorepo to be true belongs
elsewhere or nowhere.

## `## Documentation` section

Every `fit-*` or `gemba-*` skill that has a matching CLI must end with a
`## Documentation` section. That section lists guides as markdown links:

```markdown
## Documentation

- [Guide Title](https://www.forwardimpact.team/docs/<area>/<slug>/index.md) —
  One-sentence description
```

URLs are fully-qualified paths to the markdown source on
`www.forwardimpact.team`. Use the `.md` extension. Agents fetch markdown more
reliably than rendered HTML.

## Parity with CLIs

The skill's `## Documentation` list and the CLI's `documentation` array (defined
in the libcli config) must carry **the same entries in the same order**. Use the
same titles and the same URLs. When you add, remove, or rename a link in one,
update the other in the same commit.

The CLI lives at:

- Products: `products/<name>/bin/fit-<name>.js`
- Platform: `products/gemba/bin/gemba-<name>.js`
- Libraries: `libraries/lib<name>/bin/fit-<name>.js`

See [libraries/CLAUDE.md](../../libraries/CLAUDE.md) and
[products/CLAUDE.md](../../products/CLAUDE.md) for the full rule on links,
worked examples, and the JTBD guide structure (Big Hire / Little Hire).
