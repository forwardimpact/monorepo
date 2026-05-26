# Plan 0530 — Agent Profile Main-Thread Binding

## Approach

Introduce a pure `composeProfilePrompt` module inside libeval, then thread it
through the three command call sites (`run`, `supervise`, `facilitate`) and the
two orchestration factories (`supervisor.js`, `facilitator.js`). `AgentRunner`
loses its `agentProfile` field and the SDK `options.agent` spread. The CLI flags
keep their surface at the boundary but internally feed `composeProfilePrompt` —
nothing else. Mode-specific trailers (`AGENT_SYSTEM_PROMPT`,
`FACILITATED_AGENT_SYSTEM_PROMPT`, `FACILITATOR_SYSTEM_PROMPT`,
`SUPERVISOR_SYSTEM_PROMPT`) move from the `append` slot into the composer's
`trailer` option so today's working behaviour in facilitated/supervised modes is
preserved bit-for-bit.

## Ordered Steps

### Step 1 — New module `src/profile-prompt.js` + unit tests

**Create** `/home/user/monorepo/libraries/libeval/src/profile-prompt.js`
exporting one function:

```
composeProfilePrompt(name, { profilesDir, trailer })
  → { type: "preset", preset: "claude_code", append: string }
```

Behaviour:

- Reads `join(profilesDir, `${name}.md`)` with `readFileSync(path, "utf8")`
  using `node:path`'s `join`. Missing file propagates `ENOENT` unchanged (first
  safety net).
- Strips YAML frontmatter. Recognise the fence pattern: file begins with
  `---\n`, a second `\n---\n` terminates it. If the file lacks frontmatter, the
  entire body is used.
- `append` = body (trimmed of leading/trailing whitespace) + `"\n\n"` +
  `trailer` when trailer is a non-empty string; otherwise just the body.
- No fallback, no default profile, no catch-around-read.

**Export** from `/home/user/monorepo/libraries/libeval/src/index.js` by adding
`export { composeProfilePrompt } from "./profile-prompt.js";` alongside the
existing `createAgentRunner` re-export. No other index.js lines change.

**Create** `/home/user/monorepo/libraries/libeval/test/profile-prompt.test.js`.
Fixtures live alongside in `test/fixtures/profile-prompt/` — one with
frontmatter, one without. Tests:

- Returns the `{ type: "preset", preset: "claude_code", append }` shape.
- Strips frontmatter (the `append` does not contain `---` or YAML keys from the
  fence).
- Concatenates trailer with blank-line separator when provided; no trailing
  whitespace mismatch when omitted.
- Throws `ENOENT` for a missing profile file.
- **Spec SC#1 coverage (loop test):** Resolve the profiles directory via
  `fileURLToPath(new URL("../../../.claude/agents", import.meta.url))` so the
  path is anchored to the test file's location and independent of `bun test`
  cwd. `readdirSync` that dir, filter `.md` files (no subdirectory filtering
  needed — `.claude/agents/references/` is a directory and will not match). For
  each file assert `composeProfilePrompt(basename, { profilesDir }).append`
  contains a non-trivial substring of the real profile body (e.g. first 40 chars
  of the file past frontmatter). This walks every live profile and fails the
  build if any profile stops being loadable.

### Step 2 — `AgentRunner` cleanup (`src/agent-runner.js`)

Depends on: nothing (structural).

- Remove `agentProfile: deps.agentProfile ?? null` from `applyDefaults`.
- Remove the `@param {string} [deps.agentProfile]` JSDoc line.
- In `run()`, remove the line
  `...(this.agentProfile && { agent: this.agentProfile }),`.
- `resume()` never set `agent`; no change there.

After this, `AgentRunner` has no filesystem or profile concerns. The only way
profile content enters the SDK is via the caller-provided `systemPrompt`.

### Step 3 — Wire `commands/run.js` through the composer

Depends on: Step 1.

Before (line 79–90):

```
const { query } = await import("@anthropic-ai/claude-agent-sdk");
const runner = createAgentRunner({
  cwd, query, output: devNull, model, maxTurns, allowedTools,
  onLine, settingSources: ["project"],
  agentProfile,
});
```

After:

```
import { composeProfilePrompt } from "../profile-prompt.js";
...
const systemPrompt = agentProfile
  ? composeProfilePrompt(agentProfile, { profilesDir: resolve(cwd, ".claude/agents") })
  : undefined;
const { query } = await import("@anthropic-ai/claude-agent-sdk");
const runner = createAgentRunner({
  cwd, query, output: devNull, model, maxTurns, allowedTools,
  onLine, settingSources: ["project"],
  systemPrompt,
});
```

The `agentProfile` local stays (read from `--agent-profile`); it feeds the
composer and nothing else. `parseRunOptions` is unchanged.

### Step 4 — Wire `supervisor.js` through the composer

Depends on: Step 1.

At the two `systemPrompt:` blocks inside `createSupervisor` (one for the agent
runner, one for the supervisor runner — currently at L406 and L437):

- Remove `agentProfile` and `supervisorProfile` from the `createAgentRunner`
  argument objects.
- Replace the agent runner's
  `systemPrompt: { type: "preset", preset: "claude_code", append: AGENT_SYSTEM_PROMPT }`
  with
  ```
  systemPrompt: agentProfile
    ? composeProfilePrompt(agentProfile, { profilesDir, trailer: AGENT_SYSTEM_PROMPT })
    : { type: "preset", preset: "claude_code", append: AGENT_SYSTEM_PROMPT },
  ```
- Same shape for the supervisor runner using `supervisorProfile` and
  `SUPERVISOR_SYSTEM_PROMPT` as trailer.
- Add `profilesDir` to the factory's dep signature with default
  `resolve(supervisorCwd, ".claude/agents")`; accept an override from callers
  for test injection symmetry. **Resolution rule:** `profilesDir` is a single
  value for the whole session, resolved from the orchestrator's cwd (the
  supervisor's cwd here), not from the agent runner's cwd — profiles are
  project-level content and must not follow an agent into a sandbox or worktree.
- Import `composeProfilePrompt` from `./profile-prompt.js`.

The `AGENT_SYSTEM_PROMPT` / `SUPERVISOR_SYSTEM_PROMPT` exports stay — they are
consumed here as trailers, not as standalone `append` values. The JSDoc on
`createSupervisor`'s `agentProfile` / `supervisorProfile` params is updated to
say "resolved into the main-thread system prompt via `composeProfilePrompt`"
rather than "passed to Claude as `--agent`".

### Step 5 — Wire `facilitator.js` through the composer

Depends on: Step 1.

At the two `systemPrompt:` blocks inside `createFacilitator` — the per-agent
runner inside `agents.map(...)` (currently at L475) and the facilitator runner
itself (currently at L495):

- For each agent runner in the `agents.map(...)` block: remove
  `agentProfile: config.agentProfile`; replace the static `systemPrompt` with
  `composeProfilePrompt(config.agentProfile, { profilesDir, trailer: FACILITATED_AGENT_SYSTEM_PROMPT })`
  when `config.agentProfile` is set, otherwise keep today's plain-trailer shape.
- Facilitator runner: same replacement with `facilitatorProfile` and
  `FACILITATOR_SYSTEM_PROMPT` as trailer.
- Add `profilesDir` to the factory's dep signature with default
  `resolve(facilitatorCwd, ".claude/agents")`. Same resolution rule as Step 4:
  `profilesDir` is a single value for the whole session, resolved from
  `facilitatorCwd`, not from each agent's `config.cwd` (which may point to
  per-agent sandboxes).

### Step 6 — CLI flag audit (`bin/fit-eval.js`, `commands/*.js`)

Depends on: Steps 3–5.

Audit-only step — no code change expected. Verify — and record the findings in
the commit message — that:

- `bin/fit-eval.js` still exposes `--agent-profile`, `--supervisor-profile`,
  `--facilitator-profile`, `--agent-profiles` (unchanged — that is the CLI
  boundary per the design).
- No command file passes `options.agent` or the SDK's top-level `agent` option
  into `createAgentRunner`. The `agentProfile` locals in `run.js`,
  `supervise.js`, and `facilitate.js` feed only `composeProfilePrompt` or the
  factory signatures updated in Steps 4 and 5.
- Factory signatures in `supervisor.js` and `facilitator.js` default
  `profilesDir` to `<cwd>/.claude/agents`, so command files pass nothing new
  across the boundary.

If the audit uncovers a path the plan missed, surface it as a deviation note on
the implementation PR rather than editing silently.

### Step 7 — Grep verification for Spec SC#2

Depends on: Steps 2–6.

Spec SC#2 targets the SDK binding surface, not the `agentProfile` identifier
used as a local or CLI argument name (which is fine to keep — it feeds
`composeProfilePrompt` and nothing else). The greps below must return zero
matches inside `libraries/libeval/src/` and `libraries/libeval/bin/`:

```
# SDK query option shape: the "agent:" key bound to an identifier,
# matching across lines so a multi-line object literal cannot hide a
# regression. Captures `agent: agentProfile`, `agent: this.agentProfile`,
# and multi-line `{\n  agent: foo\n}` variants.
rg -Un --multiline --pcre2 "(?:^|[{,])\s*\n?\s*agent:\s*[A-Za-z_.]" \
  libraries/libeval/src libraries/libeval/bin

# Old extraArgs shape, in case any path still forwards the flag.
rg -n "extraArgs.*agent" libraries/libeval/src libraries/libeval/bin

# Literal --agent flag pass-through.
rg -n '"--agent"' libraries/libeval/src libraries/libeval/bin
```

Then open every file under `libraries/libeval/src` and search visually for any
`agent:` key in an options object the implementer did not expect — regex
coverage is a floor, not a ceiling.

The `agentProfile` name itself remains (as a variable holding the profile name
to hand to `composeProfilePrompt`) and is not searched for. Tests and fixtures
are out of scope for these greps. Record the exact commands in the commit body
so the reviewer can replay them.

## Files touched

- **Created:** `libraries/libeval/src/profile-prompt.js`,
  `libraries/libeval/test/profile-prompt.test.js`,
  `libraries/libeval/test/fixtures/profile-prompt/*`.
- **Modified:** `libraries/libeval/src/agent-runner.js`,
  `libraries/libeval/src/commands/run.js`,
  `libraries/libeval/src/supervisor.js`, `libraries/libeval/src/facilitator.js`,
  `libraries/libeval/src/index.js` (export).
- **Deleted:** none.
- **Not modified:** `libraries/libeval/src/commands/supervise.js` and
  `libraries/libeval/src/commands/facilitate.js` are inspected in Step 6 but do
  not need edits given the `profilesDir` default in the factory signatures.

## Test additions

- `test/profile-prompt.test.js` — unit tests for the composer, including the
  SC#1 loop over `.claude/agents/*.md`.
- A grep at plan-writing time (`rg -n agentProfile libraries/libeval/test/`)
  returns zero matches today, so **no existing test files need updates**. The
  implementer should re-run that grep after Step 2 to confirm the assumption
  still holds; if any test has gained an `agentProfile` stub in the meantime,
  update it to stop passing the field.

## Libraries used

None. `composeProfilePrompt` uses only `node:fs` (`readFileSync`) and
`node:path` (`join`). No `@forwardimpact/lib*` package is consumed. This is
intentional — the composer stays a ~30-line pure function so tests can exercise
it without DI scaffolding.

## Risks

- **SDK preset-composition semantics.** The design asserts that
  `{ type: "preset", preset: "claude_code", append: body + trailer }` composes
  profile + mode-boilerplate correctly at runtime. This holds in today's
  facilitated and supervised runs (Evidence table, spec.md) but is not directly
  unit-testable without a live SDK call. SC#3 is the end-to-end verifier — first
  night-shift run after merge either emits voice markers or does not.
- **Test stubs for `AgentRunner` (verified absent).** A grep at plan-writing
  time showed zero test files reference `agentProfile`, so there is nothing to
  retrofit. Risk retained as a re-verification checkpoint: if a test gained an
  `agentProfile` stub between plan writing and implementation, the
  `applyDefaults` removal in Step 2 will make that test silently pass without
  binding and it must be updated.
- **Non-main-thread uses of `options.agent`.** Subagent dispatch via the
  `Task`/`Agent` tool is out of scope (spec § Excluded), but a stray
  `options.agent` inside supervisor/facilitator code paths that is _not_
  main-thread-binding-related would also be removed by Step 2. The greps in Step
  7 flag any such leak for conscious decision at implementation time.
- **Profile directory location.** The composer takes `profilesDir` as an input
  and defaults to `<cwd>/.claude/agents` at each call site. A run whose `cwd` is
  not the monorepo root (test harness, custom invocation) will receive an
  `ENOENT` — surfaced exactly as the spec's first safety net requires.

## Execution recommendation

Single `staff-engineer` run on branch
`feat/530-agent-profile-main-thread-binding`. Do not decompose. The change is
tightly coupled (one module + five wiring sites + the test file) and the whole
diff must land together so the Step 7 greps pass. Steps 1 and 2 are independent
prerequisites; Steps 3, 4, and 5 each depend on Step 1 only and may be completed
in any order; Step 6 is an audit that depends on Steps 3–5; Step 7 is the final
grep check. Implementer runs `bun run check` and `bun run test` after each
wiring step and once at the end.

SC#3 (voice-marker appearance in scheduled runs) is end-to-end and observed
after the fix lands in `main`. Note it in the implementation PR body as a
post-merge verification step against the next night-shift traces; do not block
PR merge on it.

## Self-review

Ran the DO-CONFIRM checklist:

- [x] Approach and rationale stated up front.
- [x] Changes concrete — file paths, function names, before/after snippets.
- [x] Blast radius visible — "Files touched" lists created/modified/deleted.
- [x] Ordering explicit with stated dependencies on each step.
- [x] Non-obvious decisions explained (trailer semantics, no libs, why
      single-agent).
- [x] Risks surfaced — SDK composition, test stubs, stray `options.agent`,
      profileDir location.
- [x] Libraries-used section present — states "None" explicitly with rationale.
- [x] Execution recommendation present — single agent, no decomposition, SC#3
      deferred.

**Self-caught findings:**

- None material. One caveat: the test in Step 1 for SC#1 asserts the presence of
  a body substring, not a voice marker. Voice markers (the em-dash-plus-emoji
  trailers in each profile) live in the body and would be a tighter assertion,
  but the profile files do not share a common marker shape, so per-profile
  substrings are the durable choice. The alternative — a per-profile hardcoded
  list of expected markers — duplicates knowledge already in the `.md` files and
  would drift. Flag this trade-off to the implementer; they may tighten the
  assertion if a stable per-profile signature emerges.

— Staff Engineer 🛠️
