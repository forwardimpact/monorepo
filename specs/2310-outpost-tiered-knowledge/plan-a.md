# Plan 2310-a: Outpost Tiered Knowledge

Executes [design-a.md](design-a.md) for [spec 2310](spec.md). This is the
first plan variant. It decomposes into seven parts because the change spans
one new code module, two changed code modules, more than forty template
files, four documentation pages, and a major release.

## Approach

Build bottom-up. Part 1 delivers the pure validator module with its full
test suite, because every other surface names its findings. Part 2 wires the
CLI and the init/update lifecycle to the module. Part 3 rewrites the
canonical instruction surfaces (template CLAUDE.md, the registry file, and
MIGRATION.md), because parts 4 and 5 point at that text. Parts 4 and 5
rewrite the agent profiles and the skill set against the part-3 vocabulary.
Part 6 rewrites the docs and the published skill. Part 7 adds the
convergence fixture test and runs the repository-wide gates. The release cut
happens after merge through `kata-release-cut` and is not a diff step.

Libraries used: libcli (definition, dispatch), libtelemetry (logger),
libmock (test runtimes), libutil (runtime bag), yaml (new external
dependency: frontmatter and registry parsing).

## Names this plan fixes

The design leaves these concrete names and locations open. Every part uses
these values.

| Item | Value |
| ---- | ----- |
| Validator module | `products/outpost/src/kb-validator.js`; tests in `products/outpost/test/kb-validator.test.js` |
| Registry file | `registry.yaml` at the KB root; template at `products/outpost/templates/registry.yaml` |
| Baseline file | `validation-baseline.json` at the KB root; no template (the migration creates it) |
| Draft-status ledgers | `~/.cache/fit/outpost/drafts/handled` and `~/.cache/fit/outpost/drafts/ignored` |
| Per-tier changelog | `<N>-<Label>/CHANGELOG.md` in each shared tier (rank 1 and up); none in `0-Draft/` |

The ledgers move to a sibling of `state/`, never into it:
`~/.cache/fit/outpost/state/` is a daemon-owned trust root
(`products/outpost/CLAUDE.md` § Trust Boundary) and the template settings
deny agent writes there. The `drafts/` sibling sits inside the allow-listed
cache root, so agent-run skills can maintain the ledgers and the trust
boundary stays untouched per the spec's exclusion.

Neither `registry.yaml` nor `validation-baseline.json` matches the rank
grammar, so both are personal surfaces by the root rule.

## Part index

| Part | Delivers | Depends on | Success criteria |
| ---- | -------- | ---------- | ---------------- |
| [01](plan-a-01.md) | `kb-validator.js` module + unit tests + `yaml` dependency | — | 5, 6, 7, 8, 9, 19, 20 |
| [02](plan-a-02.md) | CLI `validate [path]` + `--json`, golden fixtures, `kb-manager` init/update, tests | 01 | 1, 10 (install half), 17 (install half) |
| [03](plan-a-03.md) | Template CLAUDE.md, `registry.yaml`, `templates/MIGRATION.md` | — | 2, 10 (content half), 17 |
| [04](plan-a-04.md) | Six agent profiles + graph, sync, and utility skills | 03 | 3, 14, part of 4/18 |
| [05](plan-a-05.md) | Recruitment and composing skills + ledger move | 03 | part of 4/18, 12 |
| [06](plan-a-06.md) | Docs pages + published `fit-outpost` skill + CLI parity | 03 | 13 |
| [07](plan-a-07.md) | Convergence fixture test + repo-wide sweeps and gates | 01–06 | 11, 12, 13, 15 |

Criterion 16 (major release) lands after merge through `kata-release-cut`:
the Outpost package moves from 3.12.1 to 4.0.0 and the release notes point
to MIGRATION.md.

## Execution

- **Sequence:** 01 → 02, and 03 in parallel with 01/02. Then 04, 05, and 06
  in parallel. Then 07.
- **One PR.** The clean break makes intermediate states inconsistent (a
  template that names tiers while init still creates `Knowledge/` fails its
  own validator). All parts merge as one PR.
- **Agent routes:** staff-engineer executes parts 01, 02, 03, 04, 05,
  and 07. technical-writer executes part 06. Parts 04 and 05 partition the
  skill set with no shared files, so two agents can run them concurrently.
- **`.claude/**` writes.** Part 06 edits `.claude/skills/fit-outpost/`.
  Repository settings block direct `.claude/**` writes; use
  `echo … | bunx gemba-selfedit <path>` on this non-main branch per the
  root CLAUDE.md.
- **Spec-dir hygiene.** Every edit under `specs/2310-…/` (the plan files
  and the MIGRATION.md status header) passes the spec-2310 vault leak
  scan before commit: no installation content, names, or organizations.

## Risks

- **npm `os: ["darwin"]`.** The Outpost package refuses install on
  non-macOS, so a share recipient on Linux cannot run
  `npx fit-outpost validate`. The spec and design are silent. This plan does
  not lift the restriction; record it as a known limit in the PR body for
  the product manager.
- **Golden help fixtures.** `buildDefinition` is under a byte-stability
  contract with `test/golden/fit-outpost/`. Part 02 changes the definition
  deliberately and regenerates the fixtures; a reviewer must treat the
  fixture diff as intended.
- **Mock fs has no real symlink semantics.** `libmock`'s `symlink` is a
  stub. Validator tests that need symlink traversal and link resolution run
  on real temporary directories (`node:fs/promises` + `mkdtemp`), not on
  the mock.
- **Instruction-quality checks.** `jidoka` length budgets and the
  skill-template invariants run over the rewritten templates in CI, and
  some template files sit near their caps after the repo-wide prose
  rewrite. Parts 04 and 05 therefore run `bunx jidoka instructions` in
  their own verification, not only at part 07, and trade body lines for
  the added declarations where a file is at its cap.
- **Prose conflicts with recent merges.** PR #2040 rewrote site prose
  repo-wide. Part 06 edits the same pages; rebase before the panel if main
  moves.
