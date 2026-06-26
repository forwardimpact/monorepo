# Plan 2120-a — Per-agent least-privilege execution for Outpost

Implements [spec.md](spec.md) per [design-a.md](design-a.md).

## Approach

Add a mandatory `privilege` field (`full` | `restricted`) to each `scheduler.json`
agent, resolve it once at the `AgentRunner.wake` chokepoint both spawn paths
already funnel through, and translate it to the hop-2 `disclaim` flag on the
libmacos `spawn` primitive (`full` → `0`, inherit `fit-outpost.app`;
`restricted` → `1`, self-responsible so the app's grants do not extend). A
missing or invalid level throws, is logged as `outpost.privilege.rejected`, and
skips the wake — no default. The default knowledge base moves unconditionally
from `~/Documents/Personal` (TCC-protected) to `~/.local/share/fit/outpost/kb`
(non-TCC) so a self-responsible `restricted` agent works with no grant. Docs,
installer copy, and the TCC runbook follow the relocation and gain the
`restricted`-denial probe.

Libraries used: libmacos (spawn).

## Step 1 — Add a `disclaim` input to the libmacos spawn primitive

Let the spawn primitive carry the per-wake responsibility setting instead of a
hardcoded `0`.

- Modified: `libraries/libmacos/src/posix-spawn.js`

Resolving the design's delegated arg-shape choice (design-a.md:43): a **trailing
positional** `disclaim`, defaulted to `0`, over an options bag — positional is
the smaller change because every present caller already passes `runtime` as the
5th positional arg and adding a 6th defaulted arg leaves those call sites
untouched, whereas an options bag would still mean editing the call site that
sets it. So `disclaim` becomes the 6th positional (`runtime` stays 5th):

```js
export function spawn(executable, args, env, cwd, runtime, disclaim = 0) {
  // …
  setDisclaim(attr, disclaim); // was setDisclaim(attr, 0)
```

Update the function's JSDoc and the inline comment above the call to describe the
input: `0` keeps the parent chain's responsible process (`fit-outpost.app`); `1`
makes the child responsible for itself.

Verification: `bun test libraries/libmacos/test/tcc-responsibility.test.js` stays
green — the `createTccSpawn` wrapper calls `spawn` with its 5 existing positional
args (`tcc-responsibility.js:17-23`), so `disclaim` defaults to `0` there. That
test does **not** exercise the new param, and the wake path calls `spawnMod.spawn`
directly (not through the wrapper), so the libmacos primitive's actual FFI
`setDisclaim(attr, 1)` behaviour has **zero automated coverage**: no unit test
imports `posix-spawn.js` (it `dlopen`s `bun:ffi` at module load and is not
node/Linux-importable, which is why no `posix-spawn.test.js` exists). The
disclaim **value** is asserted at the AgentRunner mock boundary (Step 3); the
disclaim **effect** rests solely on the manual runbook (Step 6).

## Step 2 — Add the privilege resolver module

A pure resolver over one agent's config, patterned on `posture.js` but with no
coercion and no default.

- Created: `products/outpost/src/privilege.js`
- Created: `products/outpost/test/privilege.test.js`

```js
/** The two privilege levels, in declaration order. */
export const PRIVILEGE_LEVELS = ["full", "restricted"];

/**
 * Resolve an agent's declared privilege level. The level is mandatory: a
 * missing or unrecognised value throws — there is no default.
 */
export function resolvePrivilege(agent) {
  const level = agent?.privilege;
  if (!PRIVILEGE_LEVELS.includes(level)) {
    throw new Error(
      `invalid privilege "${level}"; expected one of ${PRIVILEGE_LEVELS.join(", ")}`,
    );
  }
  return level;
}

/** Map a level to the hop-2 disclaim flag: restricted self-disclaims (1). */
export function disclaimFor(level) {
  return level === "restricted" ? 1 : 0;
}
```

Tests cover: each level resolves to itself; missing, `undefined`, and an unknown
string each throw; `disclaimFor` returns `0` for `full` and `1` for `restricted`;
`PRIVILEGE_LEVELS` is exactly `["full", "restricted"]`.

Verification: `bun test products/outpost/test/privilege.test.js`.

## Step 3 — Resolve and enforce the level at the wake chokepoint

Resolve the level once at the top of `wake`, fail closed on a bad value, log the
resolved level, and thread the disclaim flag into the spawn call.

- Modified: `products/outpost/src/agent-runner.js`

Import `resolvePrivilege, disclaimFor` from `./privilege.js`. At the start of
`wake(agentName, agent, state, configEnv)`, before the `kb` guards:

```js
let level;
try {
  level = resolvePrivilege(agent);
} catch (err) {
  this.#log(
    JSON.stringify({
      event: "outpost.privilege.rejected",
      agent: agentName,
      error: err.message,
    }),
  );
  return;
}
```

After the kb checks pass (alongside the existing `Waking agent` line), emit the
resolved level so an operator and the runbook can grep it:

```js
this.#log(
  JSON.stringify({
    event: "outpost.privilege.resolved",
    agent: agentName,
    level,
  }),
);
```

Pass the flag as the new trailing arg of the spawn call:

```js
const { pid, stdoutFile, stderrFile } = spawnMod.spawn(
  claude, spawnArgs, env, kbPath, this.#runtime, disclaimFor(level),
);
```

- Modified: `products/outpost/test/agent-runner.test.js`

Two changes. First, widen the shared `createMockSpawn` helper (`spawn(executable,
args, env, cwd)` at line 48) to also capture the 5th (`runtime`) and 6th
(`disclaim`) positional args, since the privilege tests assert the disclaim value
and the current helper drops everything past the 4th arg. Second, add a valid
`privilege` to **every** `wake` agent fixture across all describe blocks
(`#buildSpawnEnv`, `killActiveChildren`, `posture gate` — the bare
`{ kb: TEST_KB }` literals at lines 111–380); without a level each now throws in
`resolvePrivilege`, logs `outpost.privilege.rejected`, and skips the spawn,
breaking those suites.

- Created: `products/outpost/test/agent-runner-privilege.test.js`

A new sibling (keeps `agent-runner.test.js` under the 400-LOC ceiling; mirrors
the existing posture-gate family; reuses the widened `createMockSpawn` via a
shared `test/helpers.js` if extraction is cleaner than duplication) asserting: a
`full` agent passes disclaim `0` to the mock `spawn` (6th positional arg) and
logs `outpost.privilege.resolved` with `level: "full"`; a `restricted` agent
passes `1` and logs `level: "restricted"`; an agent with no `privilege` logs one
`outpost.privilege.rejected` event and the mock `spawn` is never called; an
invalid `privilege` string does the same.

Verification: `bun test products/outpost/test/agent-runner.test.js
products/outpost/test/agent-runner-privilege.test.js`.

## Step 4 — Ship explicit levels and the relocated KB path in the bundled config

Pin a level on every shipped agent and move the bundled KB path off Documents.

- Modified: `products/outpost/config/scheduler.json`

Each agent gains `"privilege"`, classified by whether its job reads the live
mail/calendar stores or sends mail (→ `full`) or only the synced cache and KB
(→ `restricted`); every `"kb"` becomes `"~/.local/share/fit/outpost/kb"`:

| Agent | Job basis (template skills) | Level |
| --- | --- | --- |
| `postman` | `sync-apple-mail` (live mail read), `draft-emails` (AppleScript send) | `full` |
| `concierge` | `sync-apple-calendar` (live calendar read) | `full` |
| `librarian` | `extract-entities`, `organize-files` (synced cache → KB) | `restricted` |
| `chief-of-staff` | no sync/send skills; synthesises synced email/calendar/KB state | `restricted` |
| `recruiter` | `req-track`/`req-screen`/`req-assess` (KB) | `restricted` |
| `head-hunter` | `req-scan` of public network sources | `restricted` |

- Created: `products/outpost/test/config-shape.test.js`

`outpost-cli.test.js` is a CLI-help fixture test with no config-loading seam, so
add a dedicated test that reads the bundled `config/scheduler.json` and, for
every agent, asserts (a) `privilege` is one of `PRIVILEGE_LEVELS` (imported from
`../src/privilege.js`) and (b) `kb` does not start with a TCC-protected prefix.
The bundled paths are stored `~`-prefixed and unexpanded, so the check is a
literal `startsWith` against `~/Documents`, `~/Desktop`, `~/Downloads`,
`~/Library`. This is a config-shape guard on the shipped file only — it does not
add a runtime path constraint in the code.

Verification: `bun test products/outpost`.

## Step 5 — Relocate the default KB in the installer

- Modified: `products/outpost/pkg/macos/postinstall`

`DEFAULT_KB="$REAL_HOME/.local/share/fit/outpost/kb"` (was
`$REAL_HOME/Documents/Personal`). The `init "$DEFAULT_KB"` call already creates
the directory tree, so the relocated parent is created on install.

Verification: no CI for the pkg path; covered by the runbook (Step 6) and a
`shellcheck` pass.

## Step 6 — Extend the TCC verification runbook

- Modified: `products/outpost/macos/TCC-VERIFICATION.md`

Add a new axis: with one `fit-outpost.app` grant, wake a `restricted` agent that
deliberately probes a Full Disk Access read and a `full` agent that reads the
live store; record that the `com.apple.TCC` stream shows an explicit
`SystemPolicyAllFiles` **Denied** for the `restricted` probe and **Allowed** for
the `full` agent (a positive probe so denial is distinguishable from "never
attempted"). The KB is no longer in a TCC folder, so update the services table's
KB row to the relocated non-TCC path noting a `restricted` agent needs no grant
there, and **remove** the now-obsolete `Files & Folders (Documents)` artifacts
that tracked the old location: the `tccutil reset SystemPolicyDocumentsFolder`
line (TCC-VERIFICATION.md:69), the Documents grant in step (b), and the
`Files & Folders (Documents KB)` Results field. Add the new `restricted`-probe
fields to the Results block.

Verification: documentation review against spec Success Criteria 1–3.

## Step 7 — Update end-user docs and installer copy

- Modified: `websites/fit/outpost/index.md`,
  `websites/fit/docs/getting-started/engineers/outpost/index.md`,
  `products/outpost/pkg/macos/welcome.html`,
  `products/outpost/pkg/macos/conclusion.html`,
  `products/outpost/pkg/macos/uninstall.sh`

Relocate every `~/Documents/Personal` and `~/Documents/Team` reference to
`~/.local/share/fit/outpost/kb` — including the `npx fit-outpost init …` command
examples (product page line 153, getting-started line 55), the `welcome.html`
default-KB line, the `conclusion.html` `cd …` and `identify.sh` paths, and the
`uninstall.sh` "data preserved" / `rm -rf` lines. In the product page § macOS Privacy & Security
and the getting-started page, add a short description of which agents need which
macOS permissions: `full` agents (mail/calendar sync and mail send) read the live
stores under the one `fit-outpost.app` grant; `restricted` agents operate on the
synced cache and the relocated KB and need no grant.

Verification: `bunx fit-doc serve --src=websites/fit` builds without error;
manual review of installer copy.

## Risks

- **Coupled libmacos release.** Step 1 changes `@forwardimpact/libmacos`, which
  releases separately. In-monorepo `bun test` sees the change immediately through
  the workspace link, so the verification commands here need no republish. But
  shipping to npm consumers requires a coupled `kata-release-cut` libmacos version
  bump plus a lockfile update before outpost's `^0.1.0` range resolves the new
  `spawn`; that release coordination is a separate post-merge step, not part of
  implementation. The trailing `disclaim = 0` default keeps the change
  backward-compatible for any other libmacos consumer.
- **Hand-migration of existing installs (intended clean break).** Once this
  lands, an existing `scheduler.json` with undeclared levels is refused at wake
  until an operator adds a level and moves the KB off `~/Documents` — spec §
  Out of scope. The runbook and docs must call this out; there is no fallback.
- **TCC denial is CI-unverifiable.** Code tests assert only the disclaim arg and
  the reject/resolve events; Success Criteria 1–3 rest entirely on the manual
  runbook (Step 6), the durable guard.

## Execution

Single PR (`plan(2120): …`). Steps 1–5 are coupled code changes (libmacos
signature ↔ wake threading; bundled-config paths ↔ resolver) — route to an
engineering agent (`staff-engineer`). Steps 6–7 (runbook, docs, installer copy)
share no code with 1–5 and can run in parallel — route to `technical-writer` —
but must land in the same PR so the relocated path agrees across config, code,
and docs.
