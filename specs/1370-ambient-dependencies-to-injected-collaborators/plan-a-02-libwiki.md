# Plan 1370 — Part 02: libwiki

Consolidates libwiki's 11 per-command files behind a `LibwikiCommands`
class ([Success Criterion 4](spec.md#success-criteria)), replaces
`WikiRepo` with a `WikiSync` collaborator over `libutil`'s `GitClient`
([design § Components](design-a.md#components)), and rewrites `bin/fit-wiki.js`
from its hand-rolled `COMMANDS` switch to `cli.dispatch` ([design § Decision 13](design-a.md#key-decisions)).

Blocking dependency: plan-a-01 (foundations) merged.

Sub-row: `1370/libwiki\tplan\timplemented` on PR merge.

## Step 1 — Golden capture against pre-refactor bin

Created: `libraries/libwiki/test/golden/fit-wiki/cases.json`, `libraries/libwiki/test/golden/fit-wiki/*.txt`.

- `cases.json` covers: `claim` (success + duplicate), `release`, `log decision/note/done`, `inbox list/ack/promote/drop`, `audit`, `boot --agent staff-engineer --format json`, `memo`, `refresh`, `rotate`, `push`, `pull`, `init --dry-run`.
- Run `bun run scripts/capture-cli-golden.mjs --bin fit-wiki` against pre-refactor `bin/fit-wiki.js`; commit the resulting `.txt` files as the first commit of the PR. Release-merge rejects any subsequent commit that mutates these files without an explicit approval signal.

Verification: `bun run scripts/capture-cli-golden.mjs --bin fit-wiki --verify` exits 0.

## Step 2 — `WikiSync` collaborator

Created: `libraries/libwiki/src/wiki-sync.js`, `libraries/libwiki/test/wiki-sync.test.js`, `libraries/libwiki/test/wiki-sync.integration.test.js`. Deleted: `libraries/libwiki/src/wiki-repo.js`, `libraries/libwiki/src/build-repo.js` (the `buildRepo(...)` factory consumed by `commands/sync.js` and `commands/claim.js`), `libraries/libwiki/test/wiki-repo.test.js`. Modified: `libraries/libwiki/src/index.js` (remove `export { WikiRepo } from "./wiki-repo.js"` at line 23; add `export { WikiSync } from "./wiki-sync.js"`), `.claude/skills/fit-wiki/SKILL.md` (remove `WikiRepo` from the public-exports list at line 156; document `WikiSync` as its successor).

- `wiki-sync.js`:
  ```js
  export class WikiSync {
    constructor({ runtime, gitClient, wikiDir }) {
      this.#runtime = runtime;
      this.#git = gitClient;
      this.#wikiDir = wikiDir;
    }
    async pull({ branch = "main" } = {}) { /* fetch + rebase via this.#git */ }
    async push({ branch = "main", token } = {}) { /* commitAll + push via this.#git.withAuth(token) */ }
    async resolveConflicts({ strategy = "ours" } = {}) { /* mergeOursStrategy via this.#git */ }
    async status() { /* this.#git.status({ cwd: this.#wikiDir }) */ }
    async aheadCount({ upstream = "origin/main" } = {}) { /* this.#git.aheadCount({ cwd, upstream }) */ }
    async getRemoteUrl() { /* this.#git.remoteGetUrl("origin", { cwd: this.#wikiDir }) */ }
  }
  ```
- `wiki-sync.test.js` — uses `createTestRuntime` + `createMockGitClient`; asserts each method invokes the expected `gitClient` method with the expected args; no real git, no tmpdir.
- `wiki-sync.integration.test.js` — uses `createDefaultRuntime` + a real `GitClient`; covers the spec-preserved cases from the deleted `wiki-repo.test.js`: rebase conflict, `-X ours` recovery, token-rotated push, parent-dir `configGet` read. **`deriveWikiUrl` coverage moves** to `libraries/libutil/test/git-client.integration.test.js` (plan-a-01 Step 5) since `deriveWikiUrl` is logically a `GitClient.remoteGetUrl` consumer; `commands/init.js`'s remaining `deriveWikiUrl` orchestration is covered by `commands.test.js` against a mock `GitClient`.
- `wiki-repo.js` is deleted in the same commit; every monorepo importer rewires to `WikiSync` or directly to `GitClient` in this PR. Pre-PR audit: `rg "WikiRepo|require.*wiki-repo|from.*wiki-repo" libraries/ products/ services/` enumerates the actual importers; current audit (2026-05-30) shows callers only inside `libraries/libwiki/` itself — the bridges (`services/{msbridge,ghbridge}`) do **not** import `WikiRepo` directly. If the audit at PR time uncovers any cross-package consumer, that consumer's migration is added to this PR.

Verification: `bun test libraries/libwiki/test/wiki-sync.test.js` passes; `bun test libraries/libwiki/test/wiki-sync.integration.test.js` passes; `rg "WikiRepo|require.*wiki-repo|from.*wiki-repo" libraries/ products/ services/` returns zero matches.

## Step 3 — `LibwikiCommands` facade

Created: `libraries/libwiki/src/commands.js`, `libraries/libwiki/test/commands.test.js`. Modified: every file under `libraries/libwiki/src/commands/`.

- `commands.js` — thin composition facade. The 13 subcommand methods map onto **11 source files**: `claim.js` exports both `runClaimCommand` and `runReleaseCommand`; `sync.js` exports `runPushCommand` and `runPullCommand`. Imports below reflect the actual layout:
  ```js
  import { runAuditCommand } from "./commands/audit.js";
  import { runBootCommand } from "./commands/boot.js";
  import { runClaimCommand, runReleaseCommand } from "./commands/claim.js";
  import { runFixCommand } from "./commands/fix.js";
  import { runInboxCommand } from "./commands/inbox.js";
  import { runInitCommand } from "./commands/init.js";
  import { runLogCommand } from "./commands/log.js";
  import { runMemoCommand } from "./commands/memo.js";
  import { runRefreshCommand } from "./commands/refresh.js";
  import { runRotateCommand } from "./commands/rotate.js";
  import { runPullCommand, runPushCommand } from "./commands/sync.js";
  export class LibwikiCommands {
    #runtime; #wikiSync;
    constructor({ runtime, wikiSync }) {
      this.#runtime = runtime;
      this.#wikiSync = wikiSync;
    }
    audit(ctx)   { return runAuditCommand(ctx,   { runtime: this.#runtime, wikiSync: this.#wikiSync }); }
    boot(ctx)    { return runBootCommand(ctx,    { runtime: this.#runtime, wikiSync: this.#wikiSync }); }
    claim(ctx)   { return runClaimCommand(ctx,   { runtime: this.#runtime, wikiSync: this.#wikiSync }); }
    release(ctx) { return runReleaseCommand(ctx, { runtime: this.#runtime, wikiSync: this.#wikiSync }); }
    fix(ctx)     { return runFixCommand(ctx,     { runtime: this.#runtime, wikiSync: this.#wikiSync }); }
    inbox(ctx)   { return runInboxCommand(ctx,   { runtime: this.#runtime, wikiSync: this.#wikiSync }); }
    init(ctx)    { return runInitCommand(ctx,    { runtime: this.#runtime, wikiSync: this.#wikiSync }); }
    log(ctx)     { return runLogCommand(ctx,     { runtime: this.#runtime, wikiSync: this.#wikiSync }); }
    memo(ctx)    { return runMemoCommand(ctx,    { runtime: this.#runtime, wikiSync: this.#wikiSync }); }
    pull(ctx)    { return runPullCommand(ctx,    { runtime: this.#runtime, wikiSync: this.#wikiSync }); }
    push(ctx)    { return runPushCommand(ctx,    { runtime: this.#runtime, wikiSync: this.#wikiSync }); }
    refresh(ctx) { return runRefreshCommand(ctx, { runtime: this.#runtime, wikiSync: this.#wikiSync }); }
    rotate(ctx)  { return runRotateCommand(ctx,  { runtime: this.#runtime, wikiSync: this.#wikiSync }); }
  }
  ```
- Every `commands/<name>.js`: signature changes from `(values, args, cli)` to `(ctx, { runtime, wikiSync })`. Inside, every `process.cwd()` → `runtime.proc.cwd()`, every `process.env.X` → `runtime.proc.env.X`, every `process.exit(code)` → `return { ok: false, code, error: … }` (or `{ ok: true, value }` for success), every `fs.writeFileSync` → `runtime.fsSync.writeFileSync` (or migrate to async `runtime.fs.writeFile` if the call chain permits — see § Async propagation below), every `Date.now()` → `runtime.clock.now()`, every `new Date()` → `new Date(runtime.clock.now())`.
- A one-line helper `currentDayIso(runtime)` lives in `libraries/libwiki/src/util/clock.js` (new); commands that previously called `io.today()` invoke this helper instead of inlining the `new Date(...).toISOString().slice(0,10)` chain at every site.
- The four already-`io`-migrated commands (`claim.js`, `init.js`, `log.js`, `refresh.js`) rewire from `io.cwd()` / `io.env` / `io.exit()` / `io.today()` to `ctx.deps.runtime.proc.cwd()` / `ctx.deps.runtime.proc.env` / envelope return / `currentDayIso(ctx.deps.runtime)`. `io.js` and `createDefaultIo()` are deleted.
- `commands.test.js` — instantiates `LibwikiCommands` with `createTestRuntime` + `createMockGitClient`-backed `WikiSync`; one test per method asserting it returns the expected envelope shape against a representative ctx.

Verification: `bun test libraries/libwiki/test/commands.test.js` passes; existing per-command tests (`libraries/libwiki/test/*.test.js`) pass against the new signatures.

## Step 4 — `bin/fit-wiki.js` rewrite to `cli.dispatch`

Created: none. Modified: `libraries/libwiki/bin/fit-wiki.js`, `libraries/libwiki/src/cli-definition.js` (new file extracted from the bin), `libraries/libwiki/test/fit-wiki-smoke.integration.test.js`.

- Move the libcli subcommand definitions out of the bin into `src/cli-definition.js`. The file exports a **factory** `makeDefinition(commands)` so each subcommand's `handler: (ctx) => commands.<name>(ctx)` closes over the `LibwikiCommands` instance the bin constructs (per `cli.js`'s `handler: (ctx) => …` contract — no new libcli API needed).
- `bin/fit-wiki.js` collapses to (paths use libutil's new `exports` subpaths from plan-a-01 Step 4):
  ```js
  #!/usr/bin/env node
  import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
  import { GitClient } from "@forwardimpact/libutil/git-client";
  import { createCli } from "@forwardimpact/libcli";
  import { LibwikiCommands } from "../src/commands.js";
  import { WikiSync } from "../src/wiki-sync.js";
  import { resolveWikiDir } from "../src/util/wiki-dir.js";
  import { makeDefinition } from "../src/cli-definition.js";

  async function main() {
    const runtime = createDefaultRuntime();
    const argv = runtime.proc.argv.slice(2); // skip [node, script]
    const gitClient = new GitClient({ runtime });
    const tentative = createCli(makeDefinition(null), { runtime });
    const parsed = tentative.parse(argv);
    const wikiDir = resolveWikiDir({ runtime, options: parsed.options }); // honors --wiki-dir, FORWARDIMPACT_WIKI_DIR env, repo discovery via Finder
    const wikiSync = new WikiSync({ runtime, gitClient, wikiDir });
    const commands = new LibwikiCommands({ runtime, wikiSync });
    const cli = createCli(makeDefinition(commands), { runtime });
    const result = await cli.dispatch(parsed, { deps: { runtime } });
    if (!result.ok) { runtime.proc.stderr.write(result.error + "\n"); }
    runtime.proc.exit(result.ok ? 0 : (result.code ?? 1));
  }
  main();
  ```
  `makeDefinition(null)` is the parse-only pass — handlers stubbed as no-ops so `cli.parse` runs without dispatching; `makeDefinition(commands)` is the dispatch pass with real handlers. This keeps the libcli surface unchanged from plan-a-01 (no `bindHandlers` method introduced).
- `resolveWikiDir` is a new helper (`src/util/wiki-dir.js`) preserving the pre-refactor resolution order: `--wiki-dir` flag → `FORWARDIMPACT_WIKI_DIR` env → `Finder.findUpward(runtime.proc.cwd(), "wiki", 5)` → throw. Hard-coding `cwd() + "/wiki"` would break the `fit-wiki init --target` flow and any non-default wiki location. Pre-refactor resolution logic moves here verbatim from `bin/fit-wiki.js` and `commands/init.js`.
- The hand-rolled `COMMANDS` map (lines 316–350 of pre-refactor bin) is deleted.
- `fit-wiki-smoke.integration.test.js` — the one allow-listed smoke test per SC5 / [check-subprocess-in-tests.mjs](plan-a-01-foundations.md#step-7--scripts-invariant-checks). Spawns `node bin/fit-wiki.js claim --target test-smoke --branch test --agent staff-engineer` against a tmpdir wiki; asserts exit code 0 and the claim row appears. One case is enough — the rest of the wiring is covered by `commands.test.js`.

Verification: `bun run scripts/capture-cli-golden.mjs --bin fit-wiki --verify` exits 0 (the goldens captured in Step 1 still match); `bun test libraries/libwiki/test/fit-wiki-smoke.integration.test.js` passes; `rg "COMMANDS\\[" libraries/libwiki/bin/` returns zero matches.

## Step 5 — Async propagation through libwiki-internal callers

Created: none. Modified: every libwiki-internal caller of pre-refactor `WikiRepo` methods that was synchronous.

- Pre-PR audit `rg "WikiRepo|wiki-repo" libraries/ products/ services/` enumerates the actual callers. As of 2026-05-30 the only callers are inside `libraries/libwiki/` itself: `bin/fit-wiki.js` (now rewritten in Step 4), `commands/sync.js`, `commands/init.js`, the four already-`io`-migrated commands, and the `WikiRepo`-consuming tests in `test/wiki-repo.test.js` (deleted in Step 2).
- Each remaining sync site converts: `result = repo.pull()` → `result = await wikiSync.pull()`. Command handlers are already async — the conversion is a per-call-site `await` insertion.
- **No bridge migration owed here.** The bridges (`services/msbridge`, `services/ghbridge`) do not import `WikiRepo` directly; they delegate the wiki flow to libwiki's bin (`spawnSync("fit-wiki", ...)`) or to a separate path. If the pre-PR audit uncovers a bridge importer that the 2026-05-30 grep missed, the bridge's rewire moves into this PR; otherwise bridge migrations stay in plan-a-06.

Verification: `bun test libraries/libwiki/test/` passes; `rg "WikiRepo|require.*wiki-repo|from.*wiki-repo" libraries/ products/ services/` returns zero matches.

## Step 6 — Deny-list shrink

Created: none. Modified: `scripts/check-ambient-deps.deny.json`, `scripts/check-subprocess-in-tests.deny.json`.

- Remove every `libraries/libwiki/src/**` entry from both deny-lists.
- Confirm `bun run invariants` exits 0 with libwiki no longer grandfathered.

Verification: `bun run invariants` exits 0; `rg "\"library\":\\s*\"libwiki\"" scripts/check-ambient-deps.deny.json` returns zero matches.

## Step 7 — Golden replay

- Run `bun run scripts/capture-cli-golden.mjs --bin fit-wiki --verify` against post-refactor bin. The diff against the Step 1 snapshots must be empty. Any divergence either reflects a bug (fix it) or an intentional output change (which needs spec/design amendment, not a plan PR mutation).

Verification: capture-cli-golden exits 0.

## Step 8 — Sub-row advance

Modified: `wiki/STATUS.md`.

- Set `1370/libwiki\tplan\timplemented`.

Verification: `audit` passes; the master `1370` row remains at `plan approved` until every sub-row implements.

## Libraries used

Libraries used: libutil (Runtime, GitClient, Finder), libmock
(createTestRuntime, createMockGitClient, createMockSubprocess), libcli
(cli.dispatch with deps), libwiki (rewrite target).

## Risks

- **`io` → `ctx.deps.runtime` rename breaks downstream consumers.** Anything that imported `createDefaultIo` from libwiki (the four migrated commands are the documented case, but other callers may exist). Mitigation: `rg "createDefaultIo|from.*libwiki/io|require.*libwiki/io"` before the PR opens; rewire every caller in the same PR.
- **A late-discovered cross-package consumer of `WikiRepo`.** Pre-PR `rg` audit may surface a consumer the 2026-05-30 snapshot missed. Mitigation: the audit is the first task of the PR; any uncovered importer is rewired in the same PR, or the PR's scope-creep guard escalates to a follow-up sub-row.
- **`fit-wiki.js` bin rewrite changes the help text.** The libcli definition's help renderer differs from the hand-rolled help text. Mitigation: the golden capture (Step 1) records help output; the rewrite (Step 4) must match. Help text changes are caught by Step 7's verify pass and treated as PR-blocking until the diff is reconciled.
- **`LibwikiCommands` class adds a constructor argument many callers don't have.** Anything constructing libwiki commands directly (test helpers, scripts) needs the new shape. Mitigation: `rg "from.*libwiki/commands/"` before the PR opens; rewire to import `LibwikiCommands` and construct with `createTestRuntime` + mock `WikiSync`.

— Staff Engineer 🛠️
