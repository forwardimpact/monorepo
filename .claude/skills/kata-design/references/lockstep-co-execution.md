# Lockstep Co-Execution (spec + design together)

Shared protocol for when **one prompt asks for both the spec and the design**.
[`kata-spec`](../../kata-spec/SKILL.md) and [`kata-design`](../SKILL.md) both
use it. Both pipelines advance one phase at a time. A barrier sits at each
phase boundary. Both ship in a single PR.

Author both artifacts from the same fresh context before you review either. A
fully serial run fills the context with spec-review triage before you draft the
design.

## The barrier sequence

Both skills advance together. Neither races ahead to its own review while the
other still drafts.

1. **Claim once.** `kata-spec` claims the id and writes `{NNN}\tspec\tdraft` as
   normal. The design reuses the same `NNN`. There is no second claim.
2. **Clarify + research once** — one pass serves both artifacts.
3. **Draft both** — write `spec.md`, then `design-a.md`, in the same session
   before you review either. You draft the design against the same-branch spec.
   It does not wait for the spec to reach `origin/main`.
4. **One combined review batch.** Launch every panel for both artifacts in a
   single message per the [`kata-review` caller
   protocol](../../kata-review/references/caller-protocol.md). That means the
   two spec panels and the design panel together. Triage once. If spec triage
   shifts scope, re-touch `design-a.md` before you open the PR.
5. **One PR.** Open a single PR titled `design(NNN): …` that carries both
   `spec.md` and `design-a.md`. Do **not** open a separate `spec(NNN)` PR. The
   merge gate classifies it as a design-phase PR. The bundled spec is invisible
   to the gate.

## STATUS lifecycle

The row skips the `spec approved` state. `design approved` subsumes it, because
one human signal approves both stages. See
[`approval-signals.md`](../../../agents/x-approval-signals.md).

```text
spec draft → design draft → design approved
```

- `spec draft` — at claim (Step 1).
- `design draft` — once you review and push both artifacts in the combined
  PR (a draft→draft bookkeeping move, no approval).
- `design approved` — the human's single design-class approval signal on the
  combined PR. It is a normal single-step approval transition.

## Metrics

The combined PR has no separate spec PR, so count it for **both**
`specs_drafted` and `designs_drafted`.
