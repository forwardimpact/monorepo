# Spec 1890 — Wiki conflict-marker corruption: structural audit detection and publish guards

## Personas and Jobs

| Persona            | Job                                                                                                                 | How the gap blocks progress                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The wiki is the team's shared memory; every agent pulls it on boot. When a sync merge publishes raw git conflict markers to origin, the corruption replicates to all agents on their next pull. Markers inside MEMORY.md or STATUS.md tables can break claim routing and approval-state reads — the surfaces that gate who works on what and what merges. No audit rule sees the corruption: the only signal observed in the field was an accidental word-budget breach whose remediation hint ("trim history") is actively wrong for this defect class. |
| Platform Builders  | [Build Agent-Capable Systems](../../JTBD.md#platform-builders-build-agent-capable-systems)                          | The wiki sync library presents staging, committing, reconciling with origin, and pushing as one safe primitive. A sweep that silently completes an abandoned conflicted merge — committing and publishing the unresolved conflict itself — violates that contract in a way no consumer can detect or defend against.                                                                                                                                                                                                                                     |

## Problem

Obstacle [#1668](https://github.com/forwardimpact/monorepo/issues/1668) records
two same-day (2026-06-12) events in which unresolved git conflict markers
(`<<<<<<<` / `=======` / `>>>>>>>` blocks) were committed and pushed to the
shared wiki's origin default branch. This is the complement of the side-pick
erasure family (parallel-collision ledger #1564): no content is lost, but the
published file is structurally corrupt — both variants render concatenated, and
markers leak into every consumer of the file (boot digests, memo extraction,
audit word counts, downstream readers).

Staff-engineer investigation confirmed the mechanism empirically and found three
structural holes in the sync path, plus a detection blindness in the audit:

| #   | Hole                                                | Behaviour today                                                                                                                                                                                                                                                                      |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | No mid-merge guard before the sweep                 | The whole-tree sweep in the wiki sync's commit-and-push flow stages and commits everything, including unmerged conflict hunks left by an earlier abandoned merge — silently "completing" the merge with markers inside.                                                              |
| 2   | Conflict-fallback merge can strand a mid-merge tree | The ours-strategy fallback merge runs without failure allowance; when it throws, no abort runs, leaving the tree mid-merge for the next sweep (hole 1) to publish.                                                                                                                   |
| 3   | Autostash pops can deposit markers                  | A conflicting stash pop writes `<<<<<<< Updated upstream` / `>>>>>>> Stashed changes` blocks into the tree; the same-window working-tree variant in #1668 re-entered the hazard during the repair itself.                                                                            |
| 4   | Audit cannot see structural corruption              | The wiki audit's budget rules measure size, not structure. A marker block can fit inside budget headroom and publish clean; when it does trip the budget (event 2 peaked at 2158/2048 words), the finding names the wrong defect and the "trim" hint destroys adjudication evidence. |

### Pre-registered false-positive surface

Any naive marker grep fires on marker strings legitimately _quoted_ in wiki
prose — and that exact false positive already fired in-session: a verification
grep matched the W24 security-engineer weekly-log rider that documents event 2
by quoting the marker strings in backtick code spans, and momentarily misread it
as a third event. A second benign form is the setext heading, whose `=======`
underline is a legal markdown idiom. Detection must therefore be structural:
line-anchored marker forms, with the separator counted only inside an open
conflict block, and quoted occurrences in code spans or fenced code blocks
excluded. This discrimination contract is the acceptance-criteria core of the
spec.

## What

Two complementary layers. Detection makes existing corruption visible with the
correct remediation class; prevention stops the sync path from publishing new
corruption. Either layer has independent value; together they close the loop.

### Layer 1 — Audit detection rule

A new fail-severity rule in the wiki audit that flags unresolved git conflict
blocks. Required coverage — stated as a requirement, not a description of
today's walk: the surfaces the audit classifies per-file today (summaries,
weekly logs and sealed parts, storyboards) **plus** MEMORY.md and STATUS.md,
which today reach the audit only as whole-text or row scopes; covering them
per-line is a coverage expansion this spec requires.

- **Positive forms:** line-anchored conflict-open and conflict-close marker
  lines, including the stash-pop labels (`Updated upstream` /
  `Stashed changes`), with the conflict separator line counted only while a
  block is open.
- **Negative forms (must not fire):** marker strings inside backtick code spans
  or fenced code blocks; a setext-heading underline outside an open block.
- **Per-file independence of open and close markers:** the open and close marker
  forms fire unconditionally — they must not be conditioned on a complete
  open→separator→close sequence within one file. Seal rotation can sever a
  single conflict block across two sealed files (live specimen: wiki repair
  commit `7c281c59`, where part 27 carried only the open marker and part 28 only
  the separator + close); a complete-block matcher misses both files. Only the
  separator is block-conditioned.
- **Accepted residual (deliberate):** a file containing _only_ the conflict
  separator line — no open marker above it in the same file — is
  indistinguishable from a setext-heading underline and is not detected
  (criterion 3 pins this non-firing). Recorded here as a design decision so the
  shape is not later filed as a detector bug.
- **Per-surface fence contract:** the fence exclusion exists for _prose_
  surfaces, where a fence quotes content. STATUS.md keeps its rows inside a
  fenced block as data — markers there are never legitimate, so the exclusion
  must not apply to it. The rule's coverage of a surface includes the surface's
  own fence semantics; a fence-blind exemption that silently exempts STATUS.md
  does not satisfy this spec.
- **Hint:** instruct the writer to adjudicate the merged form (reconcile the two
  variants into the intended content) — never to trim. The rule must be
  distinguishable from the budget rules so a size breach co-occurring with
  corruption cannot misattribute the defect class again.

### Layer 2 — Sync-path publish guards

The wiki sync's commit-and-push flow gains the invariant: **no unresolved
conflict state survives the flow into a commit or a push, and no uncommitted
work is lost.**

- **Refuse the sweep mid-merge:** when the wiki repository has unmerged index
  entries or an in-progress merge, the commit-and-push flow refuses to stage or
  commit, surfacing a distinct, reason-carrying failure instead of silently
  completing the abandoned merge.
- **No stranded mid-merge tree:** when the conflict-fallback merge fails, the
  flow ends with no mid-merge state and surfaces where uncommitted work went.
  Exact tree restoration is not always achievable — a conflicting autostash
  reapplication can retain work only in the stash — so the invariant is _no
  mid-merge state and no lost work_, with the outcome reporting where the work
  is.
- **No-marker check before push:** the flow refuses to push commits that
  _introduce_ unresolved conflict markers, using the same structural
  discrimination as Layer 1 for markdown content; in non-markdown text files
  (e.g. metrics CSVs) line-anchored markers are never legitimate, so no
  quoted-form exemption applies. The check binds the content this writer's
  outgoing commits introduce — corruption already at origin is Layer 1's finding
  to surface and any writer's to repair, and must not block unrelated writers'
  pushes. The refusal surfaces a reason; work stays committed locally. Note the
  chain for autostash deposits: a conflicting pop leaves unmerged entries that
  the mid-merge refusal catches on the next flow; content staged or committed
  _past_ that state is what this check catches at the publish attempt.

## Coordination with the in-flight libwiki series

This spec joins the spec-1730 write-path integrity family. Adjacency was
adjudicated on #1668 (improvement-coach) and the placement and scope contract
were fixed by security-engineer's
[placement decision](https://github.com/forwardimpact/monorepo/issues/1668#issuecomment-4689018580):

| Sibling                                | Its invariant                                   | Boundary with this spec                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec 1750 (ancestry guard)             | Unverifiable history ⇒ refuse before damage     | 1750 governs _which history_ may publish and covers the side-pick erasure mechanism; an ancestry guard cannot see an unmerged-entry tree. This spec governs _what content state_ may publish. No overlap.                                                                                                                                                                                                                                                                                                                                                                                         |
| Spec 1780 (push-outcome honesty)       | Every push outcome surfaces truthfully          | Here the sync _succeeds_ into a corrupt commit, so 1780 alone cannot see it. Seam decision per the placement comment: **this spec owns the mid-merge guards** (refusal, no-stranded-tree); their failure _reporting_ reconciles with 1780's outcome and refusal taxonomy when both land. 1780 also carries removal of the ours-strategy conflict fallback; if it lands first, the fallback-path criterion below is satisfied vacuously. Whichever lands second rebases and reconciles the refusal taxonomy — reason classes and refusal semantics on the shared flow, not just the fallback path. |
| Issue #1667 (size axis)                | Post-merge budget gate on the same landing path | #1667 is the _size_ axis of the same gap; this spec is the _structure_ axis. The post-merge pre-push re-validation point this spec introduces must stay composable so #1667's budget re-check can attach to it — this spec does not own or absorb the budget re-check.                                                                                                                                                                                                                                                                                                                            |
| Specs 1840/1850 (allocation/workspace) | Contended-singleton collision prevention        | Different mechanism family (side-pick erasure vs. published markers); no adjudication conflict.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Spec 1860 (memo headroom)              | Memo delivery within measured headroom          | Fence confirmed in both directions on #1668: 1860 needs no marker awareness; this spec touches no memo behaviour.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Out of scope

- The side-pick content-erasure family (ledger #1564) and its specs.
- Rebase-conflict handling on the pull path (already fails loudly via the
  pull-conflict error).
- Automated adjudication of a detected conflict block — detection routes a
  writer to adjudicate; it does not auto-resolve content.
- Marker detection outside the wiki (source-tree linting is a different surface
  with different idioms).
- Downstream consumers hardening themselves against markers (memo extraction,
  boot digest) — unnecessary once detection and guards hold the invariant at the
  source.
- Wiki files the audit leaves unclassified (e.g. Home.md, stray files):
  already-published corruption there stays outside Layer 1's reach; the Layer 2
  push guard still prevents this repository's flows from _introducing_ markers
  anywhere in the tree.
- #1667's post-merge budget re-check (composability owed, ownership not taken —
  see the coordination table).

## Success criteria

Each criterion is verified by the wiki library's test suite (the repository's
test command).

| #   | Claim                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The wiki audit reports a fail-severity finding for a file containing an unresolved conflict block, for both the branch-merge and stash-pop label forms. The regression corpus includes a split-block fixture reproducing the run 398b specimen (wiki repair commit `7c281c59`): one conflict block severed across two sealed files — the open marker only in the first file, the separator + close marker only in the second — with a finding required on **each** file. A matcher that only recognizes complete in-file blocks does not satisfy this criterion. |
| 2   | The rule does not fire on marker strings inside backtick code spans or fenced code blocks in prose surfaces; the regression corpus includes a fixture reproducing the quoted-rider form (the W24 security-engineer weekly-log rider) that produced the in-session false positive on #1668.                                                                                                                                                                                                                                                                       |
| 3   | The rule does not fire on a setext-heading underline outside an open conflict block.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 4   | The rule fires on a conflict block inside STATUS.md's fenced row table — the fence exclusion does not exempt data surfaces.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 5   | The finding's hint directs the writer to adjudicate the merged form and contains no trim guidance.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 6   | A regression-corpus fixture reproducing #1668 event 2's peak file state yields the marker finding alongside the word-budget finding, so the defect class can no longer be misattributed to size alone.                                                                                                                                                                                                                                                                                                                                                           |
| 7   | The commit-and-push flow refuses, with a distinct reason-carrying failure, to stage or commit while the wiki repository has unmerged entries or an in-progress merge.                                                                                                                                                                                                                                                                                                                                                                                            |
| 8   | After a failed conflict-fallback merge, no mid-merge state survives the flow, no uncommitted work is lost, and the outcome reports where retained work went. (Satisfied vacuously if the fallback has been removed by spec 1780 before implementation; the no-mid-merge-state assertion still holds for whatever conflict path exists.)                                                                                                                                                                                                                          |
| 9   | The flow does not push commits that introduce an unresolved conflict block; the outcome carries a reason and local commits are preserved. Pre-existing corruption at origin does not block an unrelated writer's push.                                                                                                                                                                                                                                                                                                                                           |
| 10  | A clean tree with no conflict state syncs exactly as today — guards add no behaviour change to the happy path.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Evidence

- Obstacle record with the two-event table, residence times, and the in-session
  false positive:
  [#1668](https://github.com/forwardimpact/monorepo/issues/1668).
- Event 2 word-budget misattribution: peak 2158/2048 words at the corrupted
  commit; the only audit signal was the size breach (counted toward the #1480
  budget series), repaired ~3 minutes after publish.
- Triage disposition and investigation summaries:
  [#1668 triage comment](https://github.com/forwardimpact/monorepo/issues/1668#issuecomment-4688980069).
- Security-engineer placement decision and review scope contract:
  [#1668 placement comment](https://github.com/forwardimpact/monorepo/issues/1668#issuecomment-4689018580).
- Run 398b live specimen (2026-06-12): one stash-conflict block severed across
  sealed weekly-log parts 27–28 by seal rotation, published and repaired in wiki
  commit `7c281c59` — grounds criterion 1's split-block fixture. The same
  landing's two side-pick erasures are **not** this spec's evidence: a resolved
  side-pick leaves no markers, unmerged entries, or mid-merge state, so the
  Layer 2 guards pass by design; that family is routed to ledger
  [#1564](https://github.com/forwardimpact/monorepo/issues/1564) (specs
  1750/1780 per the coordination table).

— Product Manager 🌱
