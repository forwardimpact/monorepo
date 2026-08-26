# Spec 2300: Standing Downstream Instruction Sync

**Classification:** product. Every changed surface lands under
`products/outpost/templates/`, the template a persona installs. The shared
rubric's decision test classifies a change under `products/` as
product-aligned.

**Persona and job:** Empowered Engineers → Be Prepared and Productive
(Outpost's Big Hire in JTBD.md). The Little Hire is the sharper fit: walk into
every meeting already oriented. A downstream installation improves its own
instructions to serve that job. This spec is how those improvements reach
every other installation.

**Standing spec.** This spec governs a recurring lane, not a one-time change.
Each sync wave updates the `2300` row in place, per `wiki/STATUS.md` § Format
("one row per spec, updated in place"). No wave mints a new spec id.

## Problem

Outpost ships a template of agent instructions under
`products/outpost/templates/`. An installation deploys that template and then
improves it in place, because only a live installation meets the real inputs:
a vendor that changes its export format, a CV that carries an embedded
instruction, a name that a parser mangles.

Those improvements stay downstream. The template does not learn from them. The
`downstream-instructions` skill exists to carry them upstream, and it has run
several times:

| Merge | Wave |
| ----- | ---- |
| `27374a984` | changelog, deck-review, Git-drop |
| `6ddf92763` | rename identify-user to person-identify, add person-lookup |
| `acadb7f76` | deck-review folder persistence, Role Status field |
| `00a92c556` | anarlog MCP/CLI, req-bundle, injection rules, team awareness |

Every one of those merged with no spec id and no `wiki/STATUS.md` row. The
consequences:

- **The merge gate has nothing to read.** `kata-release-merge` Step 6 reads
  `wiki/STATUS.md` for the PR's spec id. A wave carries no id, so the gate
  reaches an absent row and blocks on `awaiting approval signal`. The four
  waves above merged around that gate, not through it.
- **The lane is invisible in the ledger.** `wiki/STATUS.md` is the canonical
  approval record. A reader cannot tell that this lane exists, how often it
  runs, or whether the last wave landed.
- **Approval leaves no pin.** Each wave is a large diff of instruction text
  approved in session. Nothing records which head a human approved, so
  nothing detects a head that moved after the approval.

The work itself is not in question. It is routine, it has a skill, and it has
run four times. What is missing is the ledger row that makes it gateable.

## Proposal

Register the lane as a standing spec so every wave merges through the gate
instead of around it.

1. **One standing spec id.** `2300` covers the lane, not a single wave. The
   `wiki/STATUS.md` row `2300 plan implemented` records that the lane's most
   recent wave landed.
2. **Each wave references the id.** A wave's PR title carries `(#2300)`, the
   same convention every implementation PR uses. The gate then resolves the
   row and applies its normal approval read.
3. **Each wave re-advances the row.** A wave in flight sets the row to
   `2300 plan approved` at approval and back to `2300 plan implemented` at
   merge. The row is a lane state, not a wave archive. Per-wave detail lives
   in the PR thread, which is already where review provenance lives.
4. **The approval pin lives on the PR.** A wave's approving signal records the
   head SHA it covers in a PR comment, per approval-signals.md § In-session
   approval. A later commit voids it and needs a fresh signal.
5. **The skill stays the executor.** `downstream-instructions` already defines
   how a wave is gathered, generalized, and applied across the three template
   surfaces. This spec adds no step to it. It only gives the output an id.

**Compatibility stance:** additive. The four merged waves stay as they are.
No retroactive row is written for them, because a signal with no establishable
pin transfers to no other head. The lane starts being gated from the wave that
carries this spec.

## Scope

### Included

| Surface | Change |
| ------- | ------ |
| `specs/2300-downstream-instruction-sync/` | This spec and its plan. The standing home for the lane. |
| `wiki/STATUS.md` | One new row, `2300 plan implemented`, recording the lane's state. |
| The wave in flight (PR #2011) | Retitled to carry `(#2300)` so the gate resolves the row. |

### Excluded

| Item | Why |
| ---- | --- |
| Changes to the `downstream-instructions` skill | The skill's procedure is sound and has run four times. This spec gives its output an id, nothing more. |
| Retroactive rows for the four merged waves | Their heads are closed and unpinnable. A row would assert an approval record that no signal establishes. |
| The upstream direction (template to installation) | A separate concern with its own skill and its own failure modes. |
| Per-wave spec ids | The row is a lane state updated in place. New ids per wave would grow the ledger without adding signal. |
| Automating the sync | The generalization step needs judgment: real names come out, installation-specific paths come out, embedded control characters get rewritten. |

## Success criteria

| # | Claim | Verification |
| - | ----- | ------------ |
| 1 | The lane has a standing spec. | `specs/2300-downstream-instruction-sync/spec.md` and `plan-a.md` are present on `main`. |
| 2 | The ledger carries the lane. | `grep -E "^2300\s" wiki/STATUS.md` returns `2300 plan implemented`. |
| 3 | The gate can resolve a wave. | The wave in flight carries `(#2300)` in its title, so `kata-release-merge` Step 6 reads the `2300` row instead of an absent one. |
| 4 | The approval carries a pin. | The wave's PR thread records the approved head SHA, per approval-signals.md § In-session approval. |
| 5 | The spec adds no skill step. | `git diff` for this spec's PR touches no file under `.claude/skills/downstream-instructions/`. |
| 6 | Repository checks stay green. | `bun run check` and `bun run test` pass. |
