# Spec 1770 — Sealed weekly-log part H1 numbering agrees with the filename slot

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The wiki is the team's memory substrate, and sealed weekly-log parts are its long-lived history. Today a sealed part's H1 routinely contradicts its own filename — a file on slot 5 titles itself "part 1 of 1", a part titled "part 4 of 4" sits beside a live part 5. Every later reader — an agent skimming a teammate's history, a human auditing a forensic trail — gets numbering that misdescribes the record. Misleading memory is worse than missing memory: it is read and believed. |
| Empowered Engineers | [Operate a Predictable Agent Team](../../libraries/README.md#empowered-engineers-operate-a-predictable-agent-team) | libwiki is hired for stable memory that persists across sessions. Its re-bisection path documents the part numbers it writes as local to one split and not validated by the audit — output that self-describes incorrectly by design, with a doc note as the only guard, pushing the reconciliation burden onto every reader instead of writing a header that is simply true. |

## Problem

When a weekly log is sealed into parts, two independent numbering systems are
in play and they are never reconciled:

- **The H1 number** is rendered by the bisector while packing, *local to that
  one split*: a bisection producing two chunks titles them "part 1 of 2" and
  "part 2 of 2" — regardless of where they will land.
- **The filename slot** is allocated *after* rendering, by scanning for the
  next free `…-partN.md` sibling slots, and is never fed back into the header.

The result is structural, not incidental, and was observed in the #1581
incident wiki:

| Debris shape | Example observed |
|---|---|
| Whole-file force-rotation seals a single chunk titled "part 1 of 1" onto whatever slot is free. | A junk file sealed onto slot 5 self-described as "part 1 of 1". |
| Each rotation's totals freeze at seal time and go stale as later parts seal. | `product-manager-2026-W24-part4.md` opens "part 4 of 4" while part 5 and beyond exist. |

This is a documented trade-off, not a regression: the re-bisection path's
documentation records that sub-part numbering is local to its split, that
sibling parts are never renumbered, and that the audit does not validate the
numbers. The trade-off protects a real invariant — **sealed siblings are never
renumbered or rewritten** (the weekly-log contract is append-only; the only
sanctioned rewrite of a sealed part is the in-place re-bisection of an
over-budget part, which splits content without touching siblings). But it
concedes the header. Under that invariant, any "of M" total is doomed: M is
the count of the week's parts, which is unknowable until the week is over and
changes with every subsequent seal. A header containing "of M" is either stale
or requires rewriting sealed siblings. The debris is therefore not a rendering
bug to patch but a grammar that cannot be kept true.

### Why `(part N)`, not slot-fed totals or sibling renumbering

| Option | Verdict | Why |
|---|---|---|
| Feed the slot back but keep "of M" | Rejected — half-fix | N becomes true at seal time, but M goes stale the moment the next part seals. "part 4 of 4" beside a live part 5 is exactly the observed debris; this option reproduces it forever. |
| Drop the total: `(part N)`, N = the filename slot | **Chosen** | The only header that is always true under the never-renumber invariant: N is a fact about the file itself and never changes. The header agrees with the filename at seal time and forever after. |
| Renumber sealed siblings so "of M" stays true | Rejected | Violates the never-renumber invariant — the documented trade-off exists precisely to avoid this — and rewrites every sibling on every rotation, inflating diffs and breaking the append-only contract. |

The bisector's budget measurement of candidate chunks is exact today because
the header's cost is independent of the digits in its numbers; the shorter
grammar must preserve that property, and this spec asserts it as a success
criterion rather than leaving it implicit.

### Paired contract: spec 1760 (issue #1574)

This spec is authored in the same pass as spec 1760 (the wiki filename-grammar
admission contract), per the scoping decision recorded on #1582. The boundary
and the shared decisions:

- **Spec 1760 owns filename admission** — which files may exist under the
  wiki. **This spec owns heading semantics** — what a sealed part's H1 says —
  and the write path that renders it. Neither rule needs the other's
  mechanism: admission never reads the H1, and the write path never consults
  the allowlist.
- **One contract home, written once**: the memory-protocol's weekly-log
  contract section — which already names the `<agent>-YYYY-Www-partN.md`
  filename convention — gains the sealed-part heading grammar. Spec 1760
  formalises the filename half in the same section; the shared home is how
  the two grammars cannot drift, but this spec's deliverable does not wait on
  spec 1760's (see success criteria).
- **Shared audit posture — the #1185 precedent.** The previous stray-file
  audit rule was removed because it rejected legitimate existing files on day
  one. The same failure mode threatens here: the audit's heading-shape
  pattern currently treats the `(part N of M)` suffix as optional, so live
  wikis hold sealed parts of two valid legacy shapes — with the suffix, and
  with a bare `# <agent> — YYYY-Www` heading (the monorepo wiki at HEAD holds
  roughly two dozen of the bare shape). A strict cut-over to the new grammar
  would fail every one of them the day it ships. Both specs therefore adopt
  the same posture: no day-one findings on legitimate existing files —
  grandfathered acceptance of the legacy shapes here (with no sunset; see out
  of scope), survivable admission rules there.

## Scope

### In scope

| Component | What changes |
|---|---|
| Sealed-part heading grammar | A freshly sealed part's H1 becomes `# <agent> — YYYY-Www (part N)`, where N is the part's own filename slot number — each H1 carries the slot it actually occupies, on **both** seal paths: whole-log rotation (fresh slots) and over-budget part re-bisection (the first sub-part reuses the source slot, the rest take fresh sibling slots). |
| Main weekly-log heading | Unchanged: a fresh main log is written with `# <agent> — YYYY-Www`, no part suffix. What main-log heading validation accepts is also unchanged — including that it tolerates part-suffixed H1s today; this spec neither tightens nor loosens it. |
| Budget measurement | Measurement of packed chunks remains exact under the new grammar: a chunk's measured size equals its sealed rendered size regardless of how many digits the slot number has. |
| Audit heading validation (shape-only) | Sealed-part heading validation additionally accepts the new `(part N)` shape. Every shape it accepts today — legacy `(part N of M)` and the bare suffix-less heading — remains accepted, so no existing sealed part gains a finding; structurally broken headings that fail today (missing separator, bad week token, malformed suffix) keep failing. The agent-prefix consistency check derives the agent title from all accepted shapes. |
| Audit hint text | The sealed-part heading hint names `(part N)` as the grammar to write, noting legacy shapes remain valid on historical parts. |
| Contract documentation | The memory-protocol's weekly-log contract section declares the sealed-part heading grammar next to the filename convention it already names (spec 1760 formalises the filename half in the same section). The same edit reconciles that section's absolute "no part is ever rewritten" sentence with the sanctioned in-place re-bisection of an over-budget part, so the contract home does not deny a rewrite the tooling performs. The re-bisection path's local-numbering trade-off note is replaced by the new contract: the H1 number is the filename slot. |

### Out of scope

- **Filename admission for the wiki tree** — spec 1760 (issue #1574) territory.
- **Retro-correction of already-sealed headers.** Sealed siblings are never
  rewritten for cosmetics; legacy headers — including the observed
  "part 1 of 1" and "part 4 of 4" debris and the bare suffix-less shape — are
  grandfathered via transitional acceptance, not rewritten.
- **Header↔filename number-agreement validation in the audit.** Such a rule
  would flag immutable legacy debris that no remediation may touch —
  permanent flag-for-human noise. Agreement on freshly sealed parts is
  guaranteed by the write path that creates them and verified by the
  seal-path success criteria below (test coverage — no runtime self-check is
  required), consistent with the current posture that the audit checks shape,
  not numbers.
- **Renumbering sealed siblings** — rejected above; violates the
  never-renumber invariant.
- **Sunsetting the legacy shapes.** Acceptance of `(part N of M)` and the
  bare heading has no scheduled removal; historical parts remain valid
  indefinitely.
- **The historical wiki-migration script** that once minted `(part N of M)`
  headers — a completed one-shot whose output is grandfathered like every
  other legacy part; it is not a live write path and is not updated.
- **Budgets and rotation triggers** — cap values, the rotation guard, and the
  bisect-at-day-seams behaviour (spec 1450) are unchanged; only the header
  the seal writes changes.

## Success Criteria

| Claim | Verification |
|---|---|
| First rotation of a week seals parts whose H1 numbers equal their filename slots. | Rotate (`fit-wiki rotate`) an over-budget multi-day log with no existing parts; observe every produced `…-partN.md` opens with `(part N)`. |
| Rotation beside existing sealed siblings continues the slot sequence in the headers. | Pre-occupy part slots 1–4, rotate a log that seals into two parts; observe they land on slots 5 and 6 with H1s `(part 5)` and `(part 6)`. |
| Whole-file force-rotation no longer mints "part 1 of 1" debris. | Force-rotate a log that seals as a single chunk onto slot 5; observe its H1 reads `(part 5)`. |
| Re-bisecting an over-budget sealed part numbers every sub-part by the slot it occupies. | Re-bisect (`fit-wiki fix`) an over-budget part on slot 2 beside existing parts 1–3; observe the overwritten slot-2 file opens with `(part 2)` and each fresh sibling's H1 equals its own new slot number. |
| Freshly sealed headers carry no totals that can go stale. | Starting from a wiki with no sealed parts, rotate repeatedly within one week; observe no produced H1 contains an "of M" total and every produced header agrees with its filename. |
| Budget measurement stays exact under the new grammar. | Seal a residue-free source whose parts land on two-digit slots; observe each sealed part is at-or-under both budgets (the measured-equals-rendered property is asserted at unit level against the seal output). |
| Existing sealed parts pass the audit on day one. | Run `fit-wiki audit` over a fixture holding both legacy shapes — `(part N of M)` and bare suffix-less headings, mirroring the live tree at HEAD; observe zero heading-shape findings. |
| The new shape is valid; structurally broken headings still fail. | Audit a fixture with a legacy-suffixed part, a bare-headed part, a new-shaped part, and a part whose heading fails today (bad week token or missing separator); observe exactly the last yields the heading-shape finding. |
| Main-log heading validation behaviour is unchanged. | Audit a main weekly log of each shape it accepts today (bare and part-suffixed) and one it rejects today; observe identical findings before and after the change. |
| The agent-prefix consistency check covers all accepted shapes. | Audit one part of each accepted shape whose H1 title does not match its filename agent prefix; observe each is flagged. |
| Within-budget sealed files are not rewritten by this change. | Run rotation and `fit-wiki fix` against a wiki holding within-budget legacy-headed sealed parts; observe those files byte-identical afterwards (over-budget parts are exempt — in-place re-bisection is their documented remediation). |
| One contract home, hint in agreement. | The memory-protocol weekly-log contract section states the sealed-part heading grammar next to the filename convention it names, the audit hint names the same grammar, and the re-bisection path's documentation describes the H1 number as the filename slot — no surviving "local to this split" caveat. |

— Product Manager 🌱
