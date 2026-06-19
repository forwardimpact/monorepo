# Plan 1490 — Assess-loop carry-forward clearance step

Spec: [`spec.md`](spec.md) · Design: [`design-a.md`](design-a.md).

## Approach

One edit to `.claude/agents/release-engineer.md`: insert a self-contained
"Carry-forward clearance" step into the Assess priority order between Step 3
(cut) and the Step 4 fallback, renumbering the fallback to Step 5. The step
body states the seven design clauses (carry definition, surface-resolution
rule, recurring-carry condition, reconciliation arm, data-deficient
behaviour, counter-bump prohibition, routing-destination set). The
carry-entry field formalization is a sibling-wiki commit verified by
inspection, outside this PR's diff.

Libraries used: none.

## Step 1 — Insert the carry-forward clearance step

Files modified: `.claude/agents/release-engineer.md`.

Renumber the current Step 4 ("Fallback") to Step 5, and insert a new Step 4:

```markdown
4. **Recurring carry to route?** -- Run the **carry-forward clearance** check
   on the canonical carry surface before reporting clean.
   - *Carry surface*: the surface `memory-protocol.md` designates as the
     canonical Carry home; while no designation exists, it is
     `wiki/release-engineer.md § Message Inbox`.
   - *What counts as a carry*: a block on that surface encoding a per-Assess
     obligation plus a future clearance trigger — not an incoming memo
     (`fit-wiki inbox` triage), not settled state.
   - *Recurring-carry condition*: a carry whose `**Recurrences**:` count is
     ≥ 2, read from the surface alone.
   - *Reconciliation*: if a carry's `**Referenced surface**:` pointer is
     already up to date on `main`, clear the entry (do not route).
   - *Data-deficient entry*: if an entry lacks its recurrence count or
     referenced-surface pointer, restore the field from the entry's history
     or route it to product-manager with the deficiency noted — never skip
     silently.
   - *Prohibition*: once a carry meets the recurring-carry condition, emit a
     routing artifact; do **not** increment its recurrence count.
   - *Routing destinations* (closed set): (i) a GitHub Issue labeled
     `needs-spec` + `agent:product-manager`; (ii) `kata-dispatch` to
     product-manager; (iii) a Discussion for a convention question.
```

Verify: the phrase "carry-forward clearance" appears; the step precedes the
report-clean fallback; each spec SC clause is present in the step body.

## Step 2 — Carry-entry field formalization (sibling-wiki commit)

Files modified: `wiki/release-engineer.md § Message Inbox` (sibling repo —
**not** in this PR diff).

Apply to whichever surface the resolution rule selects at implementation
time: if spec 1610 has **already** relocated the inventory to
`<agent>-carries.md` and `memory-protocol.md` designates it, add the fields
there — **do not** reintroduce a carry section onto the summary (spec
§ Excluded). Otherwise the undesignated default is
`wiki/release-engineer.md § Message Inbox`. Add to each live carry entry the
two parseable fields the step reads: `**Recurrences**: N` and `**Referenced
surface**:` (or clearance condition), without changing the section's
memo-triage contract.

Confirm before editing: probe whether `<agent>-carries.md` exists on the
wiki and whether `memory-protocol.md` on `origin/main` designates it; that
probe selects the surface.

Verify: each carry entry on the resolved surface carries both fields,
readable inline; `bunx fit-wiki audit` stays clean.

## Risks

- The 1610 Carry surface may land before/after this step. Mitigation: the
  step states the resolution rule (designation lookup + default), so it
  re-points without a profile edit. Confirm the exact 1610 Carry definition
  on `origin/main` at implementation time so the two definitions agree.
- The routing labels `needs-spec` / `agent:product-manager` must exist for
  destination (i) to be operable with no new tooling. Mitigation: confirm
  the labels exist (`gh label list`) at implementation time; if absent, the
  step's enumerated set still offers `kata-dispatch` and Discussion, and the
  label is created as part of the routing artifact, not new tooling.

## Execution

Single engineering agent. Step 1 is the only code change (profile); Step 2 is
a wiki commit verified by inspection. No parallelism.

## Verification

`bun run check`; walk each § Success criteria row against the edited step;
inspect the wiki entry shape for Step 2.

— Staff Engineer 🛠️
