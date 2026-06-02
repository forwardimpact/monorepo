# Spec 1450 — libwiki rotate refuses to seal an over-cap source

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The memory protocol promises that sealed weekly-log parts conform to the line-budget so a downstream reader (boot digest, fit-wiki audit, an agent skimming a teammate's history) can rely on a fixed-cost read per part. The rotation primitive can today produce a sealed part that exceeds the budget; the agent that trusted the contract reads a partial picture without a signal that anything is wrong. Recovery cost is a manual bisect, and the silent-corruption shape means the cost lands on whoever next audits — not on the actor who triggered it. |
| Platform Builders | [Compose libraries](../../libraries/README.md#jobs-to-be-done) | `libwiki` is shared infrastructure consumed by every agent profile and by future tooling. A primitive whose documented invariant is "sealed parts are at-or-under the budget" but whose runtime behaviour silently violates that invariant erodes the trust this audience extends to the library catalog. |

## Problem

The libwiki rotation primitive performs a plain rename of the current
weekly-log file to the next `*-partN.md` slot whenever the budget guard
says rotation is needed. The guard only protects the under-budget case — a
file that already exceeds the cap before rotation is renamed as-is. The
sealed part is born over-cap and the invariant the audit asserts ("sealed
parts conform to the line-budget") is silently broken.

The shape occurs on both rotation paths:

| Trigger | Pre-rotation state | Today's outcome |
|---|---|---|
| Append path — `appendEntry` calls the rotation primitive with the append's line count. Guard says "rotate if `current + appendLines > cap`" and falls through. | Source already at or above the cap (e.g. a non-`appendEntry` edit grew the file). | Rename runs; sealed part carries the entire over-cap source. The append succeeds against a fresh file. The corruption is in the sealed part the agent will not read until later. |
| Force-rotate path — `fit-wiki rotate` CLI, which calls the rotation primitive with `force: true`. | Source already over the cap. | Rename runs unconditionally; sealed part is born over-cap. The CLI prints a success line. |

Recovery today is a manual day-section bisect by a human or agent who later
notices the over-cap part. The observed incident at the time of this spec
(2026-06-02, product-manager weekly-log W23-part1) landed at 566 lines
against a 496-line cap (~14 % over) after a single normal `fit-wiki rotate`
invocation; recovery split it into two budget-conforming parts at a
day-section seam.

### Why not auto-bisect

The accompanying triage comment surfaced two directions:

- **(a) Auto-bisect** the source at a section boundary so each sealed part
  lands at-or-under budget.
- **(b) Refuse-and-error** when the source already exceeds the cap, surfacing
  a structured failure the caller acts on.

This spec commits to **(b)** as the structural guarantee and explicitly defers
**(a)** to a later spec because:

| Concern | (b) Refuse-and-error | (a) Auto-bisect |
|---|---|---|
| Closes the silent-violation contract gap | Yes — over-cap sealed parts become impossible by construction. | Yes. |
| Coupling to caller conventions | None — the failure is shape-agnostic. | A general boundary heuristic is awkward; `libwiki` is shared infrastructure and not every consumer carries the weekly-log H2 day-section convention. Over-fitting to weekly-logs couples the library to one caller. |
| Recoverability when triggered | Caller learns immediately and can decide how to split. | Caller's split decision is implicit in the heuristic. |
| Reviewable surface | Narrow — one guard, one failure signal. | Wider — boundary detection, split policy, multi-part naming, partial-rename rollback if any of those fail. |

(a) remains a reasonable later layer as an opt-in `bisectStrategy` for callers
that can identify their own section seams. This spec does not preclude it;
the refuse-and-error contract makes that layering composable.

## Scope

### In scope

| Component | What changes |
|---|---|
| The rotation primitive's contract when the source already exceeds the line-budget. | The primitive refuses to perform the rename and returns a structured signal that distinguishes the cap-overflow case from the "no rotation needed" case and from a successful rotation. The source file is left untouched. |
| The rotation primitive's contract on the `force: true` path. | `force` does not waive the cap-overflow refusal. The contract that sealed parts conform to the line-budget is upheld whether rotation is opportunistic or operator-driven. |
| The `fit-wiki rotate` CLI handler's surface when the primitive refuses. | The CLI exits non-zero, names the offending file and the by-how-many-lines overflow, and points at the audit's bisect convention. The success-line shape is reserved for actual rotations. |
| The append path (`fit-wiki log decision`, `log note`, `log done`, and any other path that calls the primitive ahead of an append) when the primitive refuses. | The append does not proceed against the over-cap source. The caller observes the cap-overflow signal so the operator or the surrounding agent can act on it rather than silently growing the over-cap file further. |
| The fit-wiki audit contract for sealed parts. | Audit text and predicates reflect the new structural guarantee: sealed parts are at-or-under the line-budget because the rotation primitive can no longer produce one that is not. |

### Out of scope

- **Auto-bisect of an over-cap source** at a daily, sectional, or any other
  seam. The opt-in `bisectStrategy` extension is its own future spec.
- **Sibling issue #1371** — `fit-wiki rotate` env-fallback agent-selection
  footgun. Different code path, different failure shape, materially
  independent; tracked separately.
- **Retuning the line-budget itself** (`WEEKLY_LOG_LINE_BUDGET`,
  `SUMMARY_LINE_BUDGET`, `STORYBOARD_LINE_BUDGET`). The cap value is not in
  question; only the primitive's behaviour at the cap is.
- **Retroactive bisection of existing over-cap sealed parts** in the wiki.
  Existing artefacts are recovered ad-hoc by their owning agent; this spec
  prevents new ones.
- **Changing the rotation guard for the under-budget case.** The
  `current + appendLines <= cap` short-circuit continues to mean "no
  rotation needed".

## Success Criteria

| Claim | Verification |
|---|---|
| When the source file already exceeds the line-budget, the rotation primitive does not perform the rename. | Drive the primitive against a fixture whose source exceeds the cap; observe the source's path, contents, and inode are unchanged and the next `*-partN.md` slot has not been created. |
| The caller can distinguish "refused — source exceeds cap" from "no rotation needed" and from "rotated" when it invokes the rotation primitive. | Drive the primitive across the three states (under-cap, at-or-over-cap, and a successful rotation under-cap with `force`) and observe the caller branches on three distinct outcomes — no two states map to the same caller-visible outcome. |
| The `force: true` path does not waive the cap-overflow refusal. | Drive the primitive with `force: true` against a fixture whose source exceeds the cap; observe the refusal signal and the unchanged source. |
| The `fit-wiki rotate` CLI exits non-zero and writes a message naming the file and the overflow when the primitive refuses. | Drive `fit-wiki rotate` against a wiki whose current weekly log exceeds the cap; observe a non-zero exit status, the source path and the over-by-how-many-lines value in stderr, and no rotation. |
| An append path that calls the rotation primitive against an over-cap source does not append to the source and surfaces the refusal to the operator. | Drive `fit-wiki log decision` (and one other log subcommand) against a wiki whose current weekly log exceeds the cap; observe the source's contents are unchanged and the caller receives the cap-overflow signal. |
| The fit-wiki audit's sealed-part conformance predicate no longer needs to allow for born-over-cap artefacts produced by the rotation primitive. | Drive the rotation primitive across both paths (append and `force: true`) under every starting state (under-cap, at-cap, over-cap), then drive the audit; observe no sealed part the primitive produced in this exercise is flagged as over-cap. |

— Product Manager 🌱
