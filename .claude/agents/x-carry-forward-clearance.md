# Carry-Forward Clearance

This is the Assess-loop check (release-engineer profile § Assess). It
recognises a recurring **Carry** and routes it to a spec-authoring agent.
Without the routing, the recurrence count climbs across runs. The check also
clears a Carry whose fix already landed on `main`. Run it before you report
clean, once the cut and merge work drained the active queue.

A fresh session applies this reference from the profile link alone.

## What counts as a Carry

A Carry is a block on the Carry surface. It encodes a per-Assess obligation
plus a future clearance trigger: an experiment verdict, a dependent-spec merge,
or a release-tag publication. A Carry is distinct from a memo that arrives (the
`gemba-wiki inbox` `ack`/`drop`/`promote` triage target) and from settled state.

## Surface resolution

Read the surface that `memory-protocol.md` designates as the canonical Carry
home. While no designation exists, the default is
`wiki/release-engineer.md § Message Inbox`. State the rule. Do not state a
fixed section name. The check then survives the inventory relocation. It
re-points without a profile edit once the designation lands.

## The check, per entry

Run these against the resolved surface alone. Use no external ledger. Only the
reconciliation arm reads `main`:

1. **Data-deficient entry.** Some entries lack a recurrence count
   (`**Recurrences**: N`) or the `**Referenced surface**:` pointer. Restore or
   route such an entry. Never skip it silently. Reconstruct the datum from the
   entry's own history, or route the entry to product-manager and note the
   deficiency.
2. **Reconciliation.** If the entry's `**Referenced surface**:` pointer is
   already up to date on `main`, **clear** the entry rather than route it. The
   fix landed, so the obligation is settled. A routing artifact would be waste.
3. **Recurring-carry condition.** A Carry whose `**Recurrences**:` count is
   **≥ 2** is recurring and worth one routing artifact. Read the count from the
   surface alone.
4. **Counter-bump prohibition.** Once a Carry meets the recurring-carry
   condition, **emit a routing artifact**. Do not increment its recurrence
   count. Do not bump the count and defer.

## Routing destinations

The set is closed and finite. Each destination is addressable with no new
tooling:

1. A GitHub Issue labeled `needs-spec` + `agent:product-manager` (the canonical
   destination for a structural Carry that needs a spec).
2. `kata-dispatch` to product-manager.
3. A Discussion when the Carry is a convention question.

## Carry-surface entry fields

The check reads two named fields, inline on each Carry entry:

- `**Recurrences**: N` — the count the recurring-carry condition compares
  against.
- `**Referenced surface**:` — the pointer the reconciliation arm checks on
  `main`. Where no surface applies, the entry's clearance trigger
  (`**Carry-clearance:**`) names the condition instead.

When you formalise the `**Recurrences**:` and `**Referenced surface**:` fields
on the live surface, you make a wiki commit. That commit does not alter the
surface's contract. It does not reintroduce a Carry section onto the summary.
Once the inventory relocates, the resolution rule selects the designated
surface.
