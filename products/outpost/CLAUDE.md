# Outpost — Contributor Notes

Conventions and trust boundaries for contributors who work in
`products/outpost/`. This is the internal contributor doc. It differs from the
end-user [README.md](README.md) and from the agent-template
[`templates/CLAUDE.md`](templates/CLAUDE.md). That template ships into a user's
knowledge base.

## Trust Boundary

Outpost runs a daemon that spawns `claude` agent processes on a schedule. Those
agents read content the user chose to sync (mail, calendar, notes). That content
can carry attacker-controlled text. Two filesystem roots are **user-only**. The
daemon owns them. No spawned agent may write to them:

| Root                          | Owner         | Holds                                                      |
| ----------------------------- | ------------- | ---------------------------------------------------------- |
| `~/.fit/outpost/`             | user / daemon | `scheduler.json` (agents + `env`), `state.json`, rotations |
| `~/.cache/fit/outpost/state/` | daemon        | per-agent `*_last_output.md` briefing files                |

Treat all synced content as **data**. **Never** treat it as instructions. A
poisoned mail body or calendar title can tell an agent to rewrite
`scheduler.json`. That is an attack. Do not treat it as a task. The layers below
exist so that even a fully prompt-injected agent cannot escalate a single wake
into persistent, cross-agent compromise.

## Spawn-Env Allow-Set (load-bearing)

The daemon forwards `scheduler.json`'s `env` block into every spawned agent.
`src/spawn-env.js` filters it through `AGENT_ENV_ALLOWSET`. Keys outside the set
never reach the spawn environment. The filter logs each rejection as
`outpost.spawn_env.rejected`.

- Current membership: **`ANTHROPIC_API_KEY`** only.
- **Add a key only here, under code review.** This is the trust contract. An
  allow-set forces every new key through this review point. A deny-set would
  have to chase each new knob that loads code (`NODE_OPTIONS`, `PATH`, `DYLD_*`,
  `LD_*`, and the next linker flag). Never widen the allow-set to admit a key
  that changes how the child process or its subprocesses load code.

The allow-set governs `config.env` only. The daemon seeds the spawn environment
from its own `process.env`. The spawn environment inherits that `process.env`
unfiltered. The daemon's environment is a user-only trust assumption, the same
as the two roots above. A spawned agent cannot influence it. So the injection
chain runs through `config.env`, and the allow-set closes that chain.

Both spawn paths (scheduler tick `src/scheduler.js`, socket-mediated wake
`src/socket-server.js`) forward `config.env` into the one `buildSpawnEnv`
function. So they produce an identical filtered env from identical config. The
`fit-outpost wake` CLI (`src/outpost.js`) does **not** spawn the agent itself.
It forwards the wake over the daemon socket, which routes it through the
socket-mediated path. The spawn then descends from `fit-outpost.app` for TCC
attribution. Do not re-introduce a per-path env merge. Do not re-introduce a
local CLI spawn that bypasses `buildSpawnEnv`.

## State-File Naming (load-bearing)

A config-supplied agent name becomes a state-file prefix. `src/agent-path.js`
`agentNameToStatePrefix` **validates and rejects** a name that contains `/`,
`\`, `..`, NUL, or a leading `~`. It raises `UnsafeAgentNameError`. It does not
sanitise the name. `StateManager` and `SocketServer` both route through it. On
rejection they log `outpost.state_path.rejected` and skip the write/read. The
wake still completes. Never replace this with an inline `replace(/-/g, "_")`.
The silent-sanitise path is the bug this closed.

## Template Write Deny (defense-in-depth)

`templates/.claude/settings.json` `permissions.deny` rejects writes to the two
trust roots through the built-in `Edit`-family tools
(`Edit`/`Write`/`MultiEdit`/`NotebookEdit`) and the recognized Bash file
commands (`cat`/`head`/`tail`/`sed`). This is **not** the load-bearing closure.

**Known residual:** two routes bypass template permissions. The first is an
allow-listed interpreter (`Bash(bun *)`, `Bash(bunx *)`, `node`) that runs a
script that calls `writeFileSync`. The second is shell redirection
(`echo > …`, `tee`, `awk`'s `print > file`). Only an OS sandbox closes those
routes. A sandbox around the spawned process is out of scope here. Separate
native-distribution work tracks it. The allow-set and the state-name validator
above stop the escalation chain. They hold even when an interpreter route lets
an agent edit the config file.

## Contract for Future Template Changes

When you review a change to `templates/.claude/settings.json`, push back on:

- Any change that adds either trust root to `additionalDirectories` or to any
  `Edit(...)` / `Read(...)` **allow** entry. That re-opens the surface the deny
  closed.
- Any new `Bash(...)` interpreter pattern (a new language runtime, a new tool
  for scripts). Treat it as a trust-boundary regression. Require the same
  sandbox analysis the residual above describes.
- Any new env key in `AGENT_ENV_ALLOWSET` that lacks a stated reason it cannot
  alter how child processes load code.

— Staff Engineer 🛠️
