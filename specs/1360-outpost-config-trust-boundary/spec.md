# Spec 1360 — Outpost Scheduler-Config Trust Boundary

## Problem

Outpost treats the user's scheduler config (`~/.fit/outpost/scheduler.json`) as
trusted, user-owned input, but the runtime template the agent team inherits
lets a compromised agent rewrite that file and inject arbitrary environment
variables that are then merged into every subsequent agent spawn — turning a
single-wake prompt-injection foothold into persistent, cross-agent code
execution under the user's account.

The chain runs end-to-end with no privileged access on a machine that has
Outpost installed and configured to sync at least one attacker-reachable
source (default install syncs Apple Mail, which accepts mail from any sender):

| Step | Actor | Action |
|---|---|---|
| 1 | Remote attacker | Plants prompt-injection content in any source the agent team syncs (mail body, calendar event title, Teams chat message). |
| 2 | Postman / concierge / librarian agent (5–15 min cadence) | Sync skills surface the content into the local KB; `extract-entities` then integrates it into the knowledge graph that all other agents read while planning their wakes. |
| 3 | Any subsequent agent wake | Reads the malicious content while choosing its next action; the prompt-injection instructs the agent to use one of the allow-listed shell-tool patterns the template carries to write a new `scheduler.json` whose `env` block carries attacker-chosen environment variables. |
| 4 | Daemon scheduler tick (60 s loop) or daemon socket-mediated wake | Reloads `scheduler.json`, hands `config.env` to the agent-spawn-env build step, and merges every entry into the spawn environment without filtering. |
| 5 | Spawned `claude` process | Honors the injected variables. The Node-based `claude` distribution honors `NODE_OPTIONS=--require=…` directly; native subprocesses spawned by `claude` honor `DYLD_INSERT_LIBRARIES=…` on macOS where the parent process's hardened-runtime weakeners apply; `PATH` overrides redirect downstream tools. |

Three surfaces compound to make the chain reachable:

- **Env-merge has no filter.** The agent-spawn env-build step accepts any key
  in `config.env` and writes it directly into the spawn environment. There
  is no allow-set, no deny-set, no logging on unfamiliar keys. The two
  daemon-mediated wake paths (scheduler tick and socket-handler wake)
  forward `config.env`; the direct `fit-outpost wake <agent>` CLI does not.
  Any fix has to converge the daemon paths on a single env-merge contract
  without re-introducing the gap on the CLI path.

- **State-file naming is sanitised against hyphens but not against path
  segments.** The agent-state writer maps the in-config agent name to a
  filename by replacing hyphens with underscores; `/` and `..` segments
  pass through unchanged. An attacker who rewrites `scheduler.json` to add
  an agent whose key contains traversal segments can therefore direct
  arbitrary `*_last_output.md` writes outside the per-agent state
  directory at `~/.cache/fit/outpost/state/`.

- **Template permissions don't constrain write paths.** The runtime agent
  template allow-lists several shell-tool patterns without restricting which
  filesystem paths those tools may touch. Write-restrictions configured on
  the Claude Code `Edit` tool are bypassable by routing the write through
  any of those allow-listed patterns.

Pass 3 of the `app-security-products` audit (see
[spec 0810](../0810-outpost-mail-attachment-traversal/spec.md)) covered the
attachment-traversal class against this product surface; this trust-boundary
class was not enumerated. With 0810 patched, the surviving prompt-injection
sources still feed step 1.

Severity: HIGH. Reliable (scheduler ticks every 60 s; sync cadence is 5–15
min). Reachable from any source the user has chosen to sync, which on the
default install includes inbound mail. High-impact: persistence and lateral
movement across the six agent personas plus arbitrary code under the user's
account.

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Empowered Engineers | Be Prepared and Productive — "Help me keep track of people, projects, and threads without depending on memory" ([JTBD.md](../../JTBD.md)) | An assistant that escalates a single poisoned message into persistent compromise across all six agent personas cannot earn the trust the JTBD demands. |

## Scope

### In scope

| Component | What changes |
|---|---|
| Outpost agent-spawn env build | Keys in `config.env` outside a defined set do not reach the spawn environment, and rejections are observable in the daemon log. Behaviour applies uniformly across the scheduler-loop wake, the socket-mediated wake, and the direct-CLI wake. |
| Outpost agent template permissions | Writes targeting `~/.fit/outpost/scheduler.json`, `~/.fit/outpost/state.json`, or any path under `~/.cache/fit/outpost/state/` via the built-in `Edit` tool or a recognized Bash file command are rejected from inside an agent session. Writes routed through allow-listed interpreters or shell redirection are not closed here (see § Residual risk). |
| Outpost agent-state file naming | Config-supplied identifiers used as filesystem path components cannot produce a path that resolves outside the per-agent state directory. |
| Trust-boundary documentation | A new `products/outpost/CLAUDE.md` (the Outpost-internal contributor doc, sibling to `products/outpost/README.md`) names `~/.fit/outpost/` and `~/.cache/fit/outpost/state/` as user-only trust roots, names the env key set the spawn surface honors, and states the contract for anyone reviewing future template changes. |

### Out of scope

- TCC keys and macOS entitlements (covered by `app-security-products` pass 3;
  spec 0810 area).
- Mail / Teams / calendar attachment-content sanitisation (spec 0810 shipped;
  further content filtering is a separate audit topic).
- Sandboxing the Outpost spawn process or removing
  `disable-library-validation` from Outpost.app's entitlements (couples to
  spec 0600 native-binary distribution; the env-filter and template-deny
  here neutralise the env-injection chain without disturbing that surface).
- Generic Claude Code permission-model changes (the agent template carries
  the deny; harness-wide changes are out of scope).
- Hardening of products other than Outpost (Landmark, Summit, Guide,
  Pathway, Map — separate audit; none of them today expose a comparable
  user-config / agent-write trust boundary).

### Residual risk

Template permissions cannot fully prevent config edits by a compromised agent.
The `Edit` tool and recognized Bash file commands are closable, but two routes
remain open. An allow-listed interpreter (`bun`, `bunx`, `node`) can run a
script that writes any file. Shell redirection (`> path`, `>> path`) can write
any file. Both bypass `Edit` and Bash-command path denies. Closing them
requires an OS sandbox that confines the spawned process, which is out of scope
here and ties to spec 0600.

So the template deny is a defense-in-depth layer, not the load-bearing closure
for the injection→persistence chain. The two surfaces that do close the chain
are surface 1 (the env-merge allow-set) and surface 2 (state-name validation).
Surface 1 stops attacker-chosen environment variables from reaching any spawned
process, and surface 2 stops a config-supplied name from writing state outside
the per-agent directory. The injected `scheduler.json` cannot escalate through
either, even when an interpreter route lets the agent edit the file.

## Success Criteria

| Claim | Verification |
|---|---|
| Keys in `config.env` outside the defined set do not appear in the spawn environment, and each rejection produces an observable record in the daemon log. | Drive the env-build surface with a `config.env` containing a member of the defined set and several non-members; observe that the spawn environment contains the member and no non-member, and the log contains one rejection record per non-member. |
| The three operational wake paths (scheduler tick, socket-mediated wake, direct-CLI wake) produce the same spawn environment for the same `config.env`. | Exercise each path against an identical `config.env` and observe the resulting spawn environment matches across paths. |
| A write via the built-in `Edit` tool or a recognized Bash file command (`cat`, `head`, `tail`, `sed`, and the like) targeting `~/.fit/outpost/scheduler.json`, `~/.fit/outpost/state.json`, or any path under `~/.cache/fit/outpost/state/` is rejected. | Drive writes from inside the merged agent template's permission context using `Edit` and each recognized Bash file command against each path; observe each is rejected. |
| The agent-name → state-filename mapping cannot escape the per-agent state directory. | Feed agent names containing `..`, `/`, and absolute paths; observe the resulting state-file path resolves inside `~/.cache/fit/outpost/state/`. |
| The trust-boundary contract is documented in `products/outpost/CLAUDE.md` and names both user-only roots and the env key set the spawn surface honors. | Read `products/outpost/CLAUDE.md`; observe it names `~/.fit/outpost/` and `~/.cache/fit/outpost/state/` as user-only, and enumerates the env key set. |
