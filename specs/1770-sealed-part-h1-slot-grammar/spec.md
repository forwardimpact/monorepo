# Spec 1770 — Sealed weekly-log part H1s agree with their filename slot

Paired with [Spec 1760](../1760-wiki-filename-admission-grammar/spec.md)
(filename admission), authored in the same `kata-spec` pass per the
[pairing decision](https://github.com/forwardimpact/monorepo/issues/1582#issuecomment-4675802555).
This spec owns heading **semantics** — what a sealed part's H1 says — and the
write path that renders it. Spec 1760 owns filename **admission**. Both
grammars are declared in one shared contract home (Spec 1760 § Decision 2)
and share one grandfathering posture (§ Grandfathering).

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | fit-wiki's job is stable memory that persists across sessions. Sealed weekly-log parts are that memory's archive, and their H1 self-description routinely contradicts their filename: a part sealed to slot 5 titles itself "part 1 of 1"; a part on slot 4 says "part 4 of 4" while part 5 and beyond exist. Every reader — human or agent — navigating sealed memory gets numbering that disagrees with the files in front of them. Zero data loss, but the debris accumulates as misleading memory on every rotation. |

## Problem

Part numbers in a sealed part's H1 are local to each bisection and are never
reconciled with the filename slot allocated afterwards. The bisection renders
`(part N of M)` H1s where N and M count **that split only**, and the sealing
step then assigns real filename slots — after rendering, with no feedback into
the header. This is a documented trade-off in the write path's contract (the
recorded local-numbering note: sibling parts are never renumbered, and the
audit does not validate the numbers), not a regression — but issue #1582's
observations show the cost: a whole-file force-rotation seals junk titled
"part 1 of 1" onto slot 5, and incremental rotations strand stale totals.

Three repair directions exist, and two fail structural constraints:

- **Feed the slot back but keep "of M"** — N becomes true at seal time, but M
  is unknowable then: the moment a later part seals, "of M" is stale again.
  This reproduces the observed debris.
- **Renumber sealed siblings to make "of M" true** — violates the sealed-part
  immutability convention (no part is ever rewritten; the append-only audit
  guarantee is preserved by rename, not in-place edit) and inflates diffs on
  every rotation.
- **Drop "of M"** — a header carrying only the slot number is the only
  self-description that is always true under immutability.

## Decisions settled by this spec

### Decision 1 — Heading grammar: `(part N)`, N = filename slot

A sealed part's H1 becomes `# <Agent Title> — YYYY-Www (part N)`, where N is
the part number in the file's own name — rendered after slot allocation, so
the two agree by construction. The live main log's H1 is unchanged
(`# <Agent Title> — YYYY-Www`). "of M" is dropped: under sealed-part
immutability it can never stay true, per § Problem.

### Decision 2 — Audit posture: transitional shape, no number validation

The audit's sealed-part heading-shape rule — severity fail today, so a strict
grammar cut-over fails non-conforming parts on day one, the #1185 failure mode
(a rule deleted for rejecting legitimate existing files) that paired Spec 1760
is built to avoid — accepts **three** shapes:

| Shape | Status |
|---|---|
| `… YYYY-Www (part N)` | written grammar — all parts sealed from this change forward |
| `… YYYY-Www (part N of M)` | accepted legacy — split-local numbering from prior seals |
| `… YYYY-Www` (no part clause) | accepted legacy — 24 sealed parts at HEAD carry a bare H1 (verified 2026-06-11), admitted today by the shape rule's optional part clause |

Weekly-log files are classified as parts by **filename**, not by H1 — the
heading grammar change does not touch classification, and no criterion here
depends on it. The audit continues **not** to validate header-versus-filename
number agreement — immutable legacy debris would make that pure
flag-for-human noise about files nothing may rewrite. Agreement for newly
sealed parts is enforced by write-path tests instead, consistent with the
current documented posture.

The live main log shares its shape rule's grammar with sealed parts today,
so the rule already tolerates part suffixes on a live log's H1. This spec
changes nothing the write path produces for a live log; on the audit side the
design may either let the shared rule's tolerated suffix set widen to include
`(part N)` on a live log or split the rules — both are acceptable, because
this spec constrains sealed-part semantics only.

### Decision 3 — No retro-correction

Existing sealed parts keep their legacy H1s. The same immutability argument
that rules out renumbering siblings rules out rewriting sealed headers for
cosmetics. One stated exception: re-bisecting an over-budget legacy part
rewrites that part by definition, and its products carry new-grammar H1s.
Debris already in the tree ages out as weeks pass; correctness applies from
this change forward.

### Decision 4 — Budget measurement stays exact

Packed chunks are measured exactly under the new grammar: the measurement
used during packing equals the rendered output's actual counts, header
included, and a packed (non-residue) sealed part never exceeds the line or
word budget. The existing residue carve-out is unchanged: an irreducible
over-cap chunk (a lone over-budget day-section, an over-cap prologue) is
deliberately sealed over budget and reported, exactly as today. Because
header cost is part of measurement and the new header is shorter, exact
split positions may differ from what the legacy header would have produced —
the seam-selection logic is unchanged, and the binding invariants are exact
measurement, within-budget packed parts, and slot-accurate headers, not
byte-identical split placement.

## Grandfathering

Shared posture with Spec 1760: **existing files never need rewriting or
renaming.** This spec grandfathers legacy headings via the transitional shape
grammar of Decision 2, whose declaration in the shared grammar section states
which shape is write-path-current and which are accepted-legacy; Spec 1760's
filename half needs no legacy shapes because its grammar admits every
legitimate file at HEAD as a class. Per Spec 1760 § Decision 2, whichever
paired implementation lands first creates the shared section with its own
half; the second extends it.

## Scope

### In scope

| Component | What changes |
|---|---|
| Weekly-log sealing and re-bisection write path | Renders each sealed part's H1 from its allocated filename slot as `(part N)`; applies to both fresh seals and re-bisection of an over-budget part. |
| Heading grammar contract | Declared in memory-protocol.md's shared grammar section (one home with Spec 1760's filename grammar): `(part N)` written, `(part N of M)` and bare accepted-legacy. |
| Audit sealed-part heading-shape rule (and its hint text) | Accepts the three shapes of Decision 2; continues validating shape only, never header↔filename number agreement. |
| The write path's documented numbering contract | The recorded local-numbering trade-off note is updated to the new contract: N is the filename slot; there is no M. |

### Out of scope

- **Filename admission** — Spec 1760.
- **Rewriting any existing sealed part** (Decision 3), and any audit rule on
  header↔filename number agreement (Decision 2).
- **Weekly-log scope classification** — filename-based today and untouched.
- **Bisection seam selection and budget values** — only the rendered header
  grammar changes (Decision 4 states the measurement invariants).
- **Other H1 grammars** — summaries, storyboards, and the live main log are
  untouched, including the main-log shape rule's pre-existing tolerance noted
  in Decision 2.

## Success Criteria

| Claim | Verification |
|---|---|
| A freshly sealed part's H1 number equals its filename slot. | In a test wiki with parts 1–4 occupied, rotate an over-budget main log; observe every newly sealed file's H1 number equals its own filename slot, the first landing on slot 5 with H1 `… (part 5)`. |
| Re-bisected sub-parts carry slot-accurate H1s. | Re-bisect an over-budget sealed part; observe each produced file's H1 number equals its own filename slot, including the reused source slot. |
| Repeat rotations produce no contradictory totals. | Run successive rotations in a test wiki; observe no **newly sealed** H1 contains "of M" and no newly sealed H1 contradicts its filename. |
| Sealed siblings are never touched. | Rotate with pre-existing sealed parts present; observe every pre-existing part byte-identical. |
| All three heading shapes pass the audit. | Run `bunx fit-wiki audit` against the live wiki at HEAD (all bare-H1 and `(part N of M)` parts present there) and against fixtures with `(part 2 of 3)`, a bare H1, and `(part 5)`; observe no heading-shape finding for any of them. |
| The agent-prefix audit still guards new-grammar H1s. | Audit a fixture sealed part whose `(part 5)` H1 names a different agent than its filename; observe the existing H1-agent-matches-filename rule flags it. |
| Budget measurement of packed chunks remains exact. | Run the packing/rotation test suite; observe every packed (non-residue) sealed part within both budgets, measurement equal to the rendered output's actual counts, and the residue path still sealing-and-reporting irreducible over-cap chunks as today. |
| The heading grammar's home is the shared section. | Read memory-protocol.md's grammar section; observe the heading grammar's written and accepted-legacy shapes declared there (beside the filename grammar once Spec 1760's implementation has also landed). |
| The write path's documented contract matches the new behaviour. | Read the sealing/re-bisection contract documentation; observe it states N is the filename slot with no local-M caveat. |

— Product Manager 🌱
