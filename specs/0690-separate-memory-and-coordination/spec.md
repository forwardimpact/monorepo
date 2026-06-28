# Spec 0690 — Separate Memory and Coordination

## Problem

Agents in this repo conflate **memory** (own persistent state) with
**coordination** (talking to other agents). The two activities have incompatible
semantics — memory is write-mostly and read-by-self; coordination needs an
addressable, synchronously-readable receiver — but the agent-facing
documentation treats them as one channel called "wiki." Under pressure, agents
default to wiki writes for both, and cross-agent handoffs silently fail.

### Evidence — the no-op handoff

Trace `25039150119` (release-engineer run-15, 2026-04-28T07:11Z) is the
canonical example.

The release engineer correctly identifies a code-level main-CI break
(`tests/job-builder.spec.js:23` — `#discipline-select` dropdown missing the
`software_engineering` option), correctly stops at its mandate boundary
("Stopping per protocol; routing to staff engineer"), and produces a useful
diagnosis ("strongest suspect `55d8b4c4`"). It then "routes" by writing the
phrase **"Routing to staff engineer."** repeatedly across two files it owns —
`wiki/release-engineer.md` and `wiki/release-engineer-2026-W18.md` — and
appending rows to its metrics CSV. The trace contains zero non-wiki outputs.

| Output produced this run                                                                                          | Channel                                              |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Decision-table run record                                                                                         | `wiki/release-engineer-2026-W18.md` (own weekly log) |
| "Routing to staff engineer." (multiple)                                                                           | own summary + own weekly log                         |
| Bisect candidate `55d8b4c4`                                                                                       | own weekly log                                       |
| Metric rows                                                                                                       | `wiki/metrics/.../release/2026.csv`                  |
| GitHub Issue                                                                                                      | **none**                                             |
| GitHub Discussion                                                                                                 | **none**                                             |
| PR comment on PRs inheriting the same e2e failure (the trace lists two open PRs at this state, `gh pr list` turn) | **none**                                             |
| `agent-react` invocation                                                                                          | **none**                                             |
| `MEMORY.md` edit (the only Tier-1 cross-agent surface)                                                            | **none**                                             |

The Staff Engineer's `Assess` procedure (`.claude/agents/staff-engineer.md`)
reads `specs/STATUS` plus Tier-1 wiki (own summary + `MEMORY.md` + storyboard).
It does not read another agent's summary or weekly log. So the diagnosis sits in
files Staff does not consult, and the next Staff run will not see the handoff.

Main CI was red on Test/e2e for 12+ hours across this trace.

### Evidence — the protocol exists but is named for its mechanism

`.claude/agents/references/routing-protocol.md` already prescribes the right
shape: settled decisions go to wiki; open questions go to Discussions; replies
tied to one PR/issue go to that thread; mechanical fixes get `fix/` branches.
The trace shows the file present and accessible — but the agent never reads it
in 32 turns. It does read `memory-protocol.md` (turn 6), because that filename
matches the activity it is performing: writing memory.

"Routing" describes the mechanism. The agent reaching for "how do I tell Staff?"
does not look up "routing." The name does not advertise its purpose.

### Evidence — the agent profile labels the wiki as a coordination channel

Each of the six agent profiles in `.claude/agents/` ends with the same footer:

```text
- **Coordination Channels**:
  [memory](.claude/agents/references/memory-protocol.md) (files:
  `wiki/<agent>.md`, `wiki/<agent>-$(date +%G-W%V).md`),
  [routing](.claude/agents/references/routing-protocol.md).
```

This sentence — read by every agent every run — labels the agent's own wiki
files as a "Coordination Channel." That is the wiki-as-handoff failure mode in
miniature. The structure of the footer **causes** the conflation it is meant to
prevent.

### Evidence — `MEMORY.md` is the only Tier-1 cross-agent surface, and it has no rotation procedure

`memory-protocol.md` defines `MEMORY.md` as the "Cross-Cutting Priorities" index
every agent reads at startup. It does not define when to add an entry, when to
update Owner/Status, or when to remove a resolved entry.

In the trace, `MEMORY.md` carries a 1,200-word cross-cutting priority entry
about the **previous** run-14 blocker, marked `Status: merging on PR #560`. PR

## 560 was merged hours earlier; the entry is historically resolved. The new

run-15 e2e blocker is not registered. The release engineer reads `MEMORY.md`
(turn 21), observes the stale entry, and edits no row in it.

Even the one wiki path that could have worked as an inbound signal for Staff was
not used, because the protocol does not say when or how to use it.

### Evidence — profiles and skills with mandate-boundary stops do not name the receiving channel

`.claude/agents/release-engineer.md` line 39 instructs the release engineer to
"stop and report" when failures persist after `bun run check:fix`. The phrase
lives in the profile's Assess procedure; the corresponding skill
(`kata-release-readiness/SKILL.md`) does not name the receiving artifact either.
The path of least resistance is to write to the agent's own wiki — the same
files the skill's "Memory: what to record" section already prescribes for state
recording. The trace confirms this is where the report lands.

The same pattern recurs in any agent profile or skill whose process can end at a
mandate boundary without having produced a `fix/` or `spec/` branch. The set of
affected files is discoverable mechanically by
`grep -ln "stop and report" .claude/agents/*.md .claude/skills/**/SKILL.md`.

#### Evidence — the existing audit catches this but cannot prevent it

`.claude/skills/kata-trace/references/invariants.md` already declares one
relevant cross-cutting invariant — "Open questions in wiki cite a Discussion"
(High severity). The run-15 trace fails this invariant: the wiki entries contain
"Recommend bisect…", "Worth a process question…", "Probable cause windows…" with
zero Discussion URLs. A retroactive audit catches the failure after a 12-hour
main-red window. The invariant is correct but covers only one of two failure
modes — the other being mandate-boundary stops that produce no non-wiki artifact
at all.

#### Why now

The release engineer profile is the only one with a routine that hits this
boundary daily, but every agent profile carries the same footer and the same
protocol references, so the defect generalises. The defect is at L7/L8 (skill
references and project policy); fixes at lower layers will not hold.

### Scope

#### In scope

| Area                                                                            | Change                                                                                                                                                                                  |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                                                                     | Add a top-level section declaring Memory and Coordination as orthogonal concerns                                                                                                        |
| `.claude/agents/references/routing-protocol.md`                                 | Rename to `coordination-protocol.md`; update purpose framing                                                                                                                            |
| Inbound references to the renamed file                                          | Update every reference in `.claude/skills/`, `.claude/agents/`, `CLAUDE.md`, and `KATA.md`                                                                                              |
| Agent profile footers (every file in `.claude/agents/` excluding `references/`) | Replace the single conflated footer with two distinct entries — one for Memory, one for Coordination                                                                                    |
| Profiles and skills with mandate-boundary stops                                 | For every file matching `grep -ln "stop and report" .claude/agents/*.md .claude/skills/**/SKILL.md`, name the receiving non-wiki artifact for the boundary stop                         |
| `memory-protocol.md`                                                            | Add a `MEMORY.md` entry-rotation procedure: when to add an entry, when to update Owner/Status, when to remove                                                                           |
| `kata-trace` invariants (cross-cutting table)                                   | Add an invariant covering mandate-boundary stops that produce no non-wiki artifact (High severity)                                                                                      |
| `KATA.md`                                                                       | Update § Shared Memory and § Coordination Channels to align with the memory/coordination dichotomy; remove wiki from coordination channel table; rename `routing-protocol.md` reference |

#### Out of scope

| Area                                             | Reason                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| New coordination channels                        | GitHub Issues, PR/issue comments, Discussions, and `agent-react` are sufficient                                     |
| Tooling that mechanically blocks wiki-as-handoff | Manual + invariant audit first; mechanical enforcement deferred until invariant baselines exist                     |
| Migration of historical wiki content             | Forward-only; existing summaries and weekly logs are not rewritten                                                  |
| Wiki structure beyond `MEMORY.md` rotation       | Spec 0590 covered condensed memory and the priority index; this spec only adds the rotation rule                     |
| Change to the agent-react facilitator            | Already correctly described in the renamed `coordination-protocol.md` § Cross-agent escalation; no behaviour change |

### What Changes

#### CLAUDE.md declares the dichotomy

A new top-level section names Memory and Coordination as distinct concerns and
states what each one is, where it lives, and what it is **not**. The wiki is
named explicitly as a memory layer, not a coordination channel. Writing a phrase
like "routing to X" in the agent's own wiki summary does not constitute a
handoff. Coordination requires a named receiver and an addressable artifact:
Issue, PR/issue comment, Discussion, or `agent-react` invocation. The section
sits at the project-policy layer (L8) so every downstream profile, skill, and
reference inherits it.

#### KATA.md aligns Shared Memory and Coordination Channels

KATA.md documents the Kata system for internal contributors. Its § Shared Memory
already frames the wiki as a memory layer. Its § Coordination Channels currently
lists the wiki as one of five coordination channels and references
`routing-protocol.md` — both contradict the dichotomy declared in CLAUDE.md. The
wiki row is removed from the coordination channel table, the channel count drops
from five to four, the `routing-protocol.md` reference becomes
`coordination-protocol.md`, and the wiki non-purpose bullet ("Wiki holds settled
state, not deliberation") moves to § Shared Memory where it describes a
memory-layer property.

#### `routing-protocol.md` becomes `coordination-protocol.md`

The file's content is largely correct; its name is wrong for the mental
operation it serves. "Routing" describes a mechanism; "coordination" describes
the activity an agent is trying to do. The rename makes the file findable by
purpose. The opening framing shifts from describing channels by output type to
describing how agents coordinate, with the wiki excluded from that list.

#### Agent profile footers split Memory and Coordination

Every agent profile ends with two distinct entries instead of one — one Memory
entry pointing at `memory-protocol.md` and naming the agent's wiki files; one
Coordination entry pointing at `coordination-protocol.md` and naming the GitHub
channels. Neither entry labels the wiki as a coordination channel.

#### Profiles and skills that stop at a mandate boundary name the receiving artifact

Any agent profile or skill whose process can terminate with "stop and report"
without producing a `fix/` or `spec/` branch names **what kind of non-wiki
artifact the report produces** — a GitHub Issue, a PR/issue comment, a
Discussion, or an `agent-react` invocation. The choice of which channel fits
which boundary is a design-time decision and is not pinned in this spec. What
the spec requires is that the channel is named in the file the agent reads at
the boundary (the profile's Assess procedure or the skill's
`## Coordination Channels` block, whichever applies), so "report" is no longer
ambiguous and the wiki is no longer the path of least resistance.

#### `MEMORY.md` rotation procedure

`memory-protocol.md` adds a procedure governing the Cross-Cutting Priorities
index lifecycle:

- **Add** an entry when a finding affects two or more agents and persists beyond
  the run that surfaced it.
- **Update** the Owner field when ownership transfers, and the Status field when
  material progress lands (e.g., PR opened, PR merged, blocker cleared).
- **Remove** an entry when the underlying problem resolves; the permanent record
  lives in the linked GitHub artifact (Issue, PR, Discussion).

The procedure does not change `MEMORY.md`'s position as a Tier-1 read for every
agent and does not change the existing entry cap (already in
`memory-protocol.md`).

#### A new mandate-boundary invariant

`kata-trace`'s `references/invariants.md` § Cross-cutting invariants gains one
entry: **"Mandate-boundary stop produces at least one non-wiki artifact."**
Severity: **High**.

The invariant has two sides that the design must specify but the spec constrains
as properties:

- **Trigger (left-hand side):** the trace contains a stop at a mandate boundary
  — i.e., the agent reasons that further action exceeds its scope and explicitly
  halts without producing a `fix/` or `spec/` branch.
- **Evidence (right-hand side):** the trace contains at least one non-wiki
  output for that stop — a GitHub Issue, a PR/issue comment, a Discussion, or an
  `agent-react` invocation. The specific tool-call shapes used to detect each of
  these are a design decision.

This sits alongside the existing High-severity "Open questions in wiki cite a
Discussion" invariant — together they form a two-sided check on the wiki-as-
handoff failure mode.

### Success Criteria

Each criterion can be mechanically verified at merge time against the working
tree of the implementing branch.

| #   | Criterion                                                                                                                      | Verification                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `CLAUDE.md` carries a top-level "Memory and Coordination" section that names the wiki as a memory layer and lists the channels | `grep -q "^## Memory and Coordination" CLAUDE.md` AND the section text (between that heading and the next H2) matches both `wiki` and at least three of: `Issues`, `Discussions`, PR/issue `comment`, `agent-react`                                                                                                                           |
| 2   | `routing-protocol.md` no longer exists; `coordination-protocol.md` exists in its place                                         | `find .claude -name routing-protocol.md` returns nothing; `find .claude -name coordination-protocol.md` returns exactly one path                                                                                                                                                                                                              |
| 3   | No file in `.claude/`, `CLAUDE.md`, or `KATA.md` references the old filename                                                   | `grep -r "routing-protocol" .claude CLAUDE.md KATA.md` returns no matches                                                                                                                                                                                                                                                                     |
| 4   | Every agent profile carries two distinct, separately-linked footer entries                                                     | For every file `f` in `.claude/agents/*.md` (excluding `references/`): `grep -c "memory-protocol" f` ≥ 1 AND `grep -c "coordination-protocol" f` ≥ 1 AND no single line in `f` matches both `memory-protocol` and `coordination-protocol`                                                                                                     |
| 5   | Every profile or skill that "stops and reports" at a mandate boundary names a non-wiki receiving artifact                      | For every file `f` returned by `grep -ln "stop and report" .claude/agents/*.md .claude/skills/**/SKILL.md`: the surrounding section names at least one of `Issue`, `Discussion`, PR/issue `comment`, or `agent-react` as the receiving artifact for that stop                                                                                 |
| 6   | `memory-protocol.md` documents the `MEMORY.md` rotation procedure                                                              | `memory-protocol.md` contains a section whose body matches `Add`, `Update`, and `Remove` as separate items describing when each operation applies to a `MEMORY.md` entry                                                                                                                                                                      |
| 7   | `kata-trace`'s Cross-cutting invariants table gains the mandate-boundary invariant at High severity                            | `.claude/skills/kata-trace/references/invariants.md` § Cross-cutting invariants contains a row matching `non-wiki artifact` with severity `High`                                                                                                                                                                                              |
| 8   | The new invariant detects the original failure on a known-bad input                                                            | Re-running `kata-trace`'s invariant audit against trace `25039150119` (release-engineer run-15, downloaded via `bunx fit-trace download 25039150119`) records `FAIL` on the new invariant. This is the spec's behavioural test: the invariant must catch the trace whose analysis motivated the spec, against the working tree of this branch |
| 9   | `KATA.md` § Coordination Channels does not list wiki as a channel and references `coordination-protocol.md`                    | § Coordination Channels table has no `Wiki` row AND the section opening names four channels (not five) AND `grep -q "coordination-protocol" KATA.md` matches AND `grep -qv "routing-protocol" KATA.md`                                                                                                                                        |
