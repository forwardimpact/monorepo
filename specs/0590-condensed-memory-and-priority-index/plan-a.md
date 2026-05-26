# Plan 0590-A — Condensed Agent Memory and Cross-Cutting Priority Index

## Approach

Land the protocol, the MEMORY.md shape, and the kata-wiki-curate update in one
infrastructure PR so the contracts and the file shape they describe arrive
together (design constraint). Then add a canonical conformance command so
progress is pass/fail-measurable. Finally, the technical-writer agent performs
the content migration of the wiki to conform, using the new protocol as its
working contract.

This order keeps the design's invariant ("protocol must not reference contracts
or a MEMORY.md shape that does not yet exist") intact while keeping each part
small enough to review and revert independently.

Three parts. Parts 01 and 02 are staff-engineer work; part 03 is
technical-writer work and is the last step in the plan, per the approved
direction.

## Part Index

| Part                         | Agent            | Summary                                                                                    |
| ---------------------------- | ---------------- | ------------------------------------------------------------------------------------------ |
| [plan-a-01.md](plan-a-01.md) | staff-engineer   | Rewrite `memory-protocol.md`, reshape `wiki/MEMORY.md`, update `kata-wiki-curate/SKILL.md` |
| [plan-a-02.md](plan-a-02.md) | staff-engineer   | Add `scripts/wiki-audit.sh` + `just wiki-audit` conformance command                        |
| [plan-a-03.md](plan-a-03.md) | technical-writer | Migrate wiki content (summaries, MEMORY.md priorities, log hygiene) to conform             |

## Dependencies

- Part 01 → Part 02: audit script encodes the contracts defined in part 01.
- Part 02 → Part 03: migration success is measured by part 02's audit command.
- Part 03 is strictly last: the wiki cannot pass conformance until the protocol
  and the audit command exist.

No parallelism — this is a strictly sequential plan.

## Libraries Used

No `@forwardimpact/lib*` packages are consumed by this plan. All work is
markdown edits, a POSIX shell script, and a justfile recipe. The conformance
script uses standard Unix tools (`wc`, `grep`, `awk`) — no new runtime
dependency.

## Execution

Each part is an independent branch off `main` and an independent PR. Each PR
requires the normal human review/merge gate — nothing about decomposition waives
that.

1. **Part 01** — staff-engineer. Infrastructure PR on
   `spec/590-part-01-protocol`. Lands protocol, MEMORY.md shape, and
   kata-wiki-curate update together. After merge to main, MEMORY.md carries an
   empty-state "None" row in the priorities section; agent summaries are still
   non-conforming (expected).
2. **Part 02** — staff-engineer. Follow-up PR on `spec/590-part-02-audit`
   branched from `main` after part 01 merges. Adds the audit script and just
   recipe. On main immediately after part 02, `just wiki-audit` reports the
   current non-conformance count so migration progress is visible.
3. **Part 03** — technical-writer. Final work on `fix/wiki-migrate-spec-0590`,
   branched from `main` after part 02 merges. Migrates summaries to meet the
   line budget and section contract, seeds the priority index with currently
   active cross-cutting items, verifies log hygiene. Ends with `just wiki-audit`
   returning a clean (zero-failure) result — this is the success criterion for
   the whole spec.

STATUS transitions: parts 01 and 02 do **not** advance `specs/STATUS`. STATUS
stays at `plan approved` throughout parts 01 and 02 and only advances to
`plan implemented` as the final action of part 03 (see plan-a-03 Step 6).

## Risks

- **Protocol drift from skills that restate it.** The design says contracts live
  only in `memory-protocol.md`; skills reference them. A future skill change
  could re-introduce a restatement. Mitigated by part 01's kata-wiki-curate edit
  showing the reference-only pattern.
- **MEMORY.md priority index goes stale.** Resolved items linger. Mitigated by
  part 01 naming the curator as the authoritative writer — the curator runs on
  schedule and is responsible for removing resolved items within one curation
  cycle. The audit does not check staleness; that is a process discipline, not a
  mechanical check.
- **Line budget too tight for some agents.** Current state on this branch,
  verified by `wc -l`: PM 130, IC 137, SE 164, TW 86, RE 64, Staff 72. (The
  design cites "PM 163, IC 137, SE 103" — those numbers had aged by the time
  this plan was written; the plan uses the current `wc -l` values and supersedes
  the design's figures for planning purposes.) Budget is 80. If a post-migration
  summary cannot fit legitimate state under 80 lines, part 03 must surface it
  for budget revision rather than silently stripping state. Failure mode
  documented in part 03.
- **Wiki content migration is destructive** (deletes historical tables). Part 03
  must verify the relevant history is captured in weekly logs or git before
  deletion. Mitigation: the technical-writer agent follows its standard wiki
  curation discipline and is the right agent for content judgement calls.

## Success Criteria (from spec 0590, verified post-part-03)

- `wiki/MEMORY.md` exposes cross-cutting items (criterion 1)
- `memory-protocol.md` defines the tiered load (criterion 2)
- `kata-wiki-curate` Step 5 targets MEMORY.md (criterion 3)
- Summary contract lives canonically in `memory-protocol.md` (criterion 4)
- Weekly log contract lives canonically in `memory-protocol.md` (criterion 5)
- `just wiki-audit` passes over the migrated wiki (criterion 6)
- Follow-up kata-trace measurements (criterion 7) — recorded by the technical
  writer to `wiki/metrics/technical-writer/` after the first post-migration run.
  Not a blocker for this plan; it is verification that lands in a later
  kata-trace analysis session.
- `bunx fit-map validate` and wiki push/curate workflows continue to succeed
  (criterion 8) — verified at the end of each part.
