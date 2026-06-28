# Plan 1720 — Skill ref lint

Executes [design-a.md](./design-a.md) against [spec.md](./spec.md).

## Approach

Build the lint as pure `libskill` modules (extractor, anchors, linter, types)
plus a side-effecting resolver that consumes an `lsRemote` method added to the
existing `libutil` `GitClient` (reusing its token-threading and error mapping),
wired by a thin standalone `scripts/check-skill-refs.mjs` driver, then add three
CI surfaces. Pure modules carry the success-criteria matrix as unit tests with a
table-driven resolver fake; the driver gets one integration test against a
committed pre-fix fixture. Steps 1→4 are sequential (each builds on the prior
export); 5 depends on 1–4; 6 depends on 5's script; 7 rebases last.

Libraries used: libskill (new modules + exports), libutil (add `lsRemote` to
`GitClient`; resolver consumes it via two clients — token-bearing and
anonymous), libmock (Runtime fake in the GitClient test). The design's component
table names `yaml`; this plan deliberately drops it — the fenced/prose scan is
line-based, so no YAML parse is needed.

## Step 1 — Ref types and extractor

Intent: turn skill files into a typed `Ref[]`, classifying each by its post-`@`
token per the design's reference model.

Files:

- create `libraries/libskill/src/action-refs.js`
- create `libraries/libskill/test/action-refs.test.js`
- create `libraries/libskill/test/fixtures/skill-refs-prefix/` — verbatim copies
  of the 4 corpus files captured with
  `git show 9e7852d7:.claude/skills/kata-setup/<path>` for `SKILL.md`,
  `references/workflow-agent.md`, `references/workflow-facilitate.md`,
  `references/workflow-react.md` (the 4 files carrying the 11 corpus sites).

Change: export `extractRefs(files)` where `files` is `[{path, text}]`. Per file,
scan line by line for fenced `uses:` lines, fully-qualified
`owner/repo[/path][@ref]` tokens (fence or prose), owner-less `name@ref` tokens,
and bare action-name mentions. Emit `Ref { file, line, class, owner, repo,
refToken }` with `class ∈ {qualified, placeholder, illustrative,
contextual-qualified, contextual}` and `refToken = {kind:
'literal'|'placeholder'|'illustrative'|'none', value}`. Drop path-form (`./…`,
`<name>/action.yml`), npm specifiers (`@forwardimpact/<pkg>`), and fully
schematic (`<owner>/<repo>@<ref>`) tokens. `@{{NAME}}`→`placeholder`;
`@<angle-token>`→`illustrative`.

Verify: `bun test libraries/libskill/test/action-refs.test.js` — the fixture
yields the 11 corpus sites with correct classes. Distinguish the two residual
mechanisms: path/npm/schematic tokens are **dropped at extraction**, while
owner-less prose like `libfoo@v0.1.5`, `pathway@v0.25.0`, `pass@k`, bare
`fit-codegen` extract as `contextual` and produce no finding only because they
are **unanchored** (Step 4) — assert the former are absent from `extractRefs`
output and the latter are present-but-contextual.

## Step 2 — Placeholder allowlist + anchoring

Intent: compute the allowlist and resolve contextual anchors, both pure.

Files:

- create `libraries/libskill/src/ref-anchors.js`
- create `libraries/libskill/test/ref-anchors.test.js`

Change: export `buildPlaceholderAllowlist(refs)` — map `{{NAME}}`→`owner/repo`
for every placeholder appearing post-`@` in a `uses:` line under a `kata-setup`
skill dir (body-only names never appear post-`@`, so never enter the map).
Export `anchorContextual(refs)` — for each `contextual`/`contextual-qualified`
token, find a qualified ref (literal or placeholder) in the **same skill dir**
whose `repo` segment equals the token's repo exactly and case-sensitively;
attach the anchor or mark unanchored. Skill dir = first two path segments under
`.claude/skills/`.

Verify: `bun test …/ref-anchors.test.js` — `{{KATA_AGENT_REF}}`→`kata-agent`,
`{{FIT_EVAL_REF}}`→`fit-eval`; `{{MODEL}}` absent; bare `agent` anchors to
nothing; `kata-agent` prose anchors to `forwardimpact/kata-agent`.

## Step 3 — GitClient.lsRemote + resolver

Intent: the reality probe behind a `resolve(ref)` interface, with the two-stage
reachability gate from the design.

Files:

- modify `libraries/libutil/src/git-client.js` (add `lsRemote`)
- create `libraries/libutil/test/git-client-lsremote.test.js`
- create `libraries/libskill/src/ref-resolver.js`
- create `libraries/libskill/test/ref-resolver.test.js`

Change:

- `GitClient.lsRemote(url)` →
  `#runRaw(['ls-remote', '--tags', '--heads', url], {allowFailure: true})`
  returning `{exitCode, stdout, stderr}`. **No new `#runRaw` option**: `#runRaw`
  already sources env from `this.#runtime.proc.env` and threads `this.#token`
  (or not) automatically. Anonymous transport is a GitClient **without** a token
  (or `client.withAuth(null)`); `GIT_TERMINAL_PROMPT=0` is set on the runtime's
  `proc.env` by the driver (Step 5), preserving the injection seam — not read
  from `process.env` inside the client.
- `ref-resolver.js`: export
  `createGitResolver({ authedGit, anonGit, anchor = 'actions/checkout' })`
  returning `{ resolve({owner, repo, anonymous}) }`. It picks `anonGit` when
  `anonymous`, else `authedGit`. First call probes the anchor via `anonGit`
  (memoized); **gate-red = any nonzero anchor exit** → `{state: 'unreachable'}`,
  no string-matching. Gate green: run the target; `exitCode 0` →
  `{state:'ok', refs: parse(stdout)}`; `exitCode 128` → `{state:'absent'}`
  (reachability is proven, so an auth-demand means private-or-absent — a
  finding); any other nonzero → re-probe the anchor and return `unreachable` if
  it now fails, else `absent`. `parse` reads `<sha>\trefs/tags/<t>` and the
  `<t>^{}` peel line, so tag→SHA uses the peel SHA when present (annotated) and
  the bare tag SHA otherwise (lightweight).

Verify: `bun test …/git-client-lsremote.test.js` (libmock Runtime whose
`subprocess.run` returns canned `{stdout, exitCode}`) + `bun test
…/ref-resolver.test.js` — inject fake `authedGit`/`anonGit` whose `lsRemote`
switches on the `url` arg, so anchor and target return different canned results
in one run; assert `ok`/`absent`/`unreachable` and peeled-vs-bare SHA selection.

## Step 4 — Linter + exports

Intent: pure orchestration from `Ref[]` + allowlist + resolver → ordered
`Finding[]`, applying every assertion and class stance; export the symbols the
driver imports.

Files:

- create `libraries/libskill/src/ref-lint.js`
- create `libraries/libskill/test/ref-lint.test.js`
- modify `libraries/libskill/src/index.js` (re-export `extractRefs`,
  `buildPlaceholderAllowlist`, `anchorContextual`, `createGitResolver`,
  `lintActionRefs`)
- modify `libraries/libskill/package.json` (add `./action-refs` subpath →
  `./src/action-refs.js`)

Change: export `async lintActionRefs({ refs, allowlist, resolve })`. Per ref:
assertion 1 (repo resolves; a `resolve` returning `unreachable` short-circuits
the whole run to a single `{kind:'unreachable'}` sentinel — never a pass);
assertion 2 (literal ref present in the listing); assertion 3 (`# tag` agrees
with the SHA). Placeholders: allowlist member → repo check only; non-member →
`malformed`. Contextual: emit through anchor failures and check own literal ref
against the anchored repo; unanchored → nothing. Findings sorted by
`(file, line)`; the `workflow-react.md` bare-name site yields one finding per
token.

Verify: `bun test …/ref-lint.test.js` — a table-driven resolver fake exercises
every success-criteria row, each asserting the exact code path:

- nonexistent repo → finding; non-public published ref → fake returns
  `{state:'absent'}` (the exit-128/gate-green path) → finding;
- bad literal ref; placeholder repo-half wrong; anchored stale ref; tag/SHA
  disagreement;
- **drift class** (criterion 14): same fixture content, fake first returns `ok`
  then `absent`/tag-moved on a second pass → finding (reality varied, content
  fixed);
- all-resolvable clean tree → zero findings; `unreachable` → sentinel, not a
  pass. Assert the full 11-finding set against the pre-fix fixture.

## Step 5 — Check driver

Intent: wire the repo tree + real resolver into the linter; the CLI surface.

Files:

- create `scripts/check-skill-refs.mjs`
- create `tests/check-skill-refs.integration.test.js`
- modify `package.json` (add
  `check-skill-refs: node scripts/check-skill-refs.mjs` as a top-level script;
  do **not** fold into `context` — the lint touches the network and its CI gate
  is the dedicated workflow in Step 6, not the `Context` jobs)

Change: `#!/usr/bin/env node`. Parse `--root <dir>` (default repo root). Build a
default Runtime with `proc.env = {...process.env, GIT_TERMINAL_PROMPT: '0'}`.
Walk `<root>/.claude/skills/**` (`SKILL.md` + `references/*.md`), build `files`,
run extractor → `buildPlaceholderAllowlist` + `anchorContextual`. Construct
`authedGit = new GitClient({ runtime, token: process.env.GH_TOKEN })` and
`anonGit = new GitClient({ runtime })` (no token), pass both to
`createGitResolver`, then `lintActionRefs`. Print
`file:line — owner/repo[@ref] — <reason>`. Exit 0 clean, 1 findings, 2
unreachable. `GH_TOKEN` is optional — absent (fork PR) means internal private
refs read as findings, per design § Risks.

The authoritative 11-finding assertion against the pre-fix corpus is the
**unit** test in Step 4 (resolver fake returns `absent` for the `kata-action-*`
repos) — deterministic and offline. This integration test only confirms the
driver wires extractor → anchors → resolver → linter → exit codes end-to-end.

Verify: `bun test tests/check-skill-refs.integration.test.js` — spawns
`node scripts/check-skill-refs.mjs --root <fixture>` against the committed
pre-fix fixture and asserts a nonzero exit with the `file:line — … — <reason>`
format on stdout. The test lives under `tests/` (collected by the `test` glob);
`check-subprocess-in-tests` scans only `{libraries,products,services}/*/test`,
so a top-level `tests/` file is outside its scope — the `.integration.test.js`
suffix is convention, not an invariant requirement. This test reaches the
network for the `kata-action-*` probes; mark it accordingly so it is skippable
offline.

## Step 6 — CI surfaces

Intent: PR gate, publish-path block, scheduled drift run with issue upsert.

Files:

- create `.github/workflows/check-skill-refs.yml`
- modify `.github/workflows/publish-skills.yml`

Change:

- `check-skill-refs.yml` (following the `check-context.yml` job shape): `on` =
  `pull_request` (paths `.claude/skills/**`), `schedule` (daily cron),
  `workflow_dispatch`. Top-level `permissions: contents: read`. Job `lint`:
  checkout → `forwardimpact/fit-bootstrap@<pinned-sha>` →
  `run: bun run check-skill-refs` with `env: { GH_TOKEN: ${{ github.token }} }`.
  A separate job `drift-issue` with `needs: lint`, a **single** guard
  `if: always() && github.event_name == 'schedule'`, and
  `permissions: contents: read, issues: write`: when
  `needs.lint.result == 'failure'`, upsert a single issue titled
  `skill-ref-lint: drift detected` via
  `gh issue list --search "in:title skill-ref-lint: drift detected" --state open`
  (operate on the **first** match if several; create if none; else
  `gh issue edit` the body with the finding output); when `lint` succeeded,
  `gh issue close` any open match. The `schedule` guard keeps PR/dispatch runs
  from touching the issue.
- `publish-skills.yml`: in **both** `publish-fit-skills` and
  `publish-kata-skills`, add a `Skill ref lint` step — `uses:
  forwardimpact/fit-bootstrap@<pinned-sha>` with `working-directory: monorepo`,
  then `run: bun run check-skill-refs` with `working-directory: monorepo` —
  ordered **after** the existing `audit` step and **before** `Sync skills` (in
  the kata job also before `Sync agents`, which is later and out of scope). A
  nonzero exit blocks the sync. fit-bootstrap must target the `monorepo`
  checkout path the workflow already uses (`path: monorepo`).

Verify: `actionlint .github/workflows/check-skill-refs.yml`; read
`publish-skills.yml` and confirm the `Skill ref lint` step precedes
`Sync skills` in both jobs and that fit-bootstrap precedes it and is scoped to
`monorepo`.

## Step 7 — Rebase and prove the clean tree

Intent: land on the post-fix tree so the lint passes on its own content.

Files: none (rebase only).

Change: `git rebase origin/main`. At rebase time, re-read the live
`.claude/skills/kata-setup/` placeholder and pin values (do not trust the
design's snapshot — `origin/main` may have advanced); the resolver and tests
read the tree at runtime, so only the pre-fix **fixture** carries hard-coded
values. Resolve any conflicts toward post-fix content.

Verify: `bun run check` and `bun test` pass; `node scripts/check-skill-refs.mjs`
(network-dependent) exits 0 against the live `.claude/skills/` tree — the
non-vacuous clean case (run with network available).

## Risks

- The pre-fix fixture is a **committed verbatim copy** of the 4 corpus files at
  `main@9e7852d7`, captured via `git show` in Step 1 — tests must not depend on
  git history being present at test time.
- `actions/checkout` as the reachability anchor assumes it stays public; it is
  GitHub's canonical action, the safest anchor. If GitHub is down the gate
  reports `unreachable`, which is the intended exit-2 behavior.
- `publish-skills.yml` currently installs no Bun — Step 6 must add fit-bootstrap
  to each job before the lint step, or `bun run` fails at job start.
- The clean-tree local verification in Step 7 makes real network calls; it will
  fail offline. CI (PR job) is the authoritative clean-tree gate.

## Execution

Single engineering agent, sequential per § Approach. No parallelism worth the
coordination cost.

— Staff Engineer 🛠️
