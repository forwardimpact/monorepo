# Plan 1370 — Part 02: libwiki

Migrates libwiki's 11 per-command files to the spec-1370 DI contract
([Success Criterion 4](spec.md#success-criteria)), replaces `WikiRepo`
with a `WikiSync` collaborator over `libutil`'s `GitClient`
([design § Components](design-a.md#components)), and rewrites
`bin/fit-wiki.js` from its hand-rolled `COMMANDS` switch to
`cli.dispatch(parsed, { deps: { runtime, wikiSync } })`
([design § Decision 13](design-a.md#key-decisions)). No per-CLI facade
class — libwiki's per-command file layout is preserved; handlers read
`runtime` and `wikiSync` from `ctx.deps` identically to every other
dispatched CLI in the monorepo ([design § Decision 11](design-a.md#key-decisions)).

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
- `wiki-sync.integration.test.js` — uses `createDefaultRuntime` + a real `GitClient`; covers the spec-preserved cases from the deleted `wiki-repo.test.js`: rebase conflict, `-X ours` recovery, token-rotated push, parent-dir `configGet` read. **`deriveWikiUrl` coverage moves** to `libraries/libutil/test/git-client.integration.test.js` (plan-a-01 Step 5) since `deriveWikiUrl` is logically a `GitClient.remoteGetUrl` consumer; `commands/init.js`'s remaining `deriveWikiUrl` orchestration is covered by `init.test.js` against a mock `GitClient`.
- `wiki-repo.js` is deleted in the same commit; every monorepo importer rewires to `WikiSync` or directly to `GitClient` in this PR. Pre-PR audit: `rg "WikiRepo|require.*wiki-repo|from.*wiki-repo" libraries/ products/ services/` enumerates the actual importers; current audit (2026-05-30) shows callers only inside `libraries/libwiki/` itself — the bridges (`services/{msbridge,ghbridge}`) do **not** import `WikiRepo` directly. If the audit at PR time uncovers any cross-package consumer, that consumer's migration is added to this PR.

Verification: `bun test libraries/libwiki/test/wiki-sync.test.js` passes; `bun test libraries/libwiki/test/wiki-sync.integration.test.js` passes; `rg "WikiRepo|require.*wiki-repo|from.*wiki-repo" libraries/ products/ services/` returns zero matches.

## Step 3 — Per-command handler signature migration

Created: none. Modified: every file under `libraries/libwiki/src/commands/`.

- Each `commands/<name>.js` keeps its existing per-file location. The exported handler signature changes from `(values, args, cli)` to `(ctx)` — matching `cli.dispatch`'s `handler: (ctx) => …` contract — and reads its dependencies from `ctx.deps`:
  ```js
  // libraries/libwiki/src/commands/claim.js — sketch of the post-migration shape
  export async function runClaimCommand(ctx) {
    const { runtime, wikiSync } = ctx.deps;
    // ... use runtime.proc.cwd(), runtime.fs.*, wikiSync.pull(), etc.
    return { ok: true, value: { /* ... */ } };
  }
  ```
- Inside each handler: every `process.cwd()` → `runtime.proc.cwd()`, every `process.env.X` → `runtime.proc.env.X`, every `process.exit(code)` → `return { ok: false, code, error: … }` (or `{ ok: true, value }` for success), every `fs.writeFileSync` → `runtime.fsSync.writeFileSync` (or migrate to async `runtime.fs.writeFile` if the call chain permits — see § Async propagation below), every `Date.now()` → `runtime.clock.now()`, every `new Date()` → `new Date(runtime.clock.now())`.
- A one-line helper `currentDayIso(runtime)` lives in `libraries/libwiki/src/util/clock.js` (new); commands that previously called `io.today()` invoke this helper instead of inlining the `new Date(...).toISOString().slice(0,10)` chain at every site.
- The four already-`io`-migrated commands (`claim.js`, `init.js`, `log.js`, `refresh.js`) rewire from `io.cwd()` / `io.env` / `io.exit()` / `io.today()` to `ctx.deps.runtime.proc.cwd()` / `ctx.deps.runtime.proc.env` / envelope return / `currentDayIso(ctx.deps.runtime)`. `io.js` and `createDefaultIo()` are deleted.
- Each command's existing test file (`test/<name>.test.js`) imports the handler directly and invokes `runXxxCommand({ args, options, data, deps: { runtime, wikiSync } })` against a `createTestRuntime` + `createMockGitClient`-backed `WikiSync` — no class instantiation, no bin spawn. One assertion per test covers the envelope shape and the side-effect channel that command owns (e.g. `runtime.fsSync.calls.writeFileSync` for `claim`).
- The 13 subcommands map onto **11 source files**: `claim.js` exports both `runClaimCommand` and `runReleaseCommand`; `sync.js` exports `runPushCommand` and `runPullCommand`; the other nine files each export one handler. This file/handler arrangement is preserved; only signatures change.

Verification: `bun test libraries/libwiki/test/` passes against the new signatures; `rg "from .*libwiki/io" libraries/ products/ services/` returns zero matches; `rg "process\\.(cwd|env|exit|stdout|stderr)" libraries/libwiki/src/commands/` returns zero matches.

## Step 4 — `bin/fit-wiki.js` rewrite to `cli.dispatch`

Created: `libraries/libwiki/src/cli-definition.js` (new file extracted from the bin). Modified: `libraries/libwiki/bin/fit-wiki.js`, `libraries/libwiki/test/fit-wiki-smoke.integration.test.js`.

- Move the libcli subcommand definitions out of the bin into `src/cli-definition.js`. The file exports a `definition` constant whose subcommand `handler` fields directly reference each per-command file's exported handler:
  ```js
  // libraries/libwiki/src/cli-definition.js — sketch
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
  export const definition = {
    name: "fit-wiki",
    commands: {
      audit:   { handler: runAuditCommand,   /* args/options */ },
      boot:    { handler: runBootCommand,    /* ... */ },
      claim:   { handler: runClaimCommand,   /* ... */ },
      release: { handler: runReleaseCommand, /* ... */ },
      fix:     { handler: runFixCommand,     /* ... */ },
      inbox:   { handler: runInboxCommand,   /* ... */ },
      init:    { handler: runInitCommand,    /* ... */ },
      log:     { handler: runLogCommand,     /* ... */ },
      memo:    { handler: runMemoCommand,    /* ... */ },
      pull:    { handler: runPullCommand,    /* ... */ },
      push:    { handler: runPushCommand,    /* ... */ },
      refresh: { handler: runRefreshCommand, /* ... */ },
      rotate:  { handler: runRotateCommand,  /* ... */ },
    },
  };
  ```
  Each `args`/`options` block carries the parsed-argument shape the bin's current `COMMANDS` switch encodes. No factory closure is needed — the handlers read everything from `ctx`, including `ctx.deps.wikiSync`, which the bin threads at dispatch time.
- `bin/fit-wiki.js` collapses to (paths use libutil's new `exports` subpaths from plan-a-01 Step 4):
  ```js
  #!/usr/bin/env node
  import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
  import { GitClient } from "@forwardimpact/libutil/git-client";
  import { createCli } from "@forwardimpact/libcli";
  import { WikiSync } from "../src/wiki-sync.js";
  import { resolveWikiDir } from "../src/util/wiki-dir.js";
  import { definition } from "../src/cli-definition.js";

  async function main() {
    const runtime = createDefaultRuntime();
    const argv = runtime.proc.argv.slice(2); // skip [node, script]
    const gitClient = new GitClient({ runtime });
    const cli = createCli(definition, { runtime });
    const parsed = cli.parse(argv);
    const wikiDir = resolveWikiDir({ runtime, options: parsed.options }); // honors --wiki-dir, FORWARDIMPACT_WIKI_DIR env, repo discovery via Finder
    const wikiSync = new WikiSync({ runtime, gitClient, wikiDir });
    const result = await cli.dispatch(parsed, { deps: { runtime, wikiSync } });
    if (!result.ok) { runtime.proc.stderr.write(result.error + "\n"); }
    runtime.proc.exit(result.ok ? 0 : (result.code ?? 1));
  }
  main();
  ```
  Construction order matters: `runtime` first, then `cli.parse(argv)` so flags like `--wiki-dir` are available, then `wikiSync` (which depends on the parsed `wikiDir`), then dispatch. `deps.wikiSync` is the only libwiki-specific value carried by `ctx.deps`; every other dispatched CLI in the monorepo carries `deps.runtime` alone, so libwiki's bin shape matches the universal contract plus one library-local field.
- `resolveWikiDir` is a new helper (`src/util/wiki-dir.js`) preserving the pre-refactor resolution order: `--wiki-dir` flag → `FORWARDIMPACT_WIKI_DIR` env → `Finder.findUpward(runtime.proc.cwd(), "wiki", 5)` → throw. Hard-coding `cwd() + "/wiki"` would break the `fit-wiki init --target` flow and any non-default wiki location. Pre-refactor resolution logic moves here verbatim from `bin/fit-wiki.js` and `commands/init.js`.
- The hand-rolled `COMMANDS` map (lines 316–350 of pre-refactor bin) is deleted.
- `fit-wiki-smoke.integration.test.js` — the one allow-listed smoke test per SC5 / [check-subprocess-in-tests.mjs](plan-a-01-foundations.md#step-7--scripts-invariant-checks). Spawns `node bin/fit-wiki.js claim --target test-smoke --branch test --agent staff-engineer` against a tmpdir wiki; asserts exit code 0 and the claim row appears. One case is enough — the rest of the wiring is covered by the per-command unit tests in Step 3.

Verification: `bun run scripts/capture-cli-golden.mjs --bin fit-wiki --verify` exits 0 (the goldens captured in Step 1 still match); `bun test libraries/libwiki/test/fit-wiki-smoke.integration.test.js` passes; `rg "COMMANDS\\[" libraries/libwiki/bin/` returns zero matches; `rg "LibwikiCommands" libraries/ products/ services/` returns zero matches (no class is introduced).

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
- **Handler signature change breaks direct importers.** Anything that imports a `commands/<name>.js` handler directly (test helpers, scripts, cross-package consumers) is currently calling it as `runXxxCommand(values, args, cli)`; the new shape is `runXxxCommand(ctx)`. Mitigation: `rg "from.*libwiki/(src/)?commands/" libraries/ products/ services/ scripts/` before the PR opens; rewire every caller to pass a single `ctx` object with `deps: { runtime, wikiSync }` (constructed via `createTestRuntime` + mock `WikiSync` for tests, via the bin's real construction path otherwise).

— Staff Engineer 🛠️
