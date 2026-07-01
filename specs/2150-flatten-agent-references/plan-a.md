# Plan 2150-a: Flatten agent references into `.claude/agents/`

Executes [design-a](design-a.md) for [spec 2150](spec.md).

## Approach

Move the nine `.claude/agents/references/*.md` up to `.claude/agents/x-*.md`
and delete the subdir first, then repoint every citing surface to the flat
`x-` path, then switch the two directory readers (`libpack`, `libcoaligned`)
from a path test to the frontmatter classifier, and finally widen the
genericity invariant and add the `x-` convention guard. Steps run in order: the
file move (step 1) must land before the readers and the link sweep so the
`rg --hidden 'agents/references/'` oracle and the link existence checks can gate
the rest. The suite is green only at the end, not between steps.

Libraries used: libpack (skill-pack staging), libcoaligned (instruction-layer
model, invariant build kit).

**Deviation from design.** design-a § Genericity invariant widens the grep
selector to `.claude/agents/**`. As written that breaks the suite: the six
profiles carry legitimate internal-agent tooling the genericity patterns flag
(`release-engineer.md` `bun run check:fix`; `technical-writer.md`
`bunx fit-doc`, `websites/fit`). Profiles were never genericity-scanned and
making them pack-generic is outside spec 2150's scope. Step 7 therefore scopes
the grep to the relocated references (`.claude/agents/x-*.md`) — the faithful
1:1 replacement for the old `agents/references/**` glob — which satisfies
criterion 6 ("covers the relocated references"). The new `x-` convention guard
still scans **all** `.claude/agents/*.md`. Profile genericity is left to a
follow-up.

## Step 1 — Relocate and rename the nine references

Move each reference up one level with an `x-` prefix, delete the empty subdir,
and repoint the references' own cross-links.

Files (moved, `.claude/agents/references/<n>.md` → `.claude/agents/x-<n>.md`):
`approval-signals`, `auth-anomaly`, `carry-forward-clearance`,
`citation-integrity`, `coordination-protocol`, `memory-protocol`,
`self-improvement`, `work-definition`, `work-trackers`. The
`.claude/agents/references/` directory is deleted.

- `git mv` each file to the `x-`-prefixed flat path.
- Inside the moved files, every reference↔reference link is a bare relative
  `<n>.md` (with optional `#anchor`) — rewrite to `x-<n>.md`. Targets seen:
  `coordination-protocol`, `memory-protocol`, `work-definition`,
  `work-trackers`, `approval-signals`, `citation-integrity` (e.g.
  `work-trackers.md#the-matrix` → `x-work-trackers.md#the-matrix`).

Verify: `test ! -d .claude/agents/references`; `ls .claude/agents/x-*.md` lists
nine files;
`rg '\]\((approval-signals|auth-anomaly|carry-forward-clearance|citation-integrity|coordination-protocol|memory-protocol|self-improvement|work-definition|work-trackers)\.md' .claude/agents/x-*.md`
returns nothing (every internal cross-link now carries the `x-` prefix).

## Step 2 — Repoint the six agent profiles

Rewrite each profile's reference links to the flat sibling path, anchors kept.

Files (modified):
`.claude/agents/{improvement-coach,product-manager,release-engineer,security-engineer,staff-engineer,technical-writer}.md`.

- Root-relative form `.claude/agents/references/<n>.md#a` →
  `.claude/agents/x-<n>.md#a` (all six profiles; the on-boot `memory-protocol`
  link plus the `coordination-protocol`, `citation-integrity`, `auth-anomaly`,
  and `carry-forward-clearance` links).
- Relative form `references/<n>.md#a` → `x-<n>.md#a`
  (`security-engineer.md` and `technical-writer.md`, the `work-definition`
  link).

Verify: `rg 'agents/references/|](references/' .claude/agents/*.md` returns
nothing.

## Step 3 — Rewrite skill citations and structural prose

Drop the `references/` segment and add `x-` across every kata-\* and fit-\*
skill that cites an agent reference, in both link forms, and fix the two places
that describe the now-removed pack subdir.

Files (modified): every skill listed by `rg -l 'agents/references/'
.claude/skills/` — the kata-\* SKILL.md and `references/*.md` files,
`fit-wiki/SKILL.md`, and the two prose surfaces `fit-pack/SKILL.md` and
`monorepo-setup/SKILL.md`.

- GitHub-URL form
  `https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/<n>.md#a`
  → `…/.claude/agents/x-<n>.md#a`.
- Relative form from a SKILL.md (two levels up) `../../agents/references/<n>.md`
  → `../../agents/x-<n>.md`; from a skill `references/*.md` (three levels up)
  `../../../agents/references/<n>.md` → `../../../agents/x-<n>.md`.
- `fit-pack/SKILL.md`: the line describing `.apm/agents/references/` — rewrite
  to flat `x-`-prefixed reference files in `.apm/agents/` (no subdir).
- `monorepo-setup/SKILL.md`: the install-mapping line naming
  `agents/references/` — update to the flat layout.

Verify: `rg -l 'agents/references/' .claude/skills/` returns nothing.

## Step 4 — Update root docs, the published pack-layout page, and CI

Drop `agents/references/` wherever named outside immutable history.

Files (modified):

- `CLAUDE.md` (two links: `memory-protocol`, `coordination-protocol`).
- `CONTRIBUTING.md` (one link: `self-improvement`, the `fit-selfedit` line).
- `KATA.md` (five links: `work-definition`, `memory-protocol` ×2,
  `coordination-protocol`, `approval-signals`).
- `websites/fit/docs/libraries/distribute-skill-packs/index.md`: three places
  describe the now-removed pack subdir and are **not** caught by the
  `agents/references/` oracle (they say bare `references/`) — the directory-tree
  diagram (the `references/  # shared files skills and agents cite` line), the
  prose "the shared `references/` still ship", and the pack-layout list naming
  `.apm/agents/references/`. Rewrite all three to the flat `x-`-prefixed
  references in `.apm/agents/` (no subdir).
- `.github/workflows/publish-skills.yml`: delete the now-dead
  `".claude/agents/references/**"` path trigger — the relocated references are
  matched by the existing `".claude/agents/*.md"` line.
- `.github/workflows/kata-dispatch.yml`: the comment naming
  `.claude/agents/references/auth-anomaly.md` →
  `.claude/agents/x-auth-anomaly.md`.

Verify:
`rg --hidden 'agents/references/' --glob '!specs/**' --glob '!CHANGELOG.md' --glob '!.git/**'`
returns nothing across the repo;
`rg 'references/' websites/fit/docs/libraries/distribute-skill-packs/index.md`
names no agent-reference subdir.

## Step 5 — `libpack`: one frontmatter-partitioned staging pass

Fold reference staging into the agents pass so references ship flat for every
pack and profiles ship as `.agent.md` only when agents are synced.

Files (modified): `libraries/libpack/src/skill-pack.js`,
`libraries/libpack/test/skill-pack.integration.test.js`.

This corrects the design's libpack structure: design-a § libpack keeps
`#stageAgents` (gated on `withAgents`) and folds references into it, but that
pass only runs for the kata pack, so `fit-skills` / `coaligned-skills` /
`monorepo-skills` (all `sync-agents: "false"`) would stop shipping references —
the existing without-agents test guards exactly this. The pass must run
unconditionally; only the profile half is gated.

- In `publish()`, replace the two lines

  ```js
  const agents = opts.withAgents ? await this.#stageAgents(opts) : [];
  await this.#stageAgentReferences(opts);
  ```

  with one unconditional pass:
  `const agents = await this.#stageAgentDir(opts);`.
- `#stageAgentDir` reads each `agents/*.md` (the source is already flat), and
  for each file applies `isProfile` := `frontmatterField(content,"name")` and
  `frontmatterField(content,"description")` both non-empty:
  - reference (not a profile) → always `writeFile(<stem>.md)`; never in the
    returned agents array.
  - profile → only when `opts.withAgents`: write to
    `apmAgentFilename(stem)` (the `layout.js` helper, not a literal
    `.agent.md`) and push `{ name, description }` to the agents array; when
    `!withAgents`, skip it entirely (non-kata packs ship no profiles).
- Delete `#stageAgentReferences` and its `agents/references/` `cp`, and remove
  the now-unused private `#exists` (verified its sole caller is
  `#stageAgentReferences` at `skill-pack.js:139`).
- Tests: in the fixture, references are flat (`agents/<n>.md`, no `references/`
  subdir) and the profile fixture keeps its `name`/`description` frontmatter.
  Update the two existence assertions
  (`.apm/agents/references/memory.md` → `.apm/agents/memory.md`) in both the
  with-agents and without-agents tests. The with-agents test's
  `result.agents` assertion must still list only the profile — assert the flat
  reference (`memory`) is **absent** from `result.agents`, which the unified
  read newly surfaces. The without-agents test keeps asserting the reference
  ships and no `apmAgentFilename` profile does.

Verify: `bun test libraries/libpack/test/skill-pack.integration.test.js` green;
staged `.apm/agents/` has six `.agent.md` + nine `.md` and no `references/`
subdir.

## Step 6 — `libcoaligned`: partition one directory, keep both layers

Replace the `agents/references/` directory walk with a frontmatter split over
the same flat `agents/*.md` listing; budgets unchanged.

Files (modified): `libraries/libcoaligned/src/instructions.js`,
`libraries/libcoaligned/test/instructions.test.js`.

- Add an `isProfile(text)` predicate (frontmatter has both `name` and
  `description`). `findAgentProfiles` currently returns **all** `agents/*.md`;
  add the `isProfile` filter to it. Replace `findAgentReferences`'
  `agents/references` glob with the same `agents/*.md` listing filtered to
  `!isProfile`. Both finders read each file's text once; share the read.
- The two L4 layer entries select by the flat path: the `memory-protocol`
  override match changes from `/agents/references/memory-protocol.md` to
  `/agents/x-memory-protocol.md`; the default-L4 entry excludes that same path.
  Budgets (L3 72/448, L4 192/1280, memory-protocol 216/1588) are unchanged.
- Tests: the three fixtures keyed on `.claude/agents/references/...` move to the
  flat `.claude/agents/x-...` paths (`x-big.md`, `x-memory-protocol.md`). The
  partition tests today exercise only references; add a profile fixture
  (`.claude/agents/<name>.md` carrying `name`/`description` frontmatter) and
  assert the new `!isProfile` split keeps it out of the L4 reference set and in
  the L3 profile set — otherwise the new filter branch ships untested. The
  reference fixtures must carry no agent frontmatter.

Verify: `bun test libraries/libcoaligned/test/instructions.test.js` green;
`bunx coaligned instructions` passes against the flat layout.

## Step 7 — Genericity invariant: widen the glob, add the convention guard

Repoint the selector to the whole agents directory and add a guard that ties
the `x-` name to the frontmatter verdict.

Files (modified): `.coaligned/invariants/skill-genericity.rules.mjs`.

- In `build`, swap **only the agents entries** of the genericity grep selector,
  leaving the skills entries in place: `paths` stays `".claude/skills/"` and
  replaces `".claude/agents/references/"` with `".claude/agents/"`; `globs`
  stays `".claude/skills/kata-*/**"` and replaces
  `".claude/agents/references/**"` with `".claude/agents/x-*.md"` — the
  relocated references, the faithful replacement for the old glob (see §
  Deviation from design: `**` would flag legitimate internal tooling in the six
  profiles). Update the module's header comment accordingly.
- Add the convention guard as a second subject set via the build kit's
  `scan({ dirs: [".claude/agents"], match: (n) => n.endsWith(".md"), read: true })`
  — this scans **all** agents (profiles and references). Gate it with
  `failAll`'s `when` predicate (the kit supports `when`; the `check` itself
  fails every in-scope subject):
  `when: (s) => isProfile(s.text) === basename(s.path).startsWith("x-")`, where
  `isProfile` tests for both `name` and `description` frontmatter. The two
  conformant pairs (profile not named `x-*`; reference named `x-*`) make the two
  booleans differ, so equality is the violation — an `x-*` file with agent
  frontmatter, or a profile named `x-*`. Message names the offending file and
  which half broke.

Verify: `bun run invariants` passes against the flat layout; hand-introduce
(a) an `x-` file with `name:`/`description:` frontmatter and (b) a profile
renamed `x-foo.md` — each fails the new guard; revert.

## Step 8 — `COALIGNED.md` § L4

Record the new location and the frontmatter classifier; keep L4-vs-L6.

Files (modified): `COALIGNED.md`.

- § L4 — Agent Reference: change "Co-located in
  `.claude/agents/references/<name>.md`" to the flat
  `.claude/agents/x-<name>.md` and state that a `.claude/agents/*.md` file is a
  profile when it carries `name`/`description` frontmatter and a reference when
  it does not, with the `x-` prefix as the enforced naming convention. Leave the
  L4/L6 distinction and the budget table (L4 ≤192 lines) intact.

Verify: `bunx coaligned instructions` and `bun run lint:md` pass on
`COALIGNED.md`.

## Step 9 — Full-suite and parity verification

Run the gates the criteria name and the one manual install check CI cannot do.

- `bun run check` and `bun run test` green (criteria 4, 5, 6, 9).
- `rg --hidden 'agents/references/' --glob '!specs/**' --glob '!CHANGELOG.md'`
  returns nothing (criterion 3).
- `ls .claude/agents/` shows six unprefixed profiles and nine `x-*` references
  sorting last (criterion 8); every former reference resolves at its `x-` path
  (criterion 1).
- Install parity (criterion 2), manual — no `apm` in CI: stage the kata pack
  (`fit-pack stage --prefix kata --with-agents --from .claude --into <scratch>
  --name kata-skills --pack-version 0.0.0`), `apm install` the bundle into a
  scratch dir, and confirm the sorted basename set of its `.claude/agents/*.md`
  equals the monorepo's — fifteen files (six profiles + nine `x-` references).
  Record the result in the PR.

The changed packages (`libpack`, `libcoaligned`) carry no `CHANGELOG.md`, and
there is no repo-wide changelog; `kata-release-cut` records the version bump at
release time, so no changelog edit is part of this plan.

## Risks

- **The genericity grep must not scan the six profiles.** Two profiles carry
  internal tooling (`bun run check:fix`, `bunx fit-doc`, `websites/fit`) the
  patterns flag. Step 7 scopes the grep to `.claude/agents/x-*.md` (references
  only) for this reason — not `.claude/agents/**`. An implementer who restores
  the design's literal `**` glob breaks `bun run invariants`. The convention
  guard is the only agents-wide scan, and it applies no genericity pattern.
- **`isProfile` must be defined identically in three places** (libpack,
  libcoaligned, the invariant guard). They are separate codebases with no shared
  helper; a future drift between them re-opens the classifier gap. Mitigation:
  each uses the same two-field frontmatter test against the same Claude Code
  loader rule; the convention guard fails CI on any file where name and
  frontmatter disagree, catching the most likely drift symptom.
- **The without-agents staging path is the one that regresses silently.**
  References must keep shipping for `fit-skills`, `coaligned-skills`, and
  `monorepo-skills` (all `sync-agents: "false"`). The unified pass runs
  unconditionally for exactly this reason; the without-agents libpack test is
  the guard and must stay.

## Execution

Single engineering agent, steps in order — step 1 gates the link sweep and the
reader changes. Steps 5–7 are code with co-located tests; steps 2–4 and 8 are
mechanical link/prose edits. No parallel split: every step shares the same
files-must-be-moved-first dependency and the suite is verified once at the end.
Route the whole plan to `staff-engineer`.
