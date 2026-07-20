# Plan 2260-a: Reframe Co-Aligned as the Jidoka product

Executes [design 2260-a](./design-a.md) for [spec 2260](./spec.md).

## Approach

Land the monorepo change as three sequential parts on one branch — Part 1 the
CLI and library axis (product package, moved bin, `libinvariant` rename with
the one signature change, `.jidoka/invariants/` move, launcher retirement,
distribution wiring), Part 2 the actions and CI axis (action move and publish,
`check-context` repoint, eval-lane rename), Part 3 the brand surfaces
(`JIDOKA.md`, website, five skills, pack repoint, catalogs and counts) —
merged as one PR so the clean break is atomic, then run Part 4, the
release-and-repin chain whose first step (sibling repo operations) executes
**before** the merge. The rename follows the spec-2110/2250 codemod method:
blanket replace of the token families with a keep-list, verified by scoped
`rg` gates, with golden fixtures regenerated from actual CLI output.

Libraries used: libinvariant (the renamed library's existing handlers —
`checkInstructions`, `checkJtbd`, the invariant kit — consumed by the moved
bin); no new library dependencies.

## 2250 interaction points, re-verified

Per the design, the shared surfaces are confirmed at their post-2250 homes:
installer at `products/gemba/actions/bootstrap/fit-install.sh` (`coaligned`
in `DEFAULT_TOOLS` L61, `is_gear_binary` L127); `public-cli-set.rules.mjs`
already gemba-aware with `PUBLISHED_NON_FIT_CLIS = ["coaligned"]` (L57);
the `CLAUDE.md` enum and `.github/CLAUDE.md` table carry six sibling actions
(source of truth: the `.github/CLAUDE.md` § Third-party actions table, per
`enumeration-drift.topics.yml`); `publish-actions.yml` carries six legs;
`publish-skills.yml` carries the `coaligned` leg versioned by
`libraries/libcoaligned/package.json`.

## Rename map and token-classification rule

| Old token                                   | New token                          |
| ------------------------------------------- | ---------------------------------- |
| `coaligned` (CLI, binary, launcher, action) | `jidoka`                           |
| `@forwardimpact/libcoaligned`, `libcoaligned` | `@forwardimpact/libinvariant`, `libinvariant` |
| `.coaligned/invariants`                     | `.jidoka/invariants`               |
| `COALIGNED.md`, "Co-Aligned" brand prose    | `JIDOKA.md`, "Jidoka"              |
| `coaligned-*` skill dirs and links          | `jidoka-*`                         |
| `coaligned-skills` (pack, repo, eval family) | `jidoka-skills`                    |
| `coaligned-check` (composite action)        | `jidoka` at `products/jidoka/actions/jidoka` |
| `www.coaligned.team`                        | `www.jidoka.team`                  |
| CSS classes `coaligned-{section,hero,section-cool}` | `jidoka-*` (index.md and main.css move together) |

**Keep** every match in: `specs/**`, `wiki/**`, `**/CHANGELOG.md` historical
entries, `.git/`, `node_modules/`. `bun.lock` regenerates via `bun install`
after the workspace rename — never hand-edited. Two post-merge remainders are
deliberate (spec SC4/SC5): the one-line downstream migration note in
`JIDOKA.md` and the pack README intro, naming `.coaligned/` and the old
names; and any workflow surface held for the release train (inventoried:
none carry the token — no `clis:` list names `coaligned`, and bootstrap pins
are opaque SHAs — so the expected workflow remainder set is empty).

**Published invocation rule:** the bare installed binary `jidoka`, or
`npx @forwardimpact/jidoka` where a clean runner needs registry resolution.
Never bare `npx jidoka`/`bunx jidoka` — that resolves the squatted
third-party `jidoka` npm package (spec § Deferred decisions).

## Codemod method

Each part blanket-replaces its assigned families across its whole surface;
the per-step tables are a verified inventory of exemplars and non-obvious
sites, not an allowlist. The completeness gate is each part's family-scoped
`rg` verify line — always line-level (`rg -n`, never `-l`), run with
`--hidden --no-ignore` and explicit `--glob` exclusions: `.rgignore` shields
`benchmarks/**` and `COALIGNED.md` from normal searches, and this rename
must reach both, so the gates never rely on it. Golden CLI fixtures are
regenerated via `scripts/capture-cli-golden.mjs`, never hand-edited. The
`.coaligned/invariants/` rule modules rename their own self-referential
tokens (paths, seed commands, skill-family regexes) in lockstep with the
directory move — a missed regex silently shrinks lint coverage, so Part 1
asserts the expected scanner behavior after the flip.

## Parts

| Part                        | Scope                                                                                                                                                                                          | Executor         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| [plan-a-01](./plan-a-01.md) | CLI + library axis: `products/jidoka/` package, moved bin, `libinvariant` rename and signature change, `.jidoka/invariants/` move and rule-module self-edits, launcher retirement, goldens, distribution wiring, root scripts | staff-engineer   |
| [plan-a-02](./plan-a-02.md) | Actions + CI axis: action move/rename/publish, `check-context.yml` repoint, `.github/CLAUDE.md` + enum refresh, eval lane rename                                                               | staff-engineer   |
| [plan-a-03](./plan-a-03.md) | Brand surfaces: `JIDOKA.md`, website, five skills + cross-reference codemod, pack repoint, catalogs and counts, final `rg` gate                                                                | staff-engineer   |
| [plan-a-04](./plan-a-04.md) | Release train: sibling ops (pre-merge), npm cuts, gear release, bootstrap re-tag, repin PR, deprecations, website cutover, follow-up scope note                                                | release-engineer |

## Execution

Parts 1–3 are strictly sequential commits on one branch
(`feat/2260-jidoka-reframe`), merged as **one PR** — the `public-cli-set`,
`skill-template`, and `skill-genericity` invariants couple the bin, the
skill dirs, and the scanner prefix lists, so the rename must reach `main`
atomically. Each part ends with `bun run context:fix`, then `bun run check`
and `bun run test` green. Part 4's step 4.0 (sibling repo rename + creation)
runs **before** the PR merges; the remaining steps run immediately after, by
`release-engineer`, same-day. No parts run in parallel. Part 3 stays with
`staff-engineer` despite its docs weight — its scanner regexes, pack leg,
and skill dirs must land in lockstep with Parts 1–2 on the one branch; PR
editorial review covers the `JIDOKA.md` and website reframes (spec
SC9/SC10).

## Risks

- **The rename window.** Between the merge and the Step 4.3 repin, the
  pinned bootstrap installs the `coaligned` binary while merged surfaces
  (check-context jobs, the renamed action) invoke `jidoka` — those jobs fail
  on PATH lookup. Mitigation is ordering, not aliasing: execute Part 4
  same-day; pause scheduled agent workflows if the window stretches (2250
  precedent).
- **Merge-triggered publishes need the siblings first.** The merge push
  fires `publish-skills.yml` (targeting `jidoka-skills`) and
  `publish-actions.yml` (targeting `jidoka`). Step 4.0 must complete before
  the merge or both legs fail; GitHub's rename redirect keeps the old pack
  name serving in the interim.
- **Pack version floor.** The renamed `jidoka-skills` sibling retains its
  `v0.1.x` tags and the pack publisher skips existing tags — seeding
  `products/jidoka/package.json` below `0.2.0` would make the first publish
  a silent no-op.
- **Silent registry fallback.** A missed `bunx coaligned`/`npx coaligned`
  resolves the deprecated launcher and runs stale code; a rewritten-but-bare
  `npx jidoka`/`bunx jidoka` resolves the squatted third-party package. The
  `rg` gates plus the new skill-lint pattern (Step 1.4) are the guard; run
  the gates exactly as written.
- **Scanner prefix lockstep.** `skill-template.rules.mjs` (`PACK_SKILL`,
  globs), `skill-genericity.rules.mjs` (npx and website patterns), and
  `public-cli-set.rules.mjs` (`PUBLISHED_NON_FIT_CLIS`) all hardcode the old
  tokens. Flipping the skill dirs (Part 3) without the Part 1 rule edits —
  or vice versa across an aborted rebase — silently un-scans the renamed
  skills; the parts land on one branch precisely so CI sees them together.
- **Goldens previously had no automated consumer.** `test/golden/coaligned/`
  (5 cases, 10 snapshot files + `cases.json`) is consumed only by the
  capture script's conventions today; Step 1.8 regenerates it and wires a
  spawn-replay test in the product so a stale snapshot fails CI from now on.
- **`publish-npm.yml` inline check.** Its build-kit import and rules path
  flip in Part 1; a tag cut between merge and any missed edit would fail the
  publish loudly (import error), not silently — acceptable, but keep the
  edit in the same commit as the directory move.
