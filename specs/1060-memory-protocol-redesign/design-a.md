# Design 1060 — Memory Protocol Redesign

## Architectural Posture

The current protocol asks agents to *find files, read files, parse files, write
files.* Every gap the spec catalogues (F3, F4, F5, F6, F8, F10, F11, F13, F17,
F18) is a tax that lands on the agent because the protocol contracts the work
but not the surface that performs it. The redesign inverts that: **`fit-wiki`
becomes the agent's interface to memory.** Writes collapse to one call per
intent (claim, log, memo). Reads pair a direct `Read` of `MEMORY.md` (the
spec-criterion-satisfying surface) with one `boot` call that produces a
structured digest covering the rest of Tier 1. Two tool calls at boot replace
three. Direct file edits remain possible but become the escape hatch, not the
path.

This makes the read-on-boot habit cheap enough to beat `gh`/`git`/source
re-derivation (the JTBD Habit per spec § Forces): the CLI is calibrated, on
every primitive, to cost fewer tool calls than the alternative.

The redesign also extends `fit-wiki refresh` to render storyboard Obstacle /
Experiment lists from GitHub issue state, closing a two-artifact-sync failure
class observed in W20/W21 storyboard traces. Issues remain the coordination
artifact; the storyboard markdown becomes a rendered reflection.

```mermaid
graph LR
  A[Agent] -- "Read" --> M["wiki/MEMORY.md (priorities + ## Active Claims)"]
  A -- "boot" --> D[On-boot Digest]
  D -.contains.- S["wiki/{self}.md"]
  D -.contains.- C["claims (parsed from MEMORY.md)"]
  D -.contains.- St["Storyboard agent-items"]
  A -- "log decision/note/done" --> W["wiki/{self}-YYYY-Www.md"]
  A -- "claim / release" --> M
  A -- "Stop-hook → audit" --> G[Gate verdict]
```

## Components

| Component | Contract (interface, not implementation) |
|---|---|
| **`fit-wiki boot`** | Inputs: Tier 1 surfaces (`{self}.md`, `MEMORY.md`, current storyboard). Output: JSON digest (schema below). Reads memory; does not write. Returns empty arrays for absent `## Active Claims` / inbox / storyboard slice (silent tolerance — rationale below). |
| **`fit-wiki log`** | Inputs: field flags (`--surveyed`, `--chosen`, `--rationale`, `--field`, `--body`). Output: append to current weekly log. Subcommands: `decision` (run opener, required leading `### Decision`), `note` (field append), `done` (entry closer). Cap enforcement: rotates *before* appending when the next append would exceed the cap. |
| **`fit-wiki claim` / `release`** | Inputs: `--target`, `--branch`, `--pr` (optional), `--expires-at` (optional). Output: insert / remove row in `MEMORY.md ## Active Claims`. `release` is the only writer that deletes a row in the normal lifecycle; `release --expired` is the operator cleanup primitive that removes rows past `expires_at`. Active Claims append history lives in git history of `MEMORY.md`; rows are settled by deletion. |
| **`fit-wiki inbox`** | Subcommands: `list`, `ack`, `promote` (writes a row directly into MEMORY.md's priorities table), `drop`. `memo` (writer, retained) and `inbox` (reader/lifecycle) are paired: `memo` writes into the recipient's `## Message Inbox`; `inbox` triages the receiving agent's own inbox. |
| **`fit-wiki rotate`** | Seals the current weekly log as a read-only prior part by renaming to `wiki/{agent}-YYYY-Www-partN.md` (N starts at 1 for the first rotation, increments on subsequent), and creates a fresh `wiki/{agent}-YYYY-Www.md`. Append-only invariant preserved: no part is rewritten. Prior parts are discoverable by directory listing under the agent-week prefix. |
| **`fit-wiki audit`** | Absorbs `scripts/wiki-audit.sh`. Sole audit invocation points: Claude Code Stop-hook (per-run self-correction) and pre-merge CI (collective gate). `log` / `claim` / `release` / `rotate` never invoke audit. First-run grace: on the first audit run after install, existing summary violations (e.g., 106-line `release-engineer.md`) are reported but do not fail the gate; a 7-day remediation window applies before strict enforcement begins. |
| **`fit-wiki memo`** | Retained as-is. Rationale: the writer-side contract (insert a bullet under the recipient's `<!-- memo:inbox -->` marker) is orthogonal to the read-side redesign; changing it would force a memo-sender API update without closing any spec failure. |
| **`fit-wiki push` / `pull`** | Retained as-is. Rationale: git lifecycle commands are independent of the read/write contract; no failure id targets them. |
| **`fit-wiki refresh`** | Extended. Continues to regenerate `<!-- xmr:... -->` chart blocks; gains four fixed marker pairs that render storyboard Obstacle / Experiment lists from `gh issue list`: `<!-- obstacles:open -->`, `<!-- obstacles:closed -->`, `<!-- experiments:open -->`, `<!-- experiments:closed -->`. Filter logic (labels, state, the 7-day Concluded window) is internal to `libwiki` and not configurable from the marker. Future extension reserved: `<!-- experiments:closed:30d -->` style suffix if a different timeframe is needed. Idempotent; writes stay with `gh issue create/comment/close` — `refresh` is read-only against the GitHub state. |
| **`fit-wiki init`** | Idempotent. Scaffolds the `## Active Claims` heading in `MEMORY.md` and installs the Stop-hook entry in the standard Claude Code settings location; never rewrites existing content. Single code path covers fresh and existing installs. |
| **`memory-protocol.md`** | Rewritten to specify CLI contracts plus the named jobs the CLI serves, not file-shape contracts. |
| **`MEMORY.md`** | Retains canonical-priority role; gains the `## Active Claims` schema. **Authoritative schema location:** the markdown table in `MEMORY.md` is canonical; `boot`'s JSON digest is a derived view. When they disagree, the markdown wins. |

**Digest schema (boot output, JSON), stable contract:**

```
{
  summary: string,
  owned_priorities: [{ item, status, added, link }],
  cross_cutting: [{ item, status, added, link }],
  claims: [{ agent, target, branch, pr?, claimed_at, expires_at }],
  storyboard_items: [{ dim, threshold, status, link }],
  inbox_count: number,
  storyboard_path: string,
}
```

`boot`'s output is the **load-bearing contract**; a `--format markdown` flag
renders the same content for human reading.

## Data Flow

### On boot

```mermaid
sequenceDiagram
  participant A as Agent
  participant CLI as fit-wiki
  participant FS as wiki/
  A->>FS: Read wiki/MEMORY.md
  FS-->>A: priorities + ## Active Claims (markdown)
  A->>CLI: fit-wiki boot
  CLI->>FS: read {self}.md, storyboard, MEMORY.md
  CLI-->>A: JSON { summary, owned_priorities[], cross_cutting[], claims[], storyboard_items[], inbox_count, storyboard_path }
  A->>A: action routing (owned > storyboard items > domain > cross-cutting)
```

**Step 0 contract.** The redesigned protocol mandates two tool calls in every
agent's first ten tool calls:

1. `Read wiki/MEMORY.md` — direct file open of the canonical priority surface
   and the `## Active Claims` table. This satisfies spec § Success Criteria
   row #3 ("priority surface opened in each run's first ten tool calls") and
   row #4 ("claim set obtained by file open alone, no separate tool
   round-trip") literally and unchanged.
2. `Bash: fit-wiki boot` — the digest call. Surfaces `{self}.md` summary and
   storyboard agent-items in one structured response, replacing two direct
   reads.

Total cost: 2 tool calls (vs status-quo 3 reads); the companion `Read
MEMORY.md` pays the spec-criterion tax in ~50ms without compromising the
cheap-memory thesis. `boot` is the agent's structured-routing interface;
write primitives (`log`, `claim`, `release`, `inbox`) remain CLI-only.

### During run

```mermaid
sequenceDiagram
  participant A as Agent
  participant CLI as fit-wiki
  participant FS as wiki/
  A->>CLI: fit-wiki log decision --surveyed S --chosen C --rationale R
  CLI->>FS: rotate if over cap, then append `## YYYY-MM-DD` + `### Decision`
  A->>CLI: fit-wiki claim --target spec-1060 --branch claude/...
  CLI->>FS: insert row in MEMORY.md ## Active Claims
  Note over A,FS: ... work happens ...
  A->>CLI: fit-wiki log note --field "Actions taken" --body "..."
  A->>CLI: fit-wiki release --target spec-1060
  A->>CLI: Stop hook → fit-wiki audit
```

## Decision-area Positions

Each row carries position, rejected alternative, and why.

| # | Area | Position | Rejected · Why |
|---|---|---|---|
| 1 | **Tier 1 read set** (closes F5, F11) | 3 files: `wiki/{self}.md`, `wiki/MEMORY.md`, current `wiki/storyboard-YYYY-MNN.md`. Step 0 mandates `Read MEMORY.md` (literal spec-criterion satisfaction) plus `fit-wiki boot` (digest covering the other two surfaces, with claims-from-MEMORY.md included as a derived view). The protocol publishes the 3-file list verbatim for copy-paste per spec § Success Criteria row #3. | Rejected: replace the file-list instruction entirely with one CLI call. · F11 (0/8 reads of MEMORY.md) traces to the file-list instruction being ignored as ceremony. The redesign keeps the canonical `Read` of MEMORY.md as the spec-criterion-satisfying surface, then layers `boot` on top to collapse the rest of Tier 1 into one call. Two tool calls beats three; one would have required a spec re-draft. |
| 2 | **Weekly-log size budget** (closes F3, F17) | 500 lines per file. Anchor: a Tier 2 read consumes ≤2.5% of an agent's context window. The model family (Opus 4.7) ships a 1M-token context window per the env banner; 2.5% = 25k tokens, which also equals the Read tool's per-call ceiling — the cap binds at whichever fires first. Line conversion uses the spec's 25k-token / 600-line Read-cap empirical proxy (≈42 tokens/line), giving 21k tokens / ~500 lines. Overflow rotates: `log` renames the current file to `…-Www-partN.md` and creates a fresh `…-Www.md` *before* appending, so the day's entry always lands in the fresh part and no part is ever rewritten. Cutover: ISO **2026-W23** (Mon 2026-06-01). Pre-cutover logs exempt. | Rejected: daily file rotation; or no cap. · Daily explodes file count 7×; no-cap reproduces F3/F17. 500-line cap with seal-before-append preserves one-file-per-week as the common case while bounding worst-case context cost. |
| 3 | **Canonical priority surface** (closes F11, F8) | `wiki/MEMORY.md` retained as canonical priority surface. Read-on-every-boot realised by `fit-wiki boot` emitting the priority slice for `{self}` in the JSON digest. | Rejected: distribute priorities across agent summaries; or retire MEMORY.md. · Distributing reintroduces drift; retiring sheds the cross-cutting role. Retain and make cheap to read. |
| 4 | **In-flight work surface** (closes F8, F18) | New `## Active Claims` section in `MEMORY.md`. Schema: `\| agent \| target \| branch \| pr \| claimed_at \| expires_at \|`. **Row presence = active; row absence = settled.** Expiry policy: per-claim, set at `claim` time via `--expires-at` with a default of **claim+7 days** (one storyboard week). `pr` is optional (claim-before-PR is the F8/F18 case). Rows past `expires_at` are excluded from `boot`'s active set; `audit` reports them as findings; `release` (normal lifecycle) and `release --expired` (operator cleanup) are the writers that remove rows; no row is removed implicitly. Audit history lives in git history of `MEMORY.md` — rows are settled by deletion, with the prior commit preserving the claim record. | Rejected (separation): separate `wiki/CLAIMS.md`. · One Read fetches priorities and claims together; claims *are* priorities-in-flight. Rejected (expiry default): shorter window (e.g., 24h) with mandatory `--expires-at`. · 24h forces every agent to estimate run length; 7d outlives the longest legitimate single-spec run while still bounding stickiness. Rejected (settlement mechanism): keep settled rows with a `released_at` column. · Audit complexity grows linearly; git history already records every transition. |
| 5 | **Mechanical enforcement of summary contract** (closes F10) | Per rule, all three are **kept and gated** by `fit-wiki audit`: (a) 80-line summary cap (`wc -l`), (b) `<!-- memo:inbox -->` marker present directly below `## Message Inbox`, (c) `## Message Inbox` is the first H2. Stop-hook (per-run) + pre-merge CI (collective). | Rejected per rule: (a) raise the cap and skip gating, (b) drop the marker convention, (c) drop the first-H2 requirement. · Rules are already documented and load-bearing for on-boot inbox visibility; F10 is that they are unchecked, not that they are wrong. |
| 6 | **Decision-block adoption** (closes F6, F13) | Required at the **opening** of each weekly-log entry. `fit-wiki log decision` is the only sanctioned start-of-run write; `audit` flags entries that lack a leading `### Decision`. Past entries not retrofitted. | Rejected: keep the opening-position requirement as a contractually-stated but unenforced guideline (status quo, the source of F6/F13). · The wording is already correct; the failure mode is that it is unchecked. Gating fixes the gap without rewriting the contract. |
| 7 | **Tool-vs-memory habit** (closes F4, F5, F11) | **Memory-first**, anchored on CLI cost. The redesigned protocol states: when deciding between asking memory and re-deriving via `gh`/`git`/source, prefer memory because the CLI is calibrated to be cheaper. One call for the on-boot read set (F11). One call to record a decision (F4). One call for inbox state (F5 partial). | Rejected: tool-first; or silence (status quo). · The Habit (gh/git/source) competes only when memory access is more expensive. A position taken on exhortation alone will not shift behaviour; one taken via primitive cost will. |
| 8 | **`fit-wiki` CLI surface composition** (cross-cuts F3, F5, F8, F10, F17, F18) | See § CLI Surface. Every protocol contract maps to a subcommand; every subcommand maps to a protocol contract. A doc-test diffs the protocol's CLI-gated rule list against the CLI's subcommand list; mismatch fails CI. | Rejected: make CLI use optional and let agents hand-edit memory files. · Optional CLI reproduces F4 (probe-heavy writes) and F11 (skipped reads) — the primitives must be the *path*, not an alternative. The spec § Out of scope escape route allows deferring individual subcommands when a follow-up spec inherits the contract; the rejection is of full optionality, not staged delivery. |

## CLI Surface

| Subcommand | Status | Realizes contract | Closes |
|---|---|---|---|
| `boot` | new | Tier 1 on-boot read; priority-surface read; in-flight visibility; storyboard-items routing input | F5, F11 |
| `log decision` | new | Decision block at run opening | F4, F6, F13 |
| `log note` | new | Field appends within the open run entry | F4 |
| `log done` | new | Mark the open run entry closed. (Rotation is owned by `log decision` / `log note` / `rotate`.) | F4 |
| `claim` / `release` | new | In-flight work surface; append-only audit trail | F8, F18 |
| `inbox list` / `ack` / `promote` / `drop` | new | Inbox lifecycle | F5 (partial) |
| `rotate` | new | Weekly-log overflow handling; seal-before-append | F3, F17 |
| `audit` | absorbed (`scripts/wiki-audit.sh`) | All gated rules; Stop-hook + CI | F3, F8, F10, F13, F17, F18 |
| `memo` | retained (unchanged) | Cross-agent memo into recipient inbox | — |
| `push` / `pull` | retained (unchanged) | Wiki git sync | — |
| `init` | modified | Scaffold MEMORY.md `## Active Claims`; install Stop-hook entry in Claude Code settings | F8, F10, F13, F18 |
| `refresh` | extended | Storyboard XmR chart refresh **+ four fixed marker pairs (`obstacles:open` / `obstacles:closed` / `experiments:open` / `experiments:closed`) rendered from `gh issue list`. Filter logic internal to libwiki; 7-day Concluded window baked in; idempotent.** | — (closes the storyboard two-artifact-sync class observed in W20/W21 traces: orphan `Exp N` lines, missed `(#NNN)` suffixes, stale Concluded partition) |

## Cross-cutting Architectural Choices

| Choice | Position | Rejected · Why |
|---|---|---|
| Named jobs in protocol text (spec § In scope) | The protocol explicitly names the three jobs and binds each to a CLI primitive: "find next thing to pick up without colliding" → `claim`/`release`; "trust another agent's reported state without re-deriving" → `boot` digest + MEMORY.md; "receive memos without breaking my contract" → `inbox list/ack/promote/drop`. | Rejected: leave them unnamed; or disclaim. · Read-write asymmetry produced F11. Naming each job in the read contract and pointing each to its write contract closes the loop. |
| Append-only audit preservation under rotation | `log` seals the prior part read-only *before* appending; the new entry lands in a fresh part. No part is ever rewritten. | Rejected: rewrite-in-place compaction; or truncate-and-summarise. · Rewrite-in-place violates audit; summarisation lossy. Seal-before-append preserves the invariant with zero rewrite. |
| Coordination boundary | `coordination-protocol.md` and `approval-signals.md` not modified. `memo` (memory write) stays here; `agent-react` dispatch stays in `coordination-protocol.md`. | Rejected: fold sibling references in. · Spec § Out of scope; collapsing them blurs distinct contracts. |
| Obstacle / Experiment surface (kata-session integration) | GH issues remain the authoritative coordination artifact for obstacles and experiments (`gh issue create/comment/close` per `kata-session/references/issue-lifecycle.md`). The storyboard's `### Active` / `### Concluded (last 7 days)` lists become a *rendered reflection* of GH state via four fixed marker pairs (`obstacles:open`, `obstacles:closed`, `experiments:open`, `experiments:closed`) driven by `fit-wiki refresh`. Filter logic — label sets, state, the 7-day Concluded window — is internal to `libwiki`; the markers expose no GitHub-search syntax. Memory (the storyboard markdown) becomes mechanical; coordination (the issues) stays where it is. | Rejected (parallel writes): `fit-wiki obstacle` / `fit-wiki experiment` subcommands wrapping `gh issue`. · Duplicates `gh` for one consumer (the coach) and crosses the memory/coordination boundary. The W20/W21 trace failures (orphan `Staff Exp 41` with no labeled issue, +6d close-out lag on RE Exp 41, hand-edited `(#NNN)` suffixes, manual 7-day partition aging) are *reflection-drift* failures, not write-primitive failures — render-only closes them. Rejected (configurable syntax): GitHub-native qualifier strings inside the marker (`<!-- issues: label:obstacle is:open -->`). · Paste-into-web-UI debuggability is a real win but pays for itself only at high query diversity; storyboard rendering needs four fixed shapes. Opinionated markers keep the surface small and the contract testable. Future extension: a single optional timeframe suffix (`<!-- experiments:closed:30d -->`) if another window is ever needed — added only on demand. |
| `boot` missing-section tolerance | Silent tolerance: missing `## Active Claims` / inbox / storyboard slice yields empty arrays in the digest. | Rejected: hard-fail on any missing canonical section. · A hard-fail blocks every agent on first install before `init` runs; the failure mode the spec closes (F11) is silent skipping of memory, not silent tolerance of an absent schema element. `audit` separately flags missing canonical sections, so the install-drift signal is preserved. |
| `init` touches `.claude/settings.json` | `init` installs the Stop-hook entry in Claude Code settings as part of the bootstrap. | Rejected: documented manual installation step. · Manual install reproduces F10/F13 in cohorts of agents who skip the step. The settings.json reach is a one-time scope expansion paid back in mechanical enforcement coverage. |
| Run-from-anywhere via `libutil` `Finder` | Every `fit-wiki` subcommand resolves the project root via `Finder.findProjectRoot(process.cwd())` before touching the filesystem (precedent: `refresh`, `sync`, `init`, `memo` already do this). Agents invoke `fit-wiki <subcommand>` from any working directory in the monorepo — including subagent worktrees, nested service dirs, or website roots — without `cd`. | Rejected: require callers to `cd` to the project root first. · Adds a manual setup step before every invocation, reproducing F4 (probe-heavy probing of "where am I, can I write?"). One Finder call per subcommand is the cheap path. |

## Non-Goals (Restated from Spec)

- No retrofit of pre-cutover weekly logs.
- No `agent-react` dispatch changes.
- No `coordination-protocol.md` / `approval-signals.md` redesign.
- No `libwiki/` internal refactor beyond what the new commands require.
- No external-system survey.

## Trade-offs Accepted

- **CLI dependency.** Step 0 requires `fit-wiki` on `PATH`. Mitigated:
  `fit-wiki` already ships in every Kata installation (`just quickstart`). A
  broken CLI fails loud; a missed `Read wiki/MEMORY.md` fails silent.
- **One more abstraction layer.** Agents interact with memory via a command
  surface. The win on every weekly-log write (6 probes → 1, F4) and every cold
  boot (3 reads → 1) exceeds the conceptual cost.
- **Digest-format coupling.** Downstream skills consume `boot`'s JSON output.
  Treated as a stable contract under semantic versioning; format changes
  require a follow-up spec.
- **Trace-observability shift.** The priority surface read shifts from a
  `Read` tool event to a `Bash: fit-wiki boot` event; the spec's verifier
  reads the trace the same way, observing a subcommand name instead of a
  filename.
- **`gh` CLI dependency for `refresh`.** Extended `refresh` shells `gh issue
  list` for Obstacle / Experiment blocks. `gh` ships with Kata; an unreachable
  `gh` renders the new blocks empty with a stderr warning, leaving XmR intact.

## References

- Spec [1060](spec.md)
- [memory-protocol.md](../../.claude/agents/references/memory-protocol.md) — current
- [libwiki](../../libraries/libwiki/) — CLI implementation (existing modules: `src/commands/init.js`, `src/commands/memo.js`, `src/commands/refresh.js`, `src/commands/sync.js`)
- [wiki-audit.sh](../../scripts/wiki-audit.sh) — to be absorbed
- [kata-session issue-lifecycle](../../.claude/skills/kata-session/references/issue-lifecycle.md) — obstacle / experiment GH-issue lifecycle the extended `refresh` reflects
- Research corpus: [research](../../wiki/memory-protocol-research-2026-05-16.md), [study](../../wiki/memory-protocol-study-2026-05-16.md), [content analysis](../../wiki/memory-protocol-content-analysis-2026-05-16.md), [JTBD](../../wiki/memory-protocol-jtbd-2026-05-16.md), [failures](../../wiki/memory-protocol-failures-2026-05-16.md)
