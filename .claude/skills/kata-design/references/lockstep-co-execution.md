# Lockstep Co-Execution (spec + design together)

Shared protocol for when **one prompt asks for both the spec and the design**.
Used by [`kata-spec`](../../kata-spec/SKILL.md) and
[`kata-design`](../SKILL.md). Both pipelines advance one phase at a time, with a
barrier at each phase boundary, and ship in a single PR.

Author both artifacts from the same fresh context before reviewing either —
running fully serial fills the context with spec-review triage before the design
is drafted.

## The barrier sequence

Both skills advance together; neither races ahead to its own review while the
other is still drafting.

1. **Claim once.** `kata-spec` claims the id and writes `{NNN}\tspec\tdraft` as
   normal. The design reuses the same `NNN`; no second claim.
2. **Clarify + research once** — one pass serves both artifacts.
3. **Draft both** — write `spec.md`, then `design-a.md`, in the same session
   before reviewing either. The design is drafted against the same-branch spec;
   it does not wait for the spec to reach `origin/main`.
4. **One combined review batch.** Launch every panel for both artifacts in a
   single message per the [`kata-review` caller
   protocol](../../kata-review/references/caller-protocol.md) — the two spec
   panels and the design panel together. Triage once. If spec triage shifts
   scope, re-touch `design-a.md` before opening the PR.
5. **One PR.** Open a single PR titled `design(NNN): …` carrying both
   `spec.md` and `design-a.md`. Do **not** open a separate `spec(NNN)` PR. The
   merge gate classifies it as a design-phase PR; bundling the spec is invisible
   to the gate.

## STATUS lifecycle

The row skips the `spec approved` state — reaching `design approved` subsumes it
(one human signal approves both stages). See
[`approval-signals.md`](../../../agents/x-approval-signals.md).

```text
spec draft → design draft → design approved
```

- `spec draft` — at claim (Step 1).
- `design draft` — once both artifacts are reviewed and pushed in the combined
  PR (a draft→draft bookkeeping move, no approval).
- `design approved` — the human's single design-class approval signal on the
  combined PR; a normal single-step approval transition.

## Metrics

The combined PR has no separate spec PR, so count it for **both**
`specs_drafted` and `designs_drafted`.
