# Plan 2300-a: Standing Downstream Instruction Sync

First and default plan for spec 2300. The spec is small enough that no
separate design document adds signal: it registers a ledger row and a title
convention, and it changes no code. Read the [spec](spec.md) for WHAT/WHY.

## Approach

Two lanes run in this plan, and they land in different repositories.

The **spec lane** adds this spec directory. It lands in the same PR as the
wave in flight, so the gate's Step 9 check for `plan-a.md` on `main` is
satisfied by that merge rather than by a preceding one. This is the same
lockstep shape a combined spec-plus-design PR uses.

The **ledger lane** adds the `2300` row to `wiki/STATUS.md`. The wiki is a
separate repository, so that edit is committed there and pushed on its own.

Every later wave runs Steps 3 to 5 only. Steps 1 and 2 are one-time.

## Steps

### Step 1: Spec home (one-time)

- Created: `specs/2300-downstream-instruction-sync/spec.md`
- Created: `specs/2300-downstream-instruction-sync/plan-a.md`

Both land in the PR carrying the wave in flight. No design document: the spec
introduces no component, interface, or data flow for a design to sketch.

### Step 2: Ledger row (one-time)

- Edited: `wiki/STATUS.md`

Insert `2300<TAB>plan<TAB>implemented` in id order, after the `2290` row and
inside the existing fenced block. The row form is the three-cell spec row from
`wiki/STATUS.md` § Format. It is not an `exp:` row: this lane is routine
product work, not a spec-less experiment.

Commit in the wiki repository. The Stop hook pushes it.

### Step 3: Title the wave (per wave)

Retitle the wave's PR so the subject ends with `(#2300)`. The gate parses the
type from the title prefix and resolves the row from the id. A wave that keeps
an untitled subject reaches an absent row and blocks, which is the behavior
this spec exists to remove.

### Step 4: Pin the approval (per wave)

Record the approved head SHA in the wave's PR thread, per
approval-signals.md § In-session approval. Set the row to
`2300 plan approved` while the wave is in flight.

A commit pushed after that comment voids the pin. The wave then needs a fresh
signal against the new head. Do not rewrite the row to cover a moved head.

### Step 5: Advance the row at merge (per wave)

Set the row back to `2300 plan implemented` and commit the wiki change before
the merge, per `kata-release-merge` Step 9.

### Step 6: Verify

- `bun run check` — 8 gates.
- `bun run test` — full suite.
- `grep -E "^2300" wiki/STATUS.md` returns the row.
- `gh pr view <wave> --json title` shows the `(#2300)` suffix.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| A reader treats `2300 plan implemented` as "the lane is finished" rather than "the last wave landed". | The spec's § Proposal item 3 states that the row is a lane state. This plan's Step 5 restates it at the point of the write. |
| A wave's diff is large instruction text, so a review reads it shallowly and a generalization miss lands upstream. | The `downstream-instructions` skill already owns the generalization step. The wave's PR body lists what was generalized, which gives a reviewer a checklist to verify against the diff. |
| The one-time steps run again on a later wave and mint a second id. | Step 1 and Step 2 are marked one-time here, and the spec's § Excluded rules out per-wave ids. |
