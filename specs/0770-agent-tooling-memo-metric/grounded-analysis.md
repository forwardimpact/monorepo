# SCRATCHPAD-6 — Grounded Theory Analysis: Memory and Metrics in Agent Traces

> Trace corpus: 33 structured traces (18 distinct workflow runs), ~10,500 turns.
> Traces span 2026-04-17 through 2026-05-02.
> Workflow types: 6 storyboard sessions, 3 coaching sessions, 24 agent runs
> (staff-engineer, product-manager, technical-writer, security-engineer,
> release-engineer, react).

## Method

Open coding on raw trace data. No hypothesis at start. Observations labeled
with the trace's own vocabulary (tool names, file paths, status codes).
Saturation reached when new traces confirmed existing categories without
producing new codes.

---

## Theme 1: How Memory Is Accessed and Used

### 1.1 Three-layer memory architecture observed in practice

Agents interact with three distinct memory layers, each with different read/write
patterns:

| Layer | Location | Read frequency | Write frequency | Primary accessor |
|---|---|---|---|---|
| **Memory protocol** | `.claude/agents/references/memory-protocol.md` | 20 reads across 20 traces | Never written by agents | All agents (early in run) |
| **Wiki MEMORY.md** | `wiki/MEMORY.md` | 23 reads across 23 traces | Facilitator only | All agents (early in run) |
| **Claude Code memory** | `~/.claude/projects/.../memory/MEMORY.md` | 3 reads across 3 traces | Never written by agents | SE, TW (early in run) |

**Memo**: The memory-protocol is *instructions about how to use memory*, not
memory itself. Wiki MEMORY.md is the *shared index*. Claude Code memory is the
per-session local memory that doesn't exist in CI (always returns "File does not
exist" in GitHub Actions).

### 1.2 Initialization ritual: a stable boot sequence

Solo agent runs show a remarkably consistent initialization sequence:

```
1. Read memory-protocol.md        (how to use memory)
2. ls wiki/                        (discover what exists)
3. Read wiki/<agent-name>.md       (own summary)
4. Read wiki/MEMORY.md             (shared memory index)
5. Read wiki/storyboard-2026-M0x.md (current month context)
6. Read wiki/<agent-name>-2026-W<nn>.md  (own weekly log)
```

Observed in PM runs (24948297842, 25091268802), SE runs (25244600948,
25251321109), TW runs (25037251150, 25245215992). The sequence order varies
slightly (some agents read MEMORY.md before their own summary) but the set of
files is near-identical.

**Memo**: This is a self-orienting ritual. The agent has no persistent context
between runs — each run starts cold. The boot sequence reconstructs "who am I,
what have I been doing, what does the team know." The wiki summary acts as the
agent's own résumé; MEMORY.md acts as the team's shared bulletin board.

### 1.3 Storyboard: facilitator reads first, participants read later

In storyboard sessions, the facilitator performs the boot sequence *before*
spawning participants:

```
Facilitator:
  Turn ~16-20: Read wiki/storyboard-2026-M0x.md
  Turn ~16-20: Read wiki/improvement-coach-2026-W<nn>.md
  Turn ~25-60: Run fit-xmr analyze on ALL metric CSVs

Participants (spawned ~Turn 80-120):
  Each reads own summary, then MEMORY.md, then metrics CSV
```

The facilitator front-loads all XmR analysis before anyone is asked a question.
Participants never see the raw XmR JSON — the facilitator synthesizes it into
Q2 briefings tailored to each participant's domain.

### 1.4 Wiki summary files: the memory spine

Every agent maintains two wiki files:

- `wiki/<agent>.md` — **Summary** (capped at ~80 lines). Contains: last run
  timestamp, curation state, documentation review state, watching list,
  experiment status, open blockers, observations for teammates.
- `wiki/<agent>-2026-W<nn>.md` — **Weekly log**. Append-only narrative of each
  run's decisions, actions, and outcomes.

The summary is the high-frequency read target (always read during boot). The
weekly log is read less frequently — mainly by the agent itself when it needs
to reconstruct its own history, or by the facilitator during coaching sessions.

**Memo**: The summary is designed to be *small enough to read every time*. This
is a deliberate constraint — 80 lines means the agent can always load its own
state without context budget pressure. The weekly log absorbs everything that
doesn't fit.

### 1.5 Claude Code memory vs wiki memory: separate systems, separate purposes

Three traces show agents attempting to read `~/.claude/projects/.../memory/MEMORY.md`
in CI. It always returns "File does not exist." The agents immediately fall back
to `wiki/MEMORY.md`.

In trace 25247279159, security-engineer reads Claude Code MEMORY.md (Turn 113),
gets "File does not exist", then reads `wiki/security-engineer.md` (Turn 132)
without any visible disruption. The missing file causes no retry, no error
handling — the agent just proceeds.

**Memo**: Claude Code memory and wiki memory are *not the same system*. Claude
Code memory is per-user, per-project, local. Wiki memory is team-shared,
git-backed, available in CI. Agents in CI only have wiki memory. This duality is
not explicitly documented in the traces — agents just discover it and adapt.

### 1.6 Cross-team observations: memory as coordination channel

The technical-writer summary contains an "Observations for Teammates" section
(see coaching trace 25031652139, Turn 24). These are directed messages: "Staff
engineer: audit X", "Security engineer: acknowledge Y", "All agents: study Z."

This is memory *used as coordination*. The TW writes an observation addressed to
SE; SE reads the TW summary during its next boot sequence and (ideally) acts on
it. The traces show this works — but also show gaps: in the coaching trace, the
improvement coach notes that an observation about `d642ff0c` has been
"10 days unacknowledged by SE."

**Memo**: The observation channel is asynchronous and unreliable. There is no
delivery guarantee — it depends on the addressed agent *reading* the sender's
summary and *recognizing* the observation as relevant. The coaching session
surfaced this as a process gap.

### 1.7 MEMORY.md curation: a dedicated TW responsibility

The technical-writer explicitly tracks "memory-index" as a curation area with a
last-curated date. In trace 25031652139, the TW summary shows:

```
| Area            | Last Curated |
| memory-index    | 2026-04-27   |
```

The TW reads and updates `wiki/MEMORY.md` as part of its curation duties —
refreshing stale entries, correcting status labels, removing resolved items.
This is the only agent with *write* responsibility for MEMORY.md (beyond the
facilitator who reads it for context).

---

## Theme 2: How Metrics and fit-xmr Are Accessed and Used

### 2.1 The facilitator is the primary XmR consumer

Across all 6 storyboard traces, the facilitator runs `bunx fit-xmr analyze`
against **every** metrics CSV at the start of the session. The count of
facilitator fit-xmr invocations per storyboard:

| Storyboard date | fit-xmr analyze calls | fit-xmr chart calls |
|---|---|---|
| Apr 26 (24951520222) | 8 | 0 |
| Apr 27 (24984886254) | 7 | 0 |
| Apr 30 (25155517604) | 6 | 0 |
| May 1 (25207876777) | 6 | 0 |
| May 2 (25247279159) | 12 | 6 |

The May 2 session is the first to use `fit-xmr chart`, generating ASCII XmR
charts for 6 metrics. Earlier sessions relied solely on the JSON `analyze`
output.

### 2.2 Participants rarely run fit-xmr themselves

Only 3 traces show a non-facilitator agent running `fit-xmr analyze`:

- **product-manager** (25207876777, Turns 142/162): Ran analyze on own backlog
  CSV during Q2 prep. Also ran `fit-xmr summarize` (Turn 482/484).
- **security-engineer** (25207876777, Turns 390/392/470/473): Ran analyze on
  own audit + triage CSVs. Piped output through Python for compact formatting.
- **release-engineer** (25247279159, Turn 385): Ran analyze on own release CSV,
  piped through Python for summary.

Two traces show `fit-xmr validate` (staff-engineer checking CSV format) rather
than `analyze`.

**Memo**: The facilitator is the "XmR engine." Participants receive pre-digested
XmR status through Q2 briefings. When participants do run fit-xmr themselves,
it's for self-service verification — confirming the facilitator's synthesis or
checking their latest append. This is a hub-and-spoke pattern, not peer-to-peer.

### 2.3 XmR output flows through facilitator synthesis, not raw JSON

The facilitator consumes raw fit-xmr JSON and produces human-readable briefings.
Example from trace 25247279159, Turn 296 (Q2 to product-manager):

```
| domain | metric | n | status | μ | latest | signals |
|---|---|---|---|---|---|---|
| backlog | issues_triaged | 23 | signals_present (chaos) | 1.0 | 0 | xRule1... |
```

The JSON contains `stats.mu`, `stats.UPL`, `signals.xRule1[].description`, etc.
The facilitator extracts these into a table, adds context ("the x=10.0
outlier — likely the PR #551 wave triage burst"), and asks the participant to
reconcile.

**Memo**: The synthesis step is where *interpretation* happens. Raw XmR output
is statistical — "xRule1 at slot 6, x=10.0 > UPL=5.8." The facilitator adds
*provenance* — "likely the PR #551 wave triage burst." This is the gap between
measurement and understanding.

### 2.4 Metrics CSV: append-only protocol with structured rows

Every agent appends rows to its own `wiki/metrics/<agent>/<domain>/2026.csv`
using `cat >> ... <<'EOF'` (Bash heredoc). The row format is consistent:

```
date,metric,value,unit,run,note
2026-04-26,open_prs,2,count,run-42,#460 hold + #528 feat...
```

The `run` field links back to a GitHub Actions run URL or a human-readable label
(e.g., `storyboard-W17-day7`, `coaching-1on1-W18-day1-baseline`). The `note`
field provides context that would otherwise be lost.

Metrics are written **after** the agent's primary work is complete and **before**
the wiki summary update. This ordering is consistent across 12 of 14 traces
checked (2 traces showed summary-first, then metrics).

### 2.5 Metric ownership is strict: agents write only their own CSVs

No trace shows an agent writing to another agent's metrics CSV. The only
exception is the **facilitator** (improvement-coach role in storyboard sessions)
writing to `wiki/metrics/improvement-coach/coaching/2026.csv` — which is its own
domain. The `cat >>` pattern means agents exclusively append — no agent ever
edits or overwrites another agent's historical data.

One notable exception: the technical-writer appended a row to
`wiki/metrics/improvement-coach/coaching/2026.csv` in trace 24867602412 (Turn
230). This was during a coaching session where the TW was the *participant*
being coached, and the append was trace-analysis metrics for the coach's domain.
This cross-write was discussed in the session and sanctioned by the facilitator.

### 2.6 XmR status progression: the maturity model in practice

Across the traces, metrics show a clear maturity progression:

1. **insufficient_data** (n < 15): Most new metrics start here. Staff-engineer
   `design` metrics at n=1 in the May 2 storyboard.
2. **sufficient_data / predictable**: Reached when n >= 15 and no signals.
   SE audit `findings_count` crossed from insufficient to predictable at n=16
   in the May 2 storyboard.
3. **signals_present** (chaos): PM `issues_triaged` at n=23 still shows
   xRule1 signals — a legitimate outlier from the PR #551 triage wave.
4. **Saturation**: TW `coverage` at 8/8 for 5+ days triggered retirement
   proposals (Exp 19). The metric stopped being informative.

**Memo**: XmR is not a pass/fail gate — it's a *voice of the process*. The
facilitator uses status transitions as conversation starters: "SE just crossed
to predictable — first step toward Dim 2 target of >= 6." Signals_present
triggers root-cause investigation, not remediation.

### 2.7 Experiment pre-registration: metrics as accountability

Experiments are pre-registered with expected outcomes *before* the data is
collected. From coaching trace 25031652139:

```
Expected outcome locked before-the-fact: next 2 artifact-driven entries
each land in N=1 commits
Verdict horizon 2026-05-12 23:59Z
if n<2, declare insufficient_data and re-scope
```

This is the Deming-influenced PDSA cycle in action. The experiment defines
the metric, the expected outcome, and the verdict conditions. The XmR chart
provides the statistical lens for judging whether the outcome was achieved
by the process (predictable change) vs. noise (signal within natural limits).

### 2.8 kata-metrics SKILL.md: rarely read, protocol embedded in agents

Only 2 traces show an agent reading `.claude/skills/kata-metrics/SKILL.md`
(release-engineer in 25207876777, staff-engineer in 25244600948). Most agents
appear to have the metrics protocol embedded in their agent definition rather
than loading it from the skill at runtime.

Similarly, the `wiki/xmr-analysis-protocol.md` file exists in the wiki but is
never explicitly read by any agent in the trace corpus. The protocol knowledge
appears to be carried by the facilitator's system prompt rather than loaded
dynamically.

---

## Central Explanation

The agent team operates a **two-tier memory system** that separates
*orientation* from *measurement*:

**Tier 1 — Orientation (wiki markdown)**: Summaries, weekly logs, MEMORY.md,
and storyboard logs give agents enough context to self-orient on cold start.
The boot sequence is a reconstruction ritual: the agent rebuilds its identity,
its recent history, and its team context from files that fit within a single
context load. This tier is human-readable, narrative-shaped, and curated by the
technical-writer.

**Tier 2 — Measurement (metrics CSV + fit-xmr)**: Append-only CSV rows give
agents a time-series record of their process. `fit-xmr analyze` transforms
those rows into statistical signals (predictable vs. chaos, rules violated,
control limits). The facilitator is the primary consumer of this layer — it
synthesizes raw XmR output into team-legible briefings during storyboard
sessions.

The two tiers connect through the **storyboard session**: the facilitator reads
Tier 2 (metrics), synthesizes it, and presents it to participants who update
Tier 1 (their wiki summaries) based on the discussion. Coaching sessions
close the loop tighter: the coach analyzes individual traces and metrics,
identifies obstacles, and locks experiments whose outcomes are measured in
Tier 2 and discussed in the next Tier 1 update.

### Key findings

1. **Memory is read universally, written narrowly.** Wiki/MEMORY.md is read by
   every agent on every run (23/23 traces). But only the facilitator and
   technical-writer write to it. Individual agents write only their own summary
   and weekly log.

2. **XmR analysis is centralized in the facilitator.** 56 of 63 `fit-xmr
   analyze` calls (89%) come from the facilitator. Participants run it
   occasionally for self-verification but rely on the facilitator's synthesis
   for team context.

3. **Metrics ownership is strict; memory curation is shared.** Each agent
   appends only its own CSV rows. But wiki summaries contain cross-team
   observations — memory is a coordination channel, not just a personal journal.

4. **The boot sequence is the most stable pattern in the system.** Despite no
   explicit orchestration, every solo agent follows the same initialization
   ritual: protocol → wiki ls → own summary → MEMORY.md → storyboard → weekly
   log. This convergence suggests the memory-protocol.md instructions are
   effective — or that the agents independently discovered the same optimal
   loading order.

5. **Claude Code memory is irrelevant in CI.** The `~/.claude/projects/.../
   memory/MEMORY.md` path doesn't exist in GitHub Actions. Agents that check
   it fail silently and fall back to wiki memory. This is a graceful
   degradation, but it means CI agents and interactive agents have different
   memory surfaces.

6. **XmR chart output is new and rare.** Only the May 2 storyboard (the most
   recent) uses `fit-xmr chart` for ASCII visualization. All prior sessions
   used only `fit-xmr analyze --format json`. The charts were generated at
   session close for the storyboard log, not for participant briefing.

7. **Cross-team observations are asynchronous and unreliable.** The TW's
   "Observations for Teammates" section is the primary cross-agent coordination
   mechanism within wiki memory. But delivery is not guaranteed — it depends on
   the target agent reading the TW summary. The coaching session identified a
   10-day-unacknowledged observation as a process gap.
