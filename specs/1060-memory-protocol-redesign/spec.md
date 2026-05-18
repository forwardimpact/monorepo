# Spec 1060 — Memory Protocol Redesign

## Problem

`.claude/agents/references/memory-protocol.md` governs what every agent run
reads on boot, how those reads choose work, and what gets written back. The
file is the on-boot contract for six agents (`improvement-coach`,
`product-manager`, `release-engineer`, `security-engineer`,
`staff-engineer`, `technical-writer`) and the implicit substrate that
`agent-react` event routing depends on. A four-piece research corpus
([index](../../wiki/memory-protocol-research-2026-05-16.md);
[study](../../wiki/memory-protocol-study-2026-05-16.md),
[content analysis](../../wiki/memory-protocol-content-analysis-2026-05-16.md),
[JTBD](../../wiki/memory-protocol-jtbd-2026-05-16.md),
[failures](../../wiki/memory-protocol-failures-2026-05-16.md)) shipped on
2026-05-16 via [#950](https://github.com/forwardimpact/monorepo/issues/950)
documents seven load-bearing gaps between what the protocol says and what
agents do.

The gaps are not opinion — they are measured against the protocol's own
contract:

| Gap | Evidence | Failure id(s) |
|---|---|---|
| The canonical priority surface is dark to its primary readership. | `wiki/MEMORY.md` is Tier-1 "always" per the protocol; 0 reads across 8 inspected traces; only 33% (18 of 54) of wiki files even reference it. | F11 |
| The summary line budget is documented but unenforced. | `release-engineer.md` at 106 lines (+33% over the 80-line cap), `staff-engineer.md` at 83 (+4%). The check is mechanical (`wc -l`) and not wired anywhere. | F10 |
| Weekly logs grow unbounded; every read of one taxes the agent's context window, and reads that cross the Read-tool ceiling fail outright. | 23 of 40 weekly logs (57.5%) exceed the 600-line Read-cap proxy; top files at 1,909 / 1,898 / 1,793 / 1,689 lines. The Read-cap proxy marks the failure tip — every *successful* read of an oversized log still consumes the context the agent needed for its primary task. No budget exists for these files. | F3, F17 |
| Appending an entry to a weekly log has no CLI primitive, so every write fans out across six probes before the first edit. | A single trace catalogued `date`, `ls`, `Read`, `wc -l`, `grep -n`, `Read offset=N` (often past end-of-file), and `tail` — six tool calls before the first write. `fit-wiki` has no `append-log` or `record-decision` subcommand. Every agent that writes a weekly log pays this turn tax. | F4 |
| The wiki has no surface for in-flight work, so parallel agents collide. | 4 production duplicate-work incidents in W18–W20 plus 1 trace incident; tracked at MEMORY.md row 2 / RFC #873. Settled-state-only wiki cannot encode "I am about to start X." | F8, F18 |
| Step 0 ("Read Memory") is declared by 11 skills (current `grep -l "Step 0: Read Memory" .claude/skills/**/SKILL.md` count) but routinely skipped in React-mode runs. | 4 of 4 React-mode participant traces in the study window skipped Step 0; reinforced by the zero-MEMORY.md-read finding. | F5 |
| The Decision block is contracted as the *opening* of each run's log entry, but is written retroactively. | 2 of 2 inspected traces wrote the block at run end, reconstructing what happened. | F6, F13 |

Three findings shape the response shape itself, not just its targets:

1. **Habit contradicts Push.** The JTBD analysis (§ Forces summary, line
   868 of `memory-protocol-jtbd-2026-05-16.md`) names cold-boot context loss
   as the dominant Push toward memory and `gh`/`git`/source code as the
   dominant Habit competing against it. The protocol exists inside this
   tension. A redesign that adds memory surface without weakening the tool
   habit will not change the distribution.
2. **Failures compose.** F1 — the data-loss incident behind #942 / #943 —
   needed *both* a tool bug and a protocol violation to fire. The Failures
   coverage matrix shows the majority of catalog entries (12 of 18 with
   "none" detection, plus 4 others with only reactive or post-hoc detection)
   have no preventive check, so adjacent small failures compose into
   incidents with no single check firing.
3. **Every run pays a context-and-turn tax — most of it silent.** The
   protocol contracts work the agent must do on every boot, but does not
   budget the cost that work charges to the agent's run. Two dimensions
   compound:
   - **Context tax.** F3 (Read-cap overflow) is the *visible* size failure:
     a Read errors out when a weekly log crosses the 25k-token ceiling. The
     *silent* counterpart fires on every successful read of an oversized
     memory file — Tier 1 or Tier 2 — where the tokens consumed are tokens
     the agent will not spend on its primary task. The storyboard alone
     (M05, 571 lines / 72 KB, already over the Read cap) and the largest
     weekly logs (1,909 / 1,898 / 1,793 / 1,689 lines) crowd the agent's
     attention before any domain work begins.
   - **Turn tax.** F4 records six tool calls (`date`, `ls`, `Read`,
     `wc -l`, `grep -n`, `tail`) before the first write of a weekly-log
     entry, because no append primitive exists. Every weekly-log writer
     pays this — it is structural, not incidental.

   A memory protocol that improves the Kata loop has to win on the cost it
   charges every agent that obeys it, not only on the gaps it closes.
   Sizing, primitives, and read frequency are first-order design choices,
   not implementation details.

The protocol also serves jobs it does not name: "find the next thing to pick
up without colliding" (F18 is the cost of leaving this unnamed), "trust
another agent's reported state without re-deriving," "receive memos without
breaking my contract." These appear in the per-agent JTBD enumeration but
nowhere in the protocol text.

Status quo cost: every agent run pays the gap tax in several measurable
currencies.

- **Lost work** when adjacent failures compose (F1).
- **Stolen context** — every Tier 1 or Tier 2 read of an oversized file
  consumes attention the agent needed for its primary task (F3 visible at
  the Read-cap; F17 silent below it; F10 on the summary side).
- **Wasted turns** — six probes per weekly-log append because no primitive
  exists (F4).
- **Routine voids of the on-boot contract** (F5 Step 0 skipped in
  React-mode; F11 `MEMORY.md` unread across 8 inspected traces).
- **Eroded trust in the protocol as written** (F10, F13 — documented
  artifacts that go unchecked; F12 is a separate `STATUS.md` hygiene issue
  and is out of scope here).

The corpus is the diagnostic; this spec is the WHAT/WHY of the response.
The redesign is fundamental to the performance of the entire Kata Agent
system: every agent run starts by paying these costs, so reducing them is
not optimization at the margin — it is the per-run budget the rest of the
agent's work draws against.

## Personas and Job

The hire is **Teams Using Agents** against the Kata product mandate (see
[CLAUDE.md § Primary Products](../../CLAUDE.md#primary-products)):

> Hired by teams using agents to run an autonomous, continuously improving
> development team that plans, ships, studies its own traces, and acts on
> findings.

This spec is the *Act* half of a Study → Act cycle the research corpus
constitutes. The Big Hire — "run a development team that keeps getting
better" — depends on every agent run starting from an accurate picture of
who it is, what's on its plate, and what's already in flight. The Little
Hire — "boot, read, decide, work, write, exit" — is the six-step loop the
memory protocol owns end-to-end.

`JTBD.md` does not currently carry a `<job user="Teams Using Agents">`
entry; the persona is named in CLAUDE.md but the JTBD enumeration covers
only Engineering Leaders, Empowered Engineers, and Platform Builders. This
spec exposes the gap and commits to opening a follow-up issue (titled
`JTBD.md gap: Teams Using Agents persona missing`) at the same time the
spec PR opens, so the gap has an addressable owner outside this spec's
scope. The redesign verifies against the Big Hire and Little Hire stated
in this section regardless of when the JTBD entry lands.

The six agents are the internal surfaces a Kata installation runs. What
each agent reads on boot is the on-boot behavior teams who installed Kata
observe in their own repository — JTBD.md § Empowered Engineers § Equip
Aligned Agent Teams names the closest external job ("Help me give agents
organizational context without bespoke prompts"). Changes to the protocol
are not internal plumbing tweaks; they change what a Kata installation
does on every event the agents run.

## Scope

### In scope

The seven open questions from the research corpus (index § Open questions,
beginning at line 114 of `memory-protocol-research-2026-05-16.md`), plus
the `fit-wiki` CLI surface that realizes the redesigned protocol, become
eight decision areas the redesign must take an explicit position on. Each
names a Failure id the area closes (or accepts),
a target end-state, and the decision the design phase must produce. The
spec stakes the *outcome*; the design and plan choose the mechanism.

| # | Decision area | Closes | Position the redesign must take |
|---|---|---|---|
| 1 | **Tier 1 read set composition.** | F5, F11 | Tier 1 contains only files agents actually read on every cold boot. If `MEMORY.md` is retained, the redesign names what makes it read-worthy. If retired or folded, the canonical-priority-surface job (which it nominally owns) is rehomed to a named surface that decision area #3 must then make read-on-boot. The Tier 1 set after redesign contains no more than 3 files and at least 1 file, counted by file path (a folded-into-elsewhere outcome is fine and counts as zero new Tier 1 files plus whatever absorbs it). |
| 2 | **Weekly-log size budget.** | F3, F17 | Weekly logs have a documented per-week line cap, daily-entry cap, rotation policy, or some combination that bounds growth. The bound is anchored in the *context cost* an agent pays on a Tier 2 read of the log — the design states what fraction of an agent's context window the largest legal log may consume, and picks the line/token/chunk bound that holds it — not only in the Read tool's 25k-token ceiling. The Read-cap is the failure tip; the context tax is the cost on every successful read. The cap is checkable by `wc -l` or equivalent. After the cutover date the design names, no weekly-log file on `main` exceeds the chosen bound (the verification is mechanical: `wc -l wiki/<agent>-YYYY-Www.md` is ≤ bound for every file whose week is on or after the cutover). The append-only audit guarantee is either preserved by the chosen mechanism or its loss is named in the design with the rationale. |
| 3 | **Canonical priority surface readership.** | F11, F8 | After redesign, the priority surface (whatever name and location it takes) is read by every Tier 1 boot, including React-mode participant runs. "Read" is observable in a trace by a file open of the named surface within the run's first ten tool calls. The 0-of-8 trace finding does not recur on a fresh post-redesign sample of ≥8 runs covering at least 3 React-mode participant runs and at least 3 direct skill invocations. |
| 4 | **In-flight work surface.** | F8, F18 | The wiki carries a named read surface (its own file, an extension of an existing file, or a column in an existing table) that lets a booting agent observe what other agents have already claimed before they start work. The surface is machine-readable by the booting agent's normal Tier 1 read (i.e. a file open returns a parseable structure, not just human-readable prose). The redesign defines what a "claim" is — at minimum, claims must distinguish "another agent is actively working on X" from "X is settled state." Specific claim-data schema (branch names, PR ids, ticket ids, expiry policy) is design-phase. |
| 5 | **Mechanical enforcement of the summary contract.** | F10 | The 80-line summary cap, the `<!-- memo:inbox -->` marker, and the "Inbox is the first H2" rule are each, independently, either (a) mechanically gated on commit so a violation fails a checked surface, or (b) explicitly redesigned out of the contract — for example, the 80-line cap could be replaced by a different bound, the marker by a different convention, or a rule could be dropped entirely with rationale. The redesign decides per-rule. The disallowed end-state is "rule remains in the contract text, unchanged, and still unchecked." |
| 6 | **Decision-block adoption rule.** | F6, F13 | The redesign states whether the `### Decision` block is required as the *opening* of each weekly-log entry going forward, and whether the requirement is gated mechanically or by convention. The historical 14-of-40 W14–W16 gap is left in place — past entries are not retrofitted. |
| 7 | **Tool-vs-memory habit position.** | F5; indirect on F4 (append-position guesswork) and F11 (priority surface dark) | The redesign text explicitly states whether agents are expected to prefer memory, prefer tool re-derivation, or use both with a named decision rule, and links the stated position to at least one of F4, F5, or F11 by failure-id reference. Whichever position is taken, the rest of the protocol is consistent with it. The current text is silent on the question; silence is not an acceptable end-state. |
| 8 | **`fit-wiki` CLI surface composition.** | Cross-cuts F3, F5, F8, F10, F17, F18 | The redesign names the complete `fit-wiki` subcommand set that realizes the new protocol — what subcommands exist post-redesign, what each enforces or produces, and which protocol contracts the CLI gates (on commit, in the Stop-hook, or at runtime). Existing subcommands (`memo`, `push`, `pull`, `init`, `refresh`) and the audit script (`scripts/wiki-audit.sh`) are each, independently, retained as-is, modified, retired, or absorbed — with rationale. New primitives required by decision areas #1–#7 (for example, an append-log primitive that closes F4, an in-flight-claim primitive that realizes #4, a Tier 1 read-check primitive that gates #3) are named in the spec and specified in the design. Coherence rule: after redesign, no contract in the protocol is silent on whether the CLI gates it, and no `fit-wiki` subcommand exists without a contract in the protocol it serves. Building the CLI changes is plan/implement-phase work, but they ship in the same PR series as the protocol redesign — the protocol and the CLI that realizes it land together, not in sequence. |

Beyond the eight decision areas, the redesign:

- **Anchors every size bound in context cost.** Wherever the redesign sets
  or carries a size bound — on a Tier 1 file (summary, `MEMORY.md` if
  retained, storyboard or its replacement), on a Tier 2 log, on the
  in-flight-work surface — the bound is stated in terms of the context tax
  every reader pays, not only in terms of the Read tool's 25k-token
  ceiling. Tier 1 files load on every cold boot, so their combined size is
  the floor on the context tax every agent pays before it does any work;
  the redesign states what fraction of the agent's context window that
  floor is allowed to consume. The append-vs-rewrite choice for any
  read-hot file is made with the reader's cost in view, not only the
  writer's.
- **Replaces probe-heavy writes with primitives.** Where the current
  protocol leaves writers to fan out across `date`/`ls`/`Read`/`wc -l`/`grep`/`tail`
  to find an insertion point (F4), the redesign names a primitive — a
  `fit-wiki` subcommand, a Stop-hook contract, or an equivalent — that
  collapses the fan-out to one call. Decision area #8 names the specific
  primitive; this bullet states the principle: no protocol-mandated write
  should cost six probes.
- **Names the jobs it serves.** The shared jobs the protocol demonstrably
  serves but does not name today — "find next thing to pick up without
  colliding," "trust another agent's reported state without re-deriving,"
  "receive memos without breaking my contract" — appear by name in the new
  protocol text or are explicitly disclaimed.
- **Stays internally consistent.** Read paths (what agents are told to
  read) and write paths (what other documents write *to*) reference the
  same set of files under the same names. The MEMORY.md read/write
  divergence (Tier 1 read; 0 reads, 33% wiki cross-reference) does not
  recur for the post-redesign canonical surface, by symmetry of read
  contract and write contract in the protocol text.
- **Stays under the file's current load-bearing scope.** The redesign
  remains the on-boot read contract, the during-run write contract, the
  summary contract, the weekly-log contract, and the priority-surface
  contract. Other concerns the protocol references —
  [coordination-protocol.md](../../.claude/agents/references/coordination-protocol.md),
  [approval-signals.md](../../.claude/agents/references/approval-signals.md),
  per-agent profiles — remain in their own files.
- **Updates affected references.** Skills, agent profiles, and references
  that cite the protocol's current file names (Tier 1 file list,
  `MEMORY.md`, the 80-line cap, the `### Decision` heading, the
  `<!-- memo:inbox -->` marker) are updated to match the redesign. The
  inventory of citations is a design-phase artifact; the spec only
  requires that the redesign land with no dangling references.

### Out of scope, deferred

- **`coordination-protocol.md` and `approval-signals.md` redesign.** These
  are sibling references with their own contracts. The memory protocol's
  changes may surface gaps in either — those gaps are filed as follow-up
  specs, not folded into this one.
- **Agent profile rewrites.** Profile changes that follow mechanically from
  protocol changes (citation updates, Step 0 wording) are in scope.
  Substantive profile redesign (changing what a given agent does, its
  Assess procedure, its skill mappings) is not. Escape route: if the
  redesign cannot land without a substantive profile change, the implementer
  halts and files a follow-up spec rather than expanding this one.
- **`fit-wiki` internal refactor unrelated to the protocol.** Refactoring
  of `libraries/libwiki/` internals that is not driven by a decision area
  above — code organization, dependency cleanup, test restructure,
  unrelated UX polish — is out of scope. The CLI surface as the protocol
  sees it (subcommands, what each enforces, Stop-hook behavior, audit-script
  coverage) is fully in scope per decision area #8. Escape route: if a new
  subcommand the redesign requires demands a substantial dependency change
  (new library, new service, new infra) that doesn't fit in the redesign
  PR series, the implementer halts and files a follow-up spec — but the
  redesign retains the primitive's contract in spec/design text so the
  protocol is not silent on the gap, and the follow-up spec inherits the
  contract.
- **Backfill of past weekly logs to the new contract.** If the redesign
  imposes a weekly-log budget or a Decision-block requirement, past logs
  remain as they are (append-only). The cutover date is named in the
  design, not the spec.
- **`agent-react` workflow changes.** The protocol is the read contract;
  `agent-react` is a separate channel that consumes it. Workflow-level
  changes to React-mode dispatch are out of scope. Escape route: if the
  new read contract cannot be satisfied without a React-mode dispatch
  change, the implementer halts and files a follow-up spec; the redesign
  PR proceeds with whatever read-contract changes are compatible with the
  current dispatch, and `agent-react` work follows.
- **Tracing / detection infrastructure for unenforced contracts.** F2, F7,
  F9, F12, F14, F15, F16 have no protocol-level mitigation and are tracked
  outside this spec. F12 (STATUS.md duplicate rows) is a `STATUS.md`
  hygiene issue, not a memory-protocol issue.
- **Resolution of RFC #873.** The duplicate-work / in-flight-work discussion
  has its own forum. This spec's decision area #4 names the *memory side*
  of the problem (a read surface for in-flight claims); the *gate side*
  (PR-check tripwires) remains with RFC #873 and is followed, not
  preempted, by this spec.
- **External-system survey.** The research corpus explicitly excluded a
  survey of comparable agent memory architectures (`memory-protocol-research-2026-05-16.md`
  § The four-piece corpus, closing paragraph at lines 25–26; § Method note
  begins at line 141 and reiterates the exclusion in its "Excluded by user
  scope choice" bullet). The redesign does not require one.

## Success Criteria

| Claim | Verification |
|---|---|
| The redesigned protocol exists at the same path. | `.claude/agents/references/memory-protocol.md` exists on `main` after the implementation lands; its `git log` shows the redesign commit; the file's first H2 still names "Memory Tiers" or its renamed equivalent and the file is still the file every agent's profile cites for the on-boot contract. |
| Every decision area carries an explicit position. | A checklist mapping each of the eight decision areas above to a present-position assertion in the redesigned protocol (or, for decision area #8, in the protocol or the `fit-wiki` reference it points to) passes for every row. A supporting (not sufficient) mechanical check: `rg -n 'F(3\|4\|5\|6\|8\|10\|11\|13\|17\|18)\b' .claude/agents/references/memory-protocol.md` (extended-regex tool; equivalent forms acceptable) returns at least one hit for each id in the set the redesign decides to keep, where the kept-set is named in the redesign's reference convention. |
| Tier 1 read set is no more than 3 files and at least 1 file, and named. | The redesigned protocol contains a list (heading, table, or diagram) the implementer can copy verbatim; the count of file paths in that list is between 1 and 3 inclusive; every path in the list exists in `wiki/` or is created by the implementation in the same PR. |
| Canonical priority surface is read by every Tier 1 boot. | A post-implementation trace sample of at least 8 runs — comprising at least 3 React-mode participant runs and at least 3 direct skill invocations across at least 3 distinct agents — shows the named priority surface opened in each run's first ten tool calls. The sample is collected by the spec implementer or a designated verifier and posted as a PR comment on the implementation PR; the implementation does not merge until the sample passes. The 0-of-8 finding from the study is not reproduced on this sample. |
| Weekly logs have a budget that binds file state, and the bound is anchored in context cost. | The redesigned protocol contains a numeric or rule-based bound on weekly-log size or growth, and the design names a cutover date. The protocol text (or its design companion) states the *context-cost* rationale for the chosen bound — the fraction of an agent's context window a Tier 2 read of the largest legal log may consume — and is not anchored only in the Read tool's 25k-token ceiling. After the cutover, every weekly-log file on `main` whose ISO week is on or after the cutover satisfies the bound under `wc -l` (or the equivalent measure the budget specifies). Pre-cutover logs are exempt and remain as-is. |
| Summary-contract rules are each gated or each redesigned. | For each of the three rules (80-line cap, `<!-- memo:inbox -->` marker, "Inbox is the first H2"), one of the following is true: (a) a commit hook, CI step, or pre-merge check fails on a `wiki/<agent>.md` that violates the rule, and that gate runs on the repo; or (b) the redesigned protocol no longer carries the rule in its prior form (replaced by a different rule, dropped entirely with rationale, or absorbed into another rule whose gating then applies). The disallowed end-state per rule is "rule carried forward unchanged and still unchecked." |
| In-flight work has a machine-readable read surface. | A new agent run that opens its Tier 1 set obtains the in-flight claim set by file open alone (no `gh pr list`, no `git ls-remote`, no separate tool round-trip). The surface is parseable by a normal Read of the file — for example, by line-prefix grep, by table row, or by a documented schema. A verifier can reproduce the claim set from the surface alone, in under one minute, by reading the file. |
| Decision block requirement is stated. | The redesigned protocol's section on the `### Decision` block contains an unambiguous statement: required at the opening of each weekly-log entry, required at run end, optional, or some named hybrid. The choice is locatable by `rg -n '### Decision' .claude/agents/references/memory-protocol.md` returning a context window that contains a "required/optional/hybrid" keyword within five lines. |
| Tool-vs-memory position is stated and anchored. | The redesigned protocol contains a section, paragraph, or named heading that states the redesign's position on the tool-vs-memory habit and references at least one of the failure ids F4, F5, or F11 by name. The reference is locatable by `rg -n 'F4\|F5\|F11' .claude/agents/references/memory-protocol.md` returning at least one hit inside the tool-vs-memory section. |
| `fit-wiki` CLI surface is enumerated and coherent with the protocol. | The redesigned protocol (or a section it points to) contains a complete list of `fit-wiki` subcommands and audit checks post-redesign. For each existing subcommand (`memo`, `push`, `pull`, `init`, `refresh`) and for `scripts/wiki-audit.sh`, the list states one of: retained, modified (with what changed), retired, or absorbed (into what). For each new subcommand introduced by the redesign, the list states which decision area or protocol contract it serves. The disallowed end-state is a subcommand or audit check that exists in the implemented CLI but is not named in this list. |
| Every CLI primitive maps to a protocol contract, and vice versa. | A two-column mapping (filed in the design or as a section of the redesigned protocol) connects each `fit-wiki` subcommand post-redesign to the protocol contract(s) it gates or surfaces, and each protocol contract that the redesign assigns to the CLI to the subcommand(s) that realize it. A verifier can read the mapping and confirm: no protocol contract assigned to the CLI lacks a subcommand; no subcommand sits without a contract. |
| Protocol redesign and CLI changes ship together. | The implementation PR series that lands the redesigned protocol also lands the CLI changes the redesign requires (added subcommands, modified subcommands, retired subcommands, audit-script changes). The implementation does not merge with a protocol that names a CLI primitive the CLI does not yet implement, unless that primitive's deferral is documented per the escape route in § Out of scope, deferred and the protocol text reflects the deferral. |
| No dangling references to the old file map. | A citation inventory (filed as part of the design or plan) enumerates the call sites of the old file map across `.claude/`, `wiki/<agent>.md` files, `CONTRIBUTING.md`, and `KATA.md`. After implementation, every call site in the inventory either matches the redesigned protocol's terminology or is documented in the inventory as an exempt historical reference (research artifacts dated `2026-05-16`, weekly logs whose ISO week predates the cutover, past changelog entries). New agent-facing references — agent profiles, currently-active skills, and `wiki/MEMORY.md` itself — must match the redesigned terminology with no exempt entries. |
| The corpus stays the diagnostic. | The research corpus pages at `wiki/memory-protocol-*-2026-05-16.md` are not edited or removed by the implementation, verifiable by `git log --follow` on each file showing no commit between the spec merge and the implementation merge. The redesign cites them; it does not retcon them. |

## References

- Issue [#950](https://github.com/forwardimpact/monorepo/issues/950) —
  Memory protocol redesign: research corpus ready.
- [Memory Protocol Research — 2026-05-16](../../wiki/memory-protocol-research-2026-05-16.md)
  — index with six synthesis claims and seven open questions.
- [Memory Protocol Study — 2026-05-16](../../wiki/memory-protocol-study-2026-05-16.md)
  — design and 8-trace evidence.
- [Memory Protocol Content Analysis — 2026-05-16](../../wiki/memory-protocol-content-analysis-2026-05-16.md)
  — what's in `wiki/` today, in numbers.
- [Memory Protocol JTBD — 2026-05-16](../../wiki/memory-protocol-jtbd-2026-05-16.md)
  — per-agent and shared jobs the protocol serves.
- [Memory Protocol Failure Catalog — 2026-05-16](../../wiki/memory-protocol-failures-2026-05-16.md)
  — F1–F18 normalized failure modes.
- [Current memory protocol](../../.claude/agents/references/memory-protocol.md)
  — the file the redesign replaces.
- [coordination-protocol.md](../../.claude/agents/references/coordination-protocol.md)
  and [approval-signals.md](../../.claude/agents/references/approval-signals.md)
  — sibling references, deliberately out of scope.
- RFC Discussion [#873](https://github.com/forwardimpact/monorepo/discussions/873)
  — parallel-domain-assess collision, the gate-side counterpart to
  decision area #4.
- Issue [#942](https://github.com/forwardimpact/monorepo/issues/942) and
  PR [#943](https://github.com/forwardimpact/monorepo/pull/943) — F1's
  tool-side fix, illustrating the tool+protocol composition pattern named
  in the Problem section.
