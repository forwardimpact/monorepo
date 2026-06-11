# Spec 1740 — fit-wiki agent-scoped subcommands require an explicit `--agent`

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The wiki is the team's shared memory; the memory protocol routes every write to the invoking agent's own files. Today a `fit-wiki` invocation that omits `--agent` silently writes to **whichever agent the tool resolves on its own** — another agent's weekly log gets rotated, a claim lands under the wrong owner, a memo carries the wrong sender. Each misroute corrupts the team's coordination substrate and costs a detect-and-undo cycle that no agent is watching for, because the invocation reported success. |
| Platform Builders | [Build Agent-Capable Systems](../../JTBD.md#platform-builders-build-agent-capable-systems) | `libwiki` resolving its write target from `LIBEVAL_AGENT_PROFILE` couples two products through ambient environment: a `libeval`-driven env decision changes wiki-write targets. A library whose state-mutating CLI picks its target invisibly — from env or from a hardcoded literal — is not safely composable, and the hardcoded last-resort silently allocates every operator omission to one specific agent. |

## Problem

Every agent-scoped `fit-wiki` subcommand resolves its target agent through
the same silent fallback chain: the `--agent` flag, else the
`LIBEVAL_AGENT_PROFILE` environment variable, else the hardcoded literal
`staff-engineer`. The chain lives in the shared agent-option default in the
CLI definition, and the `boot` digest behaviour independently duplicates
the full chain — env read and `staff-engineer` literal — at handler level;
`memo` resolves its `--from` sender through the flag-then-env prefix of
the same chain. Resolution is invisible at invocation time — no echo, no
confirmation — so the caller learns what the tool targeted only by
inspecting post-state.

Three incidents — four misroute firings — have now realized **both branches
of that one default expression** (issue #1371):

| Date | Invoker | Env state | Outcome | Branch fired |
|---|---|---|---|---|
| 2026-06-02 (W23) | product-manager, intending its own log | `LIBEVAL_AGENT_PROFILE=staff-engineer` (set elsewhere in the session) | Bare `fit-wiki rotate` rotated `staff-engineer-2026-W23.md` | env fallback, wrong value |
| 2026-06-10 (W24) | security-engineer, acting on an audit finding naming `product-manager-2026-W24.md` | `LIBEVAL_AGENT_PROFILE` unset | Bare `fit-wiki rotate` sealed `staff-engineer-2026-W24.md` (361 lines → part4) | hardcoded `staff-engineer` last-resort |
| 2026-06-10→11 (W24) | improvement-coach, acting on an audit finding naming `improvement-coach-2026-W24.md` | `LIBEVAL_AGENT_PROFILE` unset | Running `fit-wiki audit`'s own remediation hint verbatim — the hint omitted `--agent` — sealed `staff-engineer-2026-W24.md` (17KB → part7), and a second verbatim run sealed the fresh replacement (44 bytes → part8). The flagged file was untouched until the flag was passed explicitly ([#1371 issuecomment-4675876412](https://github.com/forwardimpact/monorepo/issues/1371#issuecomment-4675876412)) | hardcoded `staff-engineer` last-resort, fired twice, **steered by the tool's own output** |

The third incident widens the behavior class from *interactive-use hazard*
to **tool-output-induced misroute**: the tool's suggested remediation path
was itself the misroute path. Agents execute emitted hints verbatim, which
is direct evidence for the decision below — a visibility or confirmation
gate (option b) protects only a human reading the echo; it cannot protect
the dominant non-interactive mode where the command arrives pre-composed
from tool output. A stopgap landed in `e303bacc` (#1581): the budget-audit
hints now read `rotate --agent <agent>` with a placeholder the caller must
substitute, and rotate echoes its resolved target. That narrows the steered
path but keeps the underlying default — any invocation that omits the flag
for any other reason (older docs, scripts, muscle memory) still silently
misroutes.

The staff-engineer assessment on #1371 confirms the W24 mechanism: there is
no directory scan — the hardcoded last-resort deterministically supplied
`staff-engineer`. It also confirms a corollary defect: the handler-level
guards ("requires `--agent` or `LIBEVAL_AGENT_PROFILE`") on the rotate, log,
claim, release, and inbox handlers are **dead code**, because the
CLI-definition default always supplies a value before any handler runs.

All three incidents were benign by luck (audit-clean rotations, sealed
content intact, churn parts discarded).
The same silent resolution backs higher-blast-radius writes: a misrouted
`claim` collides with a real claim-holder, a misrouted `inbox promote`
mutates another agent's priorities, a misrouted `memo --from` misattributes
a sender. And guidance-based mitigation has already empirically failed:
the caution "always pass `--agent` explicitly" sat in #1371's body for
eight days and did not reach the W24 invoker at point of use — at-rest
guidance does not deliver at tool time; only a tool-time gate does
(#1371 adjudication, 2026-06-10).

## Decision — the env fallback is removed entirely (option c)

The open product decision on #1371 was **(b)** keep `LIBEVAL_AGENT_PROFILE`
as a fallback with an echo-and-confirm gate, versus **(c)** remove the env
fallback entirely and require the explicit flag. This spec commits to
**(c)**: `libwiki` stops reading `LIBEVAL_AGENT_PROFILE` altogether. Agent
identity arrives only via the explicit flag (`--agent`, or `--from` for
`memo`); a missing flag is a non-zero exit with an actionable error before
any state changes. The hardcoded `staff-engineer` last-resort is deleted
(this was already settled — it goes under either option).

Head-to-head:

| Axis | (b) env fallback + echo-and-confirm | (c) explicit flag only |
|---|---|---|
| Misroute paths closed | Env-unset branch only by the fallback's nature; the env-set-wrong (W23) branch survives behind a confirm gate | Both branches — the fallback expression no longer exists |
| Non-interactive callers (the dominant mode: agents, CI, skills) | A confirm prompt either hangs/auto-denies (same friction as (c), plus gate machinery) or is suppressed with `--yes` — which scripts cargo-cult, silently reopening the path | Deterministic failure with a copy-paste fix in the error message |
| Cost shape | Perpetual: gate code, `--yes` plumbing, and a confirm/suppress test matrix maintained forever | One-shot: a bounded, enumerable call-site migration (§ Scope) |
| Cross-product trust boundary | `libeval`'s env still drives `libwiki` write targets — the root cause named at triage survives, mitigated | Eliminated — `libwiki` carries no ambient agent identity |
| Evidence fit | Echo-style visibility is at-rest guidance moved one step closer; the same class already failed to deliver at point of use | Matches the adjudicated lesson: only a tool-time gate closes the class |

The explicitness requirement is **unconditional**, not gated on "the
checkout hosts multiple agents' files," adopting the staff-engineer
verdict on #1371: a multi-agent gate would (1) reintroduce
directory-state-dependent implicit behavior — the disease as the cure;
(2) plant a time bomb where a bare invocation works until a teammate's
first file lands; (3) triple the test surface to preserve one flag's worth
of convenience.

## Scope

### In scope

| Component | What changes |
|---|---|
| The shared agent-option contract in the `fit-wiki` CLI definition. | The option no longer carries a default. Its help text states that the flag is required and no environment fallback exists. |
| Agent-scoped subcommands: `boot`, `log`, `claim`, `release`, `inbox`, `rotate`. | Invocation without `--agent` exits non-zero **before any read of agent files or write of any kind**, with an error naming the missing flag and showing a corrected example invocation. `boot` is included although read-only: its digest is the input that orients an entire session, and it is the same shared option — one policy, no per-command matrix. |
| The `release --expired` operator-cleanup mode. | **Deliberately exempt.** `release --expired` removes every agent's expired claim rows — a cross-agent table sweep with no single agent identity to name — and remains valid without `--agent`, exactly as the memory protocol and curation skill document it. Only the targeted form (`release --target …`), which releases one agent's claim, requires the flag. |
| `memo` sender resolution. | `--from` is required; same error contract. (`--to` is already explicit.) |
| The hardcoded `staff-engineer` last-resort. | Deleted at **every occurrence** — the shared option default and the boot behaviour's handler-level duplicate. No `fit-wiki` invocation can target an agent nobody named. |
| `LIBEVAL_AGENT_PROFILE` consumption in `libwiki`. | Removed entirely — no `libwiki` source path reads that variable. The missing-flag error path becomes live and tested, with a **new error contract**: it names the flag and a corrected invocation, and does not offer the env variable as an alternative (the current dead-guard wording does). |
| CLI help text, examples, and golden help-output expectations. | Updated to show `--agent`/`--from` as required; no example demonstrates a bare agent-scoped invocation. |
| Tool-emitted remediation hints for agent-scoped commands. | The weekly-log budget-audit hints emit the **fully resolved** invocation — `rotate --agent <actual-agent>` derived from the flagged filename's prefix — replacing the `e303bacc` placeholder the caller must substitute. A hint copy-pasted verbatim is a correct, correctly-targeted command. Hints are runtime examples: the same no-bare-invocation policy applies to tool output as to docs. |
| Internal call-site and documentation migration. | Every monorepo surface that instructs or performs a bare agent-scoped invocation, **or describes the env fallback as available**, is updated: skill `SKILL.md` boot lines and command examples, the `fit-wiki` skill's fallback descriptions, the memory-protocol and coordination-protocol references, agent profile session protocols (already largely compliant), the `libwiki` README's agent-resolution sentence, the published wiki-operations guide, and `benchmarks/fit-wiki` fixtures. The migration includes a sweep verifying no remaining bare call sites and no remaining fallback descriptions. |

### Out of scope

- **`libeval`'s own consumption of `LIBEVAL_AGENT_PROFILE`.** The variable
  exists for legitimate reasons inside `libeval` (facilitate, run,
  supervise, discuss) and is unchanged. Only `libwiki` stops reading it.
- **Spec 1730's append-path auto-rotation.** Its single-resolution
  invariant (rotation receives the append's already-resolved target; no
  second resolution) is recorded as a design requirement in spec 1730's
  lane (#1427). The two fixes compose: this spec corrects the initial
  resolution; the 1730 rider guarantees rotation cannot diverge from it.
- **Non-agent-scoped subcommands** — `audit`, `fix`, `refresh`, `init`,
  `push`, `pull` operate on the wiki as a whole or on explicit paths and
  carry no agent-identity option. Unchanged.
- **Interactive confirmation gates and `--yes` machinery.** Rejected by
  the decision above, not deferred.
- **Rotation seal mechanics at the budget cap** — spec 1450's territory.
- **Sibling-repo composite actions** (`fit-wiki@v1`, `kata-agent@v1`).
  They invoke non-agent-scoped commands (push, pull, audit, fix) and need
  no change; the migration sweep confirms rather than assumes this.

## Success Criteria

| Claim | Verification |
|---|---|
| Bare `fit-wiki rotate` fails closed in both incident replays. | With `LIBEVAL_AGENT_PROFILE` set to another agent, and again with it unset, drive `fit-wiki rotate` with no `--agent` against a multi-agent wiki fixture; observe a non-zero exit, an error naming `--agent`, and no file created, renamed, or modified — in both env states. |
| Every agent-scoped subcommand requires the flag. | Drive `boot`, `log decision`, `claim`, `release --target`, `inbox list`, `inbox promote`, and `rotate` without `--agent` (env set and unset); observe each exits non-zero with the missing-flag error and zero wiki mutations. |
| `release --expired` keeps working agent-less. | Drive `release --expired` without `--agent` against a claims table holding expired rows from several agents; observe the expired rows are removed and the exit is zero — the documented curation invocation is unchanged. |
| `memo` requires an explicit sender. | Drive `memo --to <agent> --message …` without `--from` and with `LIBEVAL_AGENT_PROFILE` set; observe a non-zero exit and no memo written. |
| The hardcoded last-resort is gone. | With env unset and no flag, observe no **agent-scoped** subcommand resolves `staff-engineer` (or any agent) as its target identity — each fails closed instead; no error message or help text offers `staff-engineer` as a default. (`audit`/`fix` reading all agents' files by design is unaffected.) |
| `libwiki` carries no ambient agent identity. | Search the `libwiki` package source for `LIBEVAL_AGENT_PROFILE`; observe zero references. |
| Explicit invocations are unchanged. | Drive each agent-scoped subcommand with `--agent <name>` (and `memo` with `--from`); observe behavior, output, and exit codes identical to today's explicit-flag behavior. The explicit-invocation subset of the existing test corpus passes unmodified; tests asserting the removed fallback or the old guard wording are replaced by tests of the new fail-closed contract, and golden help outputs are regenerated. |
| The error is actionable at point of use. | Observe the missing-flag error names the flag and shows a corrected example invocation for the subcommand that failed, and exits before any state change. |
| Audit hints are copy-paste-safe. | Run `fit-wiki audit` against a fixture where one agent's weekly log is over budget; observe the remediation hint names that agent explicitly (`--agent` resolved from the flagged filename's prefix, no placeholder), and running the hint verbatim rotates the flagged file and nothing else. |
| Help output documents the contract. | `fit-wiki --help` and per-subcommand help show the flag as required with no env fallback mentioned; golden help-output tests are updated and pass. |
| No internal caller relies on the removed fallback, and no doc describes it. | Sweep the monorepo's skills, agent references, workflows, scripts, library READMEs, published docs, and benchmark fixtures; observe every agent-scoped `fit-wiki` invocation passes `--agent` (or `--from`) explicitly — `release --expired` excepted — and no surface still describes `LIBEVAL_AGENT_PROFILE` as a `fit-wiki` fallback. |

— Product Manager 🌱
