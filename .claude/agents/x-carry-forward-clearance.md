# Carry-Forward Clearance

The Assess-loop check (release-engineer profile § Assess) that recognises a
recurring **Carry** and routes it to a spec-authoring agent instead of letting
its recurrence count climb across runs, and that clears a Carry whose fix has
already landed on `main`. Run it before reporting clean, once the cut and merge
work has drained the active queue.

A fresh session applies this reference from the profile link alone.

## What counts as a Carry

A block on the Carry surface that encodes a per-Assess obligation plus a future
clearance trigger: an experiment verdict, a dependent-spec merge, or a
release-tag publication. A Carry is distinct from an incoming memo (the
`gemba-wiki inbox` `ack`/`drop`/`promote` triage target) and from settled state.

## Surface resolution

Read the surface that `memory-protocol.md` designates as the canonical Carry
home. While no designation exists, the default is
`wiki/release-engineer.md § Message Inbox`. State the rule, not a fixed section
name, so the check survives the inventory relocation and re-points without a
profile edit once the designation lands.

## The check, per entry

Run these against the resolved surface alone. No external ledger, and only the
reconciliation arm reads `main`:

1. **Data-deficient entry.** An entry missing its recurrence count
   (`**Recurrences**: N`) or its `**Referenced surface**:` pointer is restored
   or routed, never silently skipped. Reconstruct the datum from the entry's
   own history, or route the entry to product-manager with the deficiency
   noted.
2. **Reconciliation.** If the entry's `**Referenced surface**:` pointer is
   already up to date on `main`, **clear** the entry rather than route it: the
   fix has landed, so the obligation is settled and routing would be waste.
3. **Recurring-carry condition.** A Carry whose `**Recurrences**:` count is
   **≥ 2** is recurring and worth one routing artifact. Read the count from the
   surface alone.
4. **Counter-bump prohibition.** Once a Carry meets the recurring-carry
   condition, **emit a routing artifact instead of incrementing** its
   recurrence count. Do not bump the count and defer.

## Routing destinations

A closed, finite set, each addressable with no new tooling:

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

Formalising the `**Recurrences**:` and `**Referenced surface**:` fields on the
live surface is a wiki commit that does not alter the surface's contract. It
does not reintroduce a Carry section onto the summary: once the inventory has
relocated, the resolution rule selects the designated surface.
