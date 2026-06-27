# Spec 2120: Per-Agent Least-Privilege Execution for Outpost

**Classification:** Internal — security hardening of the Outpost runtime. It
adds no new user-facing job, but it strengthens the user-facing trust contract
(the `brief` / `brief+draft` posture) by reducing the data-exposure blast radius
of a compromised agent.

**Persona / JTBD:** Empowered Engineers —
[Outpost](../../websites/fit/outpost/index.md) runs background agents over the
user's mail and calendar. This spec lowers the risk that running those agents
carries, so the engineer can keep continuous awareness without granting every
agent reach over their whole disk.

## Problem

Outpost runs a daemon that wakes `claude` agents on a schedule. macOS attributes
every TCC-gated access to a **responsible process**, and today the daemon spawns
every agent so they all share one responsible process: `fit-outpost.app`. A
single grant to the app therefore covers every agent uniformly, with no way to
give one agent less reach than another.

A clean-permission verification on 2026-06-26 (two wakes, `librarian` and
`postman`, captured from the `com.apple.TCC` log stream) established the runtime's
actual behavior:

| Observation (2026-06-26 run) | Evidence from the run |
| --- | --- |
| Every agent's access is attributed to `fit-outpost.app`, even when the accessing binary is `claude`. | TCC stream line: `accessing=com.anthropic.claude-code … responsible=…/fit-outpost.app`. |
| Full Disk Access cannot be obtained by a prompt; it is granted or it is denied. | `SystemPolicyAllFiles` returned `Denied (Service Policy)` with no prompt on every attempt. |
| Without Full Disk Access the live mail/calendar store reads fail. | The `postman` agent reported: "Apple Mail sync failed (Full Disk Access still not granted)." |
| The knowledge base every agent uses lives in a TCC-protected folder. | The shipped default config sets every agent's knowledge base under `~/Documents/Personal` (Documents folder, `SystemPolicyDocumentsFolder`). |
| The synced-content cache the agents read is **not** in a TCC-protected folder. | The cache lives under `~/.cache/fit/outpost/`, outside Documents/Desktop/Downloads/Library. |

The single-responsible-process model is correct for usability and worth keeping
**for the agents that sync mail and calendar**: one grant, never `node`/`claude`.
The gap is that the model is all-or-nothing. An agent that only processes the
already-synced cache and updates the knowledge base runs with the same filesystem
reach as the agent that reads the live mail store. The synced content it reads is
attacker-influenceable (`products/outpost/CLAUDE.md` § Trust Boundary treats it
as data, never instructions), so a prompt-injected knowledge-base agent today can
read the entire disk — the mail SQLite store, other applications' data — even
though its job never needs that reach. Existing trust-boundary work hardens the
config and state roots against **writes**; nothing narrows an agent's **read**
reach over protected files.

## Goal

Each agent runs with the least privilege its job requires. An agent that does not
read the live mail/calendar stores and does not send mail must be unable to read
Full Disk Access-protected locations, even if fully prompt-injected. Agents that
do sync or send keep today's verified single-grant behavior.

## Privilege model

Two named levels, mapped to the capabilities each agent's job needs:

| Level | macOS reach | Intended agents |
| --- | --- | --- |
| `full` | Responsible process is `fit-outpost.app`; inherits the app's grants, including Full Disk Access (live mail/calendar read) and Automation (mail send). | Agents that sync the live mail/calendar stores or send mail. |
| `restricted` | The agent is held responsible for itself; the app's Full Disk Access and Automation are **not** extended to it. Operates only on non-TCC-protected substrate. | Agents that read the synced cache, build the knowledge graph, or stage drafts as files. |

Drafting illustrates the split: composing a reply by reading the synced **cache**
and writing a draft **file** is `restricted`; it is only the live-store sync and
the AppleScript mail **send** that require `full`. These levels are orthogonal to
the `brief` / `brief+draft` posture: posture governs whether an agent may compose
content for others, privilege governs the macOS reach the daemon grants it.

## Requirements (WHAT)

1. **Mandatory privilege level per agent.** Each agent in `scheduler.json`
   declares its level as exactly one of `full` or `restricted`. The level is
   required: a missing level, or any other value, is rejected. There is no
   implicit default and no fallback.
2. **Daemon-enforced, agent-immutable.** The daemon applies the level when it
   wakes an agent. An agent cannot raise its own level — the level is owned by
   the same user-only trust root as the spawn-env allow-set and the state roots.
3. **`restricted` agents are denied Full Disk Access and Automation.** When the
   daemon wakes a `restricted` agent, macOS must not extend the app's Full Disk
   Access or Automation grant to it. A `restricted` agent that attempts a
   protected read is denied.
4. **`restricted` agents need no TCC grant to do their work.** The substrate a
   `restricted` agent reads and writes — the synced cache and the knowledge base
   — must sit outside TCC-protected folders. The cache already qualifies; the
   default knowledge-base location moves out of `~/Documents` to a
   non-protected path so a `restricted` agent reaches it without any grant and
   without triggering a `node`/`claude` Documents prompt. This is an
   unconditional move — the old `~/Documents` location is not retained as a
   fallback. Knowledge bases are named and provisioned under the data home:
   `fit-outpost init <name>` creates one at `~/.local/share/fit/outpost/<name>`
   (default name `team`) and accepts a name, never an arbitrary filesystem
   path, so the substrate cannot be steered back inside a TCC-protected folder
   and the user never has to type the data-home prefix.
5. **Observable.** Each wake records, in the scheduler log, the privilege level
   resolved for that agent, so an operator and the verification runbook can
   confirm a `restricted` agent was in fact denied the elevated grant.

## Scope

**In scope** — the scheduler daemon's agent-wake path (`products/outpost`); the
macOS spawn library it depends on (`libraries/libmacos`, which hosts the spawn
runtime and is **released separately**, so a change here carries a coupled
libmacos release); the `scheduler.json` agent schema and the shipped
default config; the `fit-outpost init` command's named knowledge-base
provisioning and default location; the
[TCC verification runbook](../../products/outpost/macos/TCC-VERIFICATION.md),
extended to assert `restricted`-agent denial; and the end-user documentation for
the privilege levels and the substrate location.

**Out of scope** —

| Excluded | Why |
| --- | --- |
| OS sandboxing of the spawned child (the `writeFileSync` / shell-redirect write escape on the trust roots). | Complementary defense-in-depth, tracked separately in `products/outpost/CLAUDE.md` § Template Write Deny. |
| Two-bundle or helper-bundle architecture. | A deliberately deferred alternative; revisit only if a `restricted` identity must hold its own persistent narrow grant. |
| Adding the missing Automation / Calendar entitlements so those services can prompt. | Separate native-distribution issue surfaced by the same verification run. |
| Changes to the spawn-env allow-set. | The env trust boundary is already closed and unchanged here. |
| Automated migration or any back-compatible fallback for existing installs (undeclared levels, the old `~/Documents` knowledge-base path). | Clean break. The small number of existing installs are migrated by hand; no legacy default, shim, or fallback path lives in the code. |

## Success Criteria

| # | Criterion | Verified by |
| --- | --- | --- |
| 1 | A `restricted` agent that deliberately attempts a protected read is denied, while a `full` agent in the same install reads the live mail/calendar stores. | TCC verification runbook (extended): the `com.apple.TCC` stream shows an explicit `SystemPolicyAllFiles` **Denied** decision for the `restricted` agent's probe, and **Allowed** for the `full` agent. A positive probe is required so denial is distinguishable from "never attempted." |
| 2 | A `restricted` agent completes its knowledge-base work with no TCC grant present, and no `node`/`claude` Documents prompt appears. | With only the app's grants present and the default `~/.local/share/fit/outpost/team` knowledge base, the `restricted` agent's wake writes its briefing at `~/.cache/fit/outpost/state/<agent>_last_output.md`; the privacy panes show no `node`/`claude` entry. |
| 3 | A sync agent declared `full` reads the live mail/calendar stores under the one app grant. | Runbook Axis 1/2 for a `full` agent: access attributes to `fit-outpost.app`, live mail/calendar read succeeds under the one app grant, no `node`/`claude` grant required. |
| 4 | Each wake records the resolved privilege level for the agent. | The scheduler log line for a wake contains the agent's resolved level (`full` or `restricted`). |
| 5 | Documentation states which agents need which macOS permissions, and the substrate location a `restricted` agent uses. | The Outpost product page and engineers getting-started guide describe `full` vs `restricted` agents and the relocated knowledge-base path. |
| 6 | An agent whose entry omits the level (or declares an invalid one) is refused, not woken — there is no implicit default. | The scheduler log records an `outpost.privilege.rejected` event and no agent process is spawned for that entry. |
