# Spec 1860 — Memo delivery must not publish the summary-budget breach it reports

## Personas and Jobs

| Persona             | Job                                                                                                                 | How the gap blocks progress                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Teams Using Agents  | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The memo channel is the team's mechanism for bounding owner-activation latency — how fast a file's owner learns their memory surface needs repair. Because the summary budgets count undischarged memo bodies, delivering a memo to an at-cap summary itself publishes a budget breach, so senders withdraw exactly the memos the situation most needs delivered. The repair channel is suppressed precisely when repair is needed. |
| Empowered Engineers | [Operate a Predictable Agent Team](../../libraries/README.md#empowered-engineers-operate-a-predictable-agent-team)  | `libwiki` promises stable agent memory with enforced budgets. Two of its contracts are individually sound and jointly contradictory at a reachable state: "summaries stay under budget" and "memos are delivered into the recipient's summary." Operators see the contradiction as recurring red audit checks and undocumented sender-withdrawal workarounds the library neither documents nor supports.                            |

## Problem

The summary audit budgets — `summary.word-budget` (limit 2048 words) and
`summary.line-budget` (limit 496 lines), both severity `fail` — measure an agent
summary file **inclusive of the `## Message Inbox` section**, the same section
into which `fit-wiki memo` delivers cross-agent memos. The primitives interact
destructively at the budget boundary:

- At **limit cycle** — when a summary's chronic headroom is smaller than a
  typical memo — _any_ memo delivery publishes a budget breach, or must be
  withdrawn by the sender to avoid publishing one.
- **Owner-repair memos** ("your summary breached, please trim") are exactly the
  traffic a limit cycle generates. The channel fails closed against its own
  highest-value payload.
- The memo channel is what bounds **owner-activation latency**, the variable
  that dominates how long a deterministic-class breach stays published: 22m58s
  with the owner inactive (issue #1480 sighting 7) versus 1m47s with the owner
  in-session (sighting 10).

The mechanism is deterministic and reproduced; this is a design contradiction to
resolve, not a hypothesis to test (routing decision: issue #1480,
improvement-coach routing comment of 2026-06-12).

### Evidence — sender-withdrawals, n=3

| #   | Date       | Sender                                                     | Memo size | Receiver state                     | Outcome                                                                                                                    |
| --- | ---------- | ---------------------------------------------------------- | --------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | 2026-06-11 | technical-writer                                           | 174 words | over budget                        | withdrawn to avoid deepening the published breach                                                                          |
| 2   | 2026-06-12 | product-manager                                            | 33 words  | at limit cycle                     | withdrawn; pointer-form size pre-emption still insufficient                                                                |
| 3   | 2026-06-12 | security-engineer (report-attributed; shared bot identity) | 28 words  | 2041/2048 words (7 words headroom) | delivery would have re-published the just-repaired breach (2069/2048); withdrawn in the same push, pre-empting publication |

Withdrawals 2 and 3 demonstrate that **size discipline cannot fix this**: even
minimal pointer-form memos (33 and 28 words) exceed chronic headroom at limit
cycle. The interaction is structural, not behavioural.

Suppression also manifests as **channel avoidance**, not only withdrawal: on
2026-06-12 an audit finding was routed to its owner via a facilitated session
instead of `fit-wiki memo`, expressly to avoid breaching the breached file
(release-engineer corroboration, spec PR thread); the receiving summary sat at
29 words of headroom — under the cap, yet effectively unreachable by memo.

## What

Resolve the contradiction so that delivering a memo to an agent whose summary is
near, at, or over a summary budget does not itself create, deepen, or re-publish
a summary-budget breach — while preserving the three properties the current
design exists to provide:

1. **Bounded inbox inventory** — undischarged memo bodies remain subject to an
   enforced bound. Today the summary budgets are the only backstop against
   unbounded inbox growth; any change that removes memo bodies from those
   measures must keep inventory bounded. The bound must not recreate the dilemma
   one level down: a single delivery to a recipient whose inbox conforms to the
   bound must never be the act that trips it — exceeding the bound is
   attributable to the recipient's triage, never to a sender's delivery.
2. **One delivery target, one triage surface** — a sender uses the same delivery
   command per recipient regardless of the recipient's budget state, and a
   recipient discovers and triages every delivered memo through a single surface
   (`fit-wiki inbox list|ack|promote|drop`).
3. **No unmeasured content class** — today the summary budgets measure every
   region of the summary file, memo and non-memo text alike. Non-memo text
   already lives inline in inbox sections (discharge and lifecycle annotations,
   e.g. `wiki/security-engineer.md`'s inbox line), so a bound on memo bodies and
   an exemption on a file region do not cover the same set. Any region the
   design exempts from the summary measures, and any out-of-band store it
   introduces, must remain subject to at least one enforced, audit-visible bound
   — otherwise the exemption becomes a budget-evasion surface that limit cycle
   pressure selects for, the same way it selected for sender-withdrawals.

## Alternatives recorded at routing

Two directions were tabled in the routing decision; the design phase selects
between them — or a synthesis — as its deliverable. The product owner's
directional preference is recorded in the routing thread on issue #1480, not
here, so the design starts unanchored.

| Alternative | Direction                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------ |
| A1          | Exempt inbox/memo bodies from the summary budget measures, with a compensating inbox bound |
| A2          | Route memos for breached (or near-cap) files out of band                                   |

Whichever direction is chosen must satisfy every success criterion below; the
criteria are mechanism-neutral.

## Scope

| In scope                                                                                                           | Out of scope                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libwiki` summary-scope audit budgets (`summary.word-budget`, `summary.line-budget`) and any new inbox-scope bound | Weekly-log, weekly-log-part, and storyboard budgets                                                                                                                                       |
| `fit-wiki memo` delivery behaviour and `fit-wiki inbox` triage behaviour                                           | Issue #1480's own scope (Carry-only) — this spec resolves one mechanism the sighting series surfaced; the series' carry protocol is unchanged                                             |
| Memory-protocol documentation of the budget/memo interaction                                                       | Experiment #1485 (verdict-write due 2026-06-15) — adjacent only as a consumer of wiki budget state; its verdict path must not move                                                        |
|                                                                                                                    | The spec-1610 / issue-1490 fix path — adjacent summary-budget work already awaiting its human gate; this spec must not modify or depend on it                                             |
|                                                                                                                    | Summary breaches with non-memo causes (e.g., the 2026-06-12 canonicalization double-carry breach) — same budget class, distinct mechanism; not evidence for this spec and not fixed by it |

## Success criteria

1. Delivering a memo to a recipient whose summary is near (within one memo of),
   at, or over a summary budget limit does not create, deepen, or re-publish a
   summary-budget audit finding — verified by `bun test libraries/libwiki`.
2. Undischarged memo inventory — including memos routed to or held in any
   out-of-band store the design introduces — has an enforced, audit-visible
   bound, and a single delivery to a recipient whose inbox conforms to the bound
   does not trip it — verified by `bun test libraries/libwiki`.
3. A sender uses the same delivery command regardless of the recipient's budget
   state, and the recipient discovers every delivered memo via
   `fit-wiki inbox list` — verified by `bun test libraries/libwiki`.
4. The memory-protocol reference documents the budget/memo interaction and
   states budget figures that match the enforced limits — verified by reading
   `memory-protocol.md`.
5. Every content region of the summary file, and any out-of-band memo store the
   design introduces, is subject to at least one enforced, audit-visible bound;
   no content class is exempt from every measure — verified by
   `bun test libraries/libwiki` with a negative fixture placing non-memo text in
   the exempted or out-of-band surface and asserting a bound still measures it.

## Constraints and monitoring

- **Post-ship monitoring (not an acceptance criterion):** sender-withdrawals
  attributable to receiver budget state are expected to stop; the issue #1480
  sighting series is the observation channel.
- **Escalation trigger:** a fourth sender-withdrawal, or any delivery failure
  that measurably extends a deterministic-class breach residence, escalates at
  the issue #1480 series read scheduled 2026-06-24 if this spec has not
  dispositioned by then.
- This spec sharpens the issue #1480 synthesis read scheduled 2026-07-02; it
  does not re-route it.

— Product Manager 🌱
