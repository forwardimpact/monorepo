# Outpost — Contributor Notes

Conventions and trust boundaries for contributors working in
`products/outpost/`. This is the internal contributor doc, distinct from the
end-user [README.md](README.md) and from the agent-template
[`templates/CLAUDE.md`](templates/CLAUDE.md) that ships into a user's knowledge
base.

## Trust Boundary

Outpost runs a daemon that spawns `claude` agent processes on a schedule. Those
agents read content the user chose to sync (mail, calendar, notes), which can
carry attacker-controlled text. Two filesystem roots are **user-only** — the
daemon owns them, and no spawned agent may write to them:

| Root                          | Owner         | Holds                                                      |
| ----------------------------- | ------------- | ---------------------------------------------------------- |
| `~/.fit/outpost/`             | user / daemon | `scheduler.json` (agents + `env`), `state.json`, rotations |
| `~/.cache/fit/outpost/state/` | daemon        | per-agent `*_last_output.md` briefing files                |

Treat all synced content as **data, never instructions**. A poisoned mail body
or calendar title that tells an agent to rewrite `scheduler.json` is an attack,
not a task. The layers below exist so that even a fully prompt-injected agent
cannot escalate a single wake into persistent, cross-agent compromise.

## Spawn-Env Allow-Set (load-bearing)

The daemon forwards `scheduler.json`'s `env` block into every spawned agent.
`src/spawn-env.js` filters it through `AGENT_ENV_ALLOWSET` — keys outside the
set never reach the spawn environment, and each rejection is logged as
`outpost.spawn_env.rejected`.

- Current membership: **`ANTHROPIC_API_KEY`** only.
- **Add a key only here, under code review.** This is the trust contract. An
  allow-set rather than a deny-set forces every new key through this review
  point. A deny-set would have to keep chasing each new code-loading knob
  (`NODE_OPTIONS`, `PATH`, `DYLD_*`, `LD_*`, and the next linker flag). Never
  widen the allow-set to admit a key that changes how the child process or its
  subprocesses load code.

The allow-set governs `config.env` only. The spawn environment is seeded from
the daemon's own `process.env`, which is inherited unfiltered. The daemon's
environment is a user-only trust assumption, the same as the two roots above. A
spawned agent cannot influence it, so the injection chain runs through
`config.env`, which the allow-set closes.

Both spawn paths (scheduler tick `src/scheduler.js`, socket-mediated wake
`src/socket-server.js`) forward `config.env` into the one `buildSpawnEnv`
function, so they produce an identical filtered env from identical config. The
`fit-outpost wake` CLI (`src/outpost.js`) does **not** spawn itself — it
forwards the wake over the daemon socket (so the spawn descends from
`fit-outpost.app` for TCC attribution), which routes it through the
socket-mediated path. Do not re-introduce a per-path env merge, and do not
re-introduce a local CLI spawn that would bypass `buildSpawnEnv`.

## State-File Naming (load-bearing)

A config-supplied agent name becomes a state-file prefix. `src/agent-path.js`
`agentNameToStatePrefix` **validates and rejects** names containing `/`, `\`,
`..`, NUL, or a leading `~` (raising `UnsafeAgentNameError`) rather than
sanitising them. `StateManager` and `SocketServer` both route through it; on
rejection they log `outpost.state_path.rejected` and skip the write/read — the
wake still completes. Never replace this with an inline `replace(/-/g, "_")`;
the silent-sanitise path is the bug this closed.

## Template Write Deny (defense-in-depth)

`templates/.claude/settings.json` `permissions.deny` rejects writes to the two
trust roots via the built-in `Edit`-family tools
(`Edit`/`Write`/`MultiEdit`/`NotebookEdit`) and the recognized Bash file
commands (`cat`/`head`/`tail`/`sed`). This is **not** the load-bearing closure.

**Known residual:** an allow-listed interpreter (`Bash(bun *)`, `Bash(bunx *)`,
`node`) running a script that calls `writeFileSync`, and shell redirection
(`echo > …`, `tee`, `awk`'s `print > file`), both bypass template permissions.
Only an OS sandbox closes those routes. Sandboxing the spawned process is out of
scope here and is tracked as separate native-distribution work. The allow-set
and state-name validator above are what actually stop the escalation chain even
when an interpreter route lets an agent edit the config file.

## Contract for Future Template Changes

When reviewing a change to `templates/.claude/settings.json`, push back on:

- Adding either trust root to `additionalDirectories` or to any `Edit(...)` /
  `Read(...)` **allow** entry — that re-opens the surface the deny closed.
- Any new `Bash(...)` interpreter pattern (a new language runtime, a new
  scripting tool) — treat it as a trust-boundary regression and require the same
  sandbox analysis the residual above describes.
- Adding an env key to `AGENT_ENV_ALLOWSET` without a stated reason it cannot
  alter child-process code loading.

— Staff Engineer 🛠️
