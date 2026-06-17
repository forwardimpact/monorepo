# Plan — Outpost Scheduler-Config Trust Boundary

Implements [design-a.md](design-a.md) for [spec 1360](spec.md).

> **Status: BLOCKED on a design-feasibility defect (do not approve as-is).**
> A clean three-reviewer panel confirmed (3/3 Blocker) that **spec Success
> Criterion 3** ("no allow-listed template permission lets an agent session
> write to the trust paths … regardless of how the write is routed") **cannot
> be met by template permissions alone** given the current template:
>
> - The agent template allow-lists `Bash(bun *)` and `Bash(bunx *)`
>   (`settings.json:6,8`) under `defaultMode: acceptEdits`.
> - Per the Claude Code permission model, `Edit`/`Read` deny rules apply to
>   the built-in edit tools and to *recognized* Bash file commands (`cat`,
>   `head`, `tail`, `sed`) — but **not** to arbitrary subprocesses that write
>   files indirectly (a `bun`/`node` script calling `writeFileSync`, or shell
>   redirection via `echo > …`).
> - The only OS-level boundary that stops such subprocesses is the **sandbox**,
>   which **spec § Out of scope (lines 83–86) explicitly excludes**.
>
> The design's Decision #6 ("Edit + Bash deny patterns together") and Open
> Question Q2/Q3 rest on the premise that template permission patterns can
> close the routed-write surface; that premise is false for interpreter and
> redirection routes. **Resolution required at the design/spec layer, not in
> this plan.** Two viable directions for the human gate, both touching the
> spec's scope boundary:
>
> 1. **Narrow SC#3** to "denies the `Edit`-family and recognized-Bash-file-command
>    routes (defense-in-depth); the load-bearing closure for the actual
>    `state/`-traversal attack is the hardened agent-state writer (surface 2,
>    Steps 2/4/5)." — a spec change.
> 2. **Remove `Bash(bun *)`/`Bash(bunx *)` from the agent template allow-list
>    or enable the sandbox** — pulls spec § Out-of-scope (sandboxing) back into
>    scope; a spec change.
>
> Steps 1–7 and 9 below (env allow-set, state-file naming, socket-server, CLI
> convergence, tests, doc) are sound and fully close **Success Criteria 1, 2,
> 4, 5** and the actual prompt-injection→persistence chain. Step 8 is written
> as the achievable **defense-in-depth** layer pending the SC#3 decision.

## Approach

Add two pure modules (`spawn-env.js`, `agent-path.js`) under
`products/outpost/src/`, then route the four existing call sites through
them: `AgentRunner` delegates env-building to `buildSpawnEnv` and logs each
rejection; `StateManager` computes the state-file prefix via
`agentNameToStatePrefix` and skips the write on rejection; `SocketServer`
resolves the briefing-file prefix through the same mapper; the `fit-outpost
wake` CLI handler forwards `loadConfig().env` so the direct-CLI path matches
the two daemon paths. Close the template write surface through the
**directory-grant model** — `Edit`-family deny on the two trust roots plus
removal of the daemon-owned state subtree from the writable-dir grant — not
per-verb `Bash` globs (Q3 resolution below). Finally, write the contributor
doc `products/outpost/CLAUDE.md`. Steps 1–2 are independent; steps 3–5 depend
on them; steps 6–9 are independent of all.

### Q3 resolution (design Open Question carried in)

Design Q3 asks whether Claude Code permission globs match tilde-expansion and
`**` identically across `Edit()` and each `Bash(<cmd> …)` pattern. Resolved:

- **`Edit`-family rules match by resolved file path** with `~` and `**`
  support — proven by the template's already-shipped `Edit(~/Library/**)`
  deny. So `Edit(~/.fit/outpost/**)` and `Edit(~/.cache/fit/outpost/state/**)`
  reliably reject `Edit`/`Write`/`MultiEdit`/`NotebookEdit` writes to the roots.
- **`Bash()` rules match the command *string*, not the resolved filesystem
  path.** `Bash(mv * ~/.fit/outpost/**)` does not robustly match a write —
  argument reorder, `cd` then a relative write, redirection, or an arbitrary
  interpreter (`bun`/`bunx`/`find -exec`) all bypass any verb-enumerated
  deny. No finite `Bash`-pattern set can close the routed-write surface.
- **The directory grant is the only reliable closure for the Bash surface.**
  A write outside every granted writable directory is denied regardless of
  the tool that routes it. Narrowing the writable grant so it excludes the
  two trust roots therefore satisfies design Decision #6's intent ("regardless
  of how the write is routed") without depending on shell-verb enumeration.

This keeps design Decision #6 (deny the write surface, not just `Edit`) intact
while correcting the *mechanism* from per-verb `Bash` globs to the
directory-grant model. Decisions #5 (broad path) and #6 (whole write surface)
are unchanged.

Libraries used: none (uses Node built-ins `node:os`, `node:path` already
imported by the touched modules).

## Step 1: New module `spawn-env.js`

Carries the env allow-set and the pure filter. New file
`products/outpost/src/spawn-env.js`.

```js
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Env keys the daemon honors for spawned agents. Add new keys here under
 * code review — this is the trust contract (design Decision #1).
 * @type {ReadonlySet<string>}
 */
export const AGENT_ENV_ALLOWSET = Object.freeze(new Set(["ANTHROPIC_API_KEY"]));

/**
 * @param {Record<string,string>=} configEnv
 * @param {NodeJS.ProcessEnv} baseEnv
 * @returns {{ env: Record<string,string>, rejections: string[] }}
 */
export function buildSpawnEnv(configEnv, baseEnv) {
  const env = { ...baseEnv };
  const rejections = [];
  if (configEnv) {
    const home = homedir();
    for (const [key, value] of Object.entries(configEnv)) {
      if (!AGENT_ENV_ALLOWSET.has(key)) {
        rejections.push(key);
        continue;
      }
      const v = String(value);
      env[key] = v.startsWith("~/") ? join(home, v.slice(2)) : v;
    }
  }
  return { env, rejections };
}
```

Verification: unit test in Step 5 drives a `configEnv` with one allow-set
member plus non-members and asserts the returned `env`/`rejections`.

## Step 2: New module `agent-path.js`

Carries the name → state-prefix validation. New file
`products/outpost/src/agent-path.js`.

```js
/** Raised when an agent name cannot map to a safe state-file prefix. */
export class UnsafeAgentNameError extends Error {
  /** @param {string} name */
  constructor(name) {
    super(`unsafe agent name for state path: ${JSON.stringify(name)}`);
    this.name = "UnsafeAgentNameError";
    this.agentName = name;
  }
}

/**
 * @param {string} name
 * @returns {string} safe filename prefix
 * @throws {UnsafeAgentNameError} when `name` contains `/`, `\`, `..`, NUL,
 *   or a leading `~`.
 */
export function agentNameToStatePrefix(name) {
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("..") ||
    name.includes("\0") ||
    name.startsWith("~")
  ) {
    throw new UnsafeAgentNameError(String(name));
  }
  return name.replace(/-/g, "_");
}
```

Verification: unit test in Step 5 feeds `..`, `/`, `\`, leading `~`, NUL, and
a valid hyphenated name; asserts throw on the first set and the
underscore-substituted prefix on the valid name.

## Step 3: Route `AgentRunner` through `buildSpawnEnv`

Replace the private `#buildSpawnEnv` with a delegation that logs rejections.
Modifies `products/outpost/src/agent-runner.js`.

- Add `import { buildSpawnEnv } from "./spawn-env.js";` at the top.
- Delete the private `#buildSpawnEnv` method (JSDoc + body, the `#buildSpawnEnv(configEnv)`
  block); keep the `homedir`/`join` imports (still used by `#findClaude` and
  `#expandPath`).
- In `wake`, at the existing `const env = this.#buildSpawnEnv(configEnv);`
  site — which is **after** the `agent.kb` / `existsSync(kbPath)` early returns,
  so rejections are only logged for wakes that actually spawn (intentional;
  a skipped wake builds no env) — replace it with:

```js
const { env, rejections } = buildSpawnEnv(configEnv, process.env);
for (const key of rejections) {
  this.#log(
    JSON.stringify({
      event: "outpost.spawn_env.rejected",
      key,
      agent: agentName,
    }),
  );
}
```

Verification: existing `agent-runner.test.js` env tests pass after Step 7
updates them; new test asserts a non-allow-set key is absent from spawn env
and produces one rejection log line. (Tests are red between this step and
Step 7 by design; that is the only red window in the sequence.)

## Step 4: Route `StateManager` through `agentNameToStatePrefix`

Replace the inline `replace(/-/g, "_")` with the validating mapper; skip the
write on rejection. Modifies `products/outpost/src/state-manager.js`.

- Add `import { agentNameToStatePrefix, UnsafeAgentNameError } from "./agent-path.js";`.
- Add an **optional** fifth parameter `logFn` to `updateAgentState` (optional
  so the existing 4-arg calls in `state-manager.test.js` stay green — those
  tests pass no `logFn` and the rejection branch guards with `if (logFn)`).
  Pass `this.#log` from `AgentRunner.wake`'s success branch
  (`this.#stateManager.updateAgentState(as, stdout, agentName, this.#cacheDir, this.#log)`).
- Replace the state-write tail (the `const stateDir` / `mkdirSync` /
  `const prefix = agentName.replace(...)` / `writeFileSync` block) with:

```js
const stateDir = join(cacheDir, "state");
let prefix;
try {
  prefix = agentNameToStatePrefix(agentName);
} catch (err) {
  if (!(err instanceof UnsafeAgentNameError)) throw err;
  if (logFn)
    logFn(
      JSON.stringify({
        event: "outpost.state_path.rejected",
        agent: agentName,
      }),
    );
  return;
}
this.#fs.mkdirSync(stateDir, { recursive: true });
this.#fs.writeFileSync(join(stateDir, `${prefix}_last_output.md`), stdout);
```

Update the `updateAgentState` JSDoc to document the new `logFn` param.

Verification: existing state-manager tests pass after Step 7; new test feeds
`../escape` and asserts `writeFileSync` was never called (the mapper rejects
and the method returns before any write) plus one rejection log line, and that
the in-state fields (status/lastDecision/etc.) are still updated.

## Step 5: Route `SocketServer` briefing-file resolution through the mapper

`SocketServer.#resolveBriefingFile` independently computes
`agentName.replace(/-/g, "_") + "_"` to find the per-agent briefing file under
the same `~/.cache/fit/outpost/state/` root — the same unsafe transform
Step 4 replaces, used here on a read path-join. Route it through the shared
mapper so the contract is single-sourced. Modifies
`products/outpost/src/socket-server.js`.

- Add `import { agentNameToStatePrefix, UnsafeAgentNameError } from "./agent-path.js";`.
- In `#resolveBriefingFile`, replace `const prefix = agentName.replace(/-/g, "_") + "_";`
  with a guarded call: compute `agentNameToStatePrefix(agentName)`; on
  `UnsafeAgentNameError`, log via `this.#log` and return `null` (no briefing
  file) rather than joining a traversal path.

Verification: existing socket-server behaviour for valid names unchanged;
add or extend a test feeding a traversal name and asserting the resolved
path stays under `state/` (or returns null). `bun test products/outpost/test/`
passes.

## Step 6: Forward `config.env` on the direct-CLI wake path

Close the CLI path's gap so all three operational wake paths produce identical
spawn env from identical config (spec Success Criterion 2; design Decision #3).
Modifies `products/outpost/src/outpost.js`.

- In the `wake` command handler, the call is currently
  `await agentRunner.wake(args[0], agent, state);` (no `configEnv`). Change it
  to forward the loaded config's env:
  `await agentRunner.wake(args[0], agent, state, config.env);` — `config` is
  already in scope from `const config = loadConfig();` in the same handler.

Verification: the CLI path now passes `config.env` through `buildSpawnEnv`
exactly like the scheduler-tick (`scheduler.js`) and socket
(`socket-server.js`) paths; covered by the cross-path equivalence test in
Step 7.

## Step 7: Add unit tests and cross-path env equivalence test

New files `products/outpost/test/spawn-env.test.js` and
`products/outpost/test/agent-path.test.js`, following the
`node:test` + `node:assert` convention already used in the test dir. Also
update the existing `agent-runner.test.js` env tests and add the cross-path
equivalence test.

- `spawn-env.test.js`: allow-set member passes through; non-member dropped and
  listed in `rejections`; `~/` value home-expanded; `undefined` configEnv
  returns base env with empty rejections; `AGENT_ENV_ALLOWSET` is frozen.
- `agent-path.test.js`: valid hyphenated name → underscore prefix; each of
  `..`, `/`, `\`, leading `~`, NUL, empty string, non-string throws
  `UnsafeAgentNameError`.
- **Existing-test update** (`agent-runner.test.js`): the current env tests use
  `NODE_EXTRA_CA_CERTS` and `TERM` as `configEnv` — both now rejected by the
  allow-set. Change the three tests that pass `configEnv` ("merges configEnv",
  "overrides process.env", "expands ~") to use `ANTHROPIC_API_KEY` (an
  allow-set member). The `~/` expansion test uses
  `ANTHROPIC_API_KEY: "~/certs/x.pem"` purely to exercise expansion. Add one
  test: a non-allow-set key (`NODE_OPTIONS`) is absent from the spawn env and
  yields one rejection log line (capture via a `logFn` spy).
- **Cross-path equivalence** (spec Success Criterion 2): since all three wake
  paths call the one `buildSpawnEnv(configEnv, process.env)` after Steps 3 and
  6, assert equivalence at the contract: a direct `buildSpawnEnv` test plus an
  `AgentRunner.wake` test confirm the same `configEnv` yields the same filtered
  spawn env. The CLI/scheduler/socket sites all forward `config.env` into the
  same function (verified by reading `scheduler.js:189`, `socket-server.js:222`,
  and the Step 6 CLI edit), so the single-function convergence is the property
  under test; no separate per-path integration harness is added.

Verification: `bun test products/outpost/test/` passes (all new and updated
tests green).

## Step 8: Template — defense-in-depth write deny (does NOT fully meet SC#3 — see banner)

Reject the **closable** routes to the two trust roots; the residual
interpreter/redirection routes are out of this plan's reach (banner).
Modifies `products/outpost/templates/.claude/settings.json`.

Add to `permissions.deny`:

```json
"Edit(~/.fit/outpost/**)",
"Edit(~/.cache/fit/outpost/state/**)",
"Bash(sed * ~/.fit/outpost/**)",
"Bash(sed * ~/.cache/fit/outpost/state/**)"
```

What this closes, per the documented permission model:

- **`Edit`/`Write`/`MultiEdit`/`NotebookEdit`** — the `Edit(...)` denies match
  by resolved path with `~`/`**` (proven by the shipped `Edit(~/Library/**)`
  deny) and outrank the broader `Edit(~/.cache/fit/outpost/**)` allow, carving
  out only the daemon-owned `state/` subtree per design Decision #5.
- **Recognized Bash file commands** — `Edit` denies also cover the Bash file
  verbs Claude Code recognizes (`cat`/`head`/`tail`/`sed`), so a `sed -i`
  write to either root is denied by the `Edit` rules; the explicit
  `Bash(sed …)` deny entries are belt-and-suspenders for the recognized set.

What this does **NOT** close (the banner's blocker; needs the SC#3 decision):

- `Bash(bun *)` / `Bash(bunx *)` running a script that calls `writeFileSync`.
- Shell redirection: `echo … > ~/.cache/fit/outpost/state/x`, `tee`, `awk`'s
  `print > file`. These are "arbitrary subprocesses" the Edit deny does not
  reach, and `additionalDirectories` is a file-access grant, not a Bash write
  boundary. Only the sandbox (spec out-of-scope) stops them.

No per-verb path-scoped `Bash(mv …)`/`Bash(cp …)`/`Bash(touch …)` denies are
added: they are trivially bypassed (arg reorder, `cd`-then-write) and would
falsely imply coverage. Do not add them.

Verification: the file parses as JSON (repository check command, or
`node -e "JSON.parse(require('node:fs').readFileSync('products/outpost/templates/.claude/settings.json','utf8'))"`);
manual read confirms both `Edit` denies present and the legitimate sync-subdir
grants (`Edit(~/.cache/fit/outpost/**)` allow, `~/.cache/fit/outpost`
`additionalDirectories`) intact. **SC#3 is only partially met** until the
banner's design/spec decision lands.

## Step 9: Contributor doc `products/outpost/CLAUDE.md`

New file. Per `products/CLAUDE.md`, this is contributor-facing (sibling to
`README.md`, distinct from the agent-template `templates/CLAUDE.md`). Modifies
nothing else.

Content: names `~/.fit/outpost/` and `~/.cache/fit/outpost/state/` as
user-only trust roots; enumerates `AGENT_ENV_ALLOWSET` (currently
`ANTHROPIC_API_KEY`) and where to add keys; states the write-closure layers
honestly: the `Edit`-family deny (`Edit`/`Write`/`MultiEdit`/`NotebookEdit`)
and recognized-Bash-file-command deny on the trust roots (defense-in-depth),
the hardened agent-state writer (Steps 2/4/5) as the load-bearing closure for
the `state/`-traversal attack, and the **known residual** that allow-listed
interpreters (`Bash(bun *)`/`Bash(bunx *)`) and shell redirection bypass
template permissions — only the OS sandbox closes those (banner); states the
contract for reviewers of future `templates/.claude/settings.json` changes
(never add the trust roots to `additionalDirectories` or an `Edit(...)` allow;
treat any new `Bash` interpreter pattern as a trust-boundary regression).
Sign `— Staff Engineer 🛠️`.

Verification: read the file; confirm it names both roots, the allow-set, and
the write-tool list (spec Success Criterion 5).

## Risks

- **`Edit`-family deny path-match must fire on tilde + `**`.** Step 8 relies
  on `Edit(~/.cache/fit/outpost/state/**)` outranking the broader
  `Edit(~/.cache/fit/outpost/**)` allow. This follows the same tilde/`**`
  rules as the shipped `Edit(~/Library/**)` deny, so it is low-risk; the
  implementer should still confirm a write under `state/` is rejected while a
  sibling sync-subdir write is allowed (manual probe in a scratch KB, noted in
  the commit message if it diverges).
- **`updateAgentState` signature change** adds an *optional* parameter; the
  only callers are `AgentRunner.wake` (Step 4) and the tests. Grep confirms no
  other call site, and the optional param keeps the existing 4-arg test calls
  green.

## Execution

Single engineering agent, sequential by dependency: Steps 1–2 (modules) →
Steps 3–6 (call-site routing: runner, state, socket, CLI) → Step 7 (tests) →
Steps 8–9 (template + doc). Step 9 (the doc) could route to
`technical-writer`, but it is short and tightly coupled to the allow-set and
deny model the same agent just wrote, so keep it in one agent.

— Staff Engineer 🛠️
