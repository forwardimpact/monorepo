# Spec 1780 — libwiki commitAndPush failure surfacing

The wiki sync operation behind every agent session's memory writes defeats
git's own contention serializer twice: on rebase conflict it falls back to a
merge that resolves every conflicting hunk to the local side — silently, by
construction — and on push rejection it swallows the error and reports
success unconditionally. A push that lost its race is reported identically
to one that landed. This spec makes push outcomes honest: **success is
reported only when the remote accepted; every failure surfaces with a
reason; conflicts fail loudly instead of discarding the remote side.**

Consolidation note: this spec covers #1583 items 1–2 with #1580 subsumed,
per the reconciliation recorded on #1576, #1580, and #1583
([canonical routing](https://github.com/forwardimpact/monorepo/issues/1583#issuecomment-4675935317)).
It is a coordinated series with spec 1750 (ancestry guard, PR #1588) on the
same operation: 1750 guards *what history* may be published; 1780 makes
*push outcomes* honest. Whichever lands second rebases on the first. #1583
item 3 (sweep scoping) and bounded retry are carried here as explicit
decision points (§ Decisions D6, D3).

**Approving this spec PR settles the WHAT-level decisions in § Decisions as
proposed; choosing a carried alternative revises the matching success
criteria in the same approval signal.** Mechanism choices the decisions
defer (channel shape, guard placement and intent recording, hook wiring
component) remain design territory with their own review gate.

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The wiki is the team's persistent memory, written through the session-end Stop hook (`fit-wiki push`) and through `claim`/`release`. Under tonight's routine write contention, a session whose push lost a race believes its record landed — run records strand silently, and downstream forensics derive false conclusions from the phantom success. The team's interim rule that tool-reported push success is inadmissible as landing evidence is a by-hand workaround for a report the machine should make trustworthy. |
| Platform Builders | [Build Agent-Capable Systems](../../JTBD.md#platform-builders-build-agent-capable-systems) | `WikiSync.commitAndPush` in `libwiki` is the shared write primitive behind the `fit-wiki push`, `claim`, and `release` command surfaces. Its outcome report is unconditional, so no consumer can distinguish landed from stranded; honesty at the primitive fixes every surface at one seam. |

## Problem

Three defects on one path, each verified at source (staff-engineer reading
at #1583; re-verified at PM triage and in the technical seed at current
main):

| Defect | Behavior today |
|---|---|
| Silent clobber on conflict | When the pre-push rebase on the remote branch conflicts, the operation aborts the rebase and falls back to a merge whose strategy option resolves every conflicting hunk to the local side. Git detected the contention; the tool then deliberately overwrote the remote side. No conflict is ever raised to the caller. |
| Phantom push success | The push is fire-and-forget: the error is caught and intentionally ignored, and the operation returns a successful outcome unconditionally. A non-fast-forward rejection — the routine outcome under write contention — is reported identically to a landed push. |
| Dead degradation branch | The `claim`/`release` surfaces carry a "push failed (saved locally)" branch that only fires on a thrown error — and the operation never throws on push failure, so for push failures the branch is unreachable (it remains reachable for throws from other steps). Whenever the operation reports a push — including rejected ones — those surfaces print "committed and pushed" off the unconditional success result. |

A fourth adjacent behavior shapes the contract: the pre-rebase remote fetch
also swallows all failures by design (a failed fetch leaves the stale
remote-tracking ref in place and the rebase proceeds against it). Under
broken credentials, a push rejection against that stale ref would be
indistinguishable from genuine contention unless the fetch outcome feeds
the classification (§ Decisions D2).

These defects are the local members of a wider pattern the team's
forensics surfaced: **four landing-verification instruments produced false
positives inside one 36-hour window** (coach record:
[#1580 issuecomment-4676264988](https://github.com/forwardimpact/monorepo/issues/1580#issuecomment-4676264988),
routed via the ask#9 record
[#1564 issuecomment-4676259934](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4676259934)).
Member dispositions, each explicit: phantom push success (this spec's
core, § Decisions D2); mid-rebase ancestry — `--is-ancestor` passing while
a rebase is stopped — carried in scope by § Decisions D7; shallow-clone
parentage (#1577) an independent lane named in § Out of scope;
tip-ancestry under live writers governed by the team's quiescence floor, a
record-side convention outside this contract. One common shape: *callers
compose git plumbing whose preconditions they cannot see*. The contract's
job is to make the primitive own its preconditions rather than leave each
caller to rediscover them.

**Evidence.** Per the corrected evidence base
([renumber-proof anchor](https://github.com/forwardimpact/monorepo/issues/1583#issuecomment-4676124931)):
the mechanism section is load-bearing — the swallow and the clobber
fallback are source-confirmed capabilities. The RE run-275 occurrence cited
in #1580 § Evidence demonstrates the invisible-reject *shape* via a
sibling instrument, not an instance of the swallow. That gap closed on
2026-06-11: collision-ledger **occurrence #41** is a live, object-in-hand
instance of the push half itself — during the run-302 release check,
`fit-wiki push` printed `push: committed and pushed` while commit
`bc982943` never reached origin (dangling object, no containing ref after
a full-history fetch), caught only by the *external* run-283
ancestry-verify floor, not by the tool
([allocation anchor](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4676312051)).
The occurrence is **release-engineer live-verified** on every independently
re-verifiable element ([verification anchor](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4676483628)):
origin never accepted `bc982943` (no containing ref at a full-history
fetch); its parent `27077d6d` *is* an ancestor of `origin/master`,
isolating the stranding to exactly the one commit the tool reported
pushed; the swallow is live at source (empty catch around the push,
unconditional pushed-true return); and the `claim` surface's
saved-locally branch is confirmed dead code for push failures. The
ledger's double-#41 is since reconciled — final assignment keeps
**#41 = `bc982943`** ([reconciliation](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4676486013)),
so this spec's citations stand as written; the SHA-keyed hedge above
remains the durable protection.
With #41 the three phantom-class events span the full invisibility
gradient — #41 (`bc982943`) object-in-hand, #30 (`ba1468cf`)
object-reconstructed, the measures-CSV phantom no-object (ordinals as of
their allocation anchors; the ledger renumbers positionally, so SHA and
anchor keying govern) — so the defect
is no longer inferred from source capability alone; it has a
caught-in-the-act specimen. That specimen is no longer alone: a third,
coach-verified first-hand
([ledger disposition](https://github.com/forwardimpact/monorepo/issues/1580#issuecomment-4676327242)),
landed on the **`fit-wiki release` path** — the run-303 release check
printed `push: committed and pushed` for release commit `704cf95a`
(01:19:13Z 2026-06-11), which never reached origin because origin had
advanced via a parallel lane; the external floor caught it and the write
re-landed as `8b211fe8` 53 seconds later (byte-identical diff,
NOT-ancestor + value-read verified), with the orphan commit persisting in
the shared checkout's object store — direct corroboration of the minting
mechanism. **Specimen census: n=3 in ~26 hours** — founding `ba1468cf`,
run-302 `bc982943` (`fit-wiki push`), run-303 `704cf95a` (`fit-wiki
release`) — two in consecutive runs within one session hour, on two
different CLI surfaces sharing the one operation. **Rate revision
(coach, 6/11): phantom success is deterministic under origin-advance
contention** — it fires whenever a push races a parallel lane's landing,
not as a rare stochastic fault — with ~1 specimen expected per session
hour at peak facilitated-session cadence until the fix deploys; every
release meanwhile pays the floor's verification overhead (unshallow +
ancestry + value-read) as the running price of queue latency.
The acceptance question this evidence sets
is therefore: what must be true of the push operation itself so that **no
external floor is needed** — answered by the grounded-success property in
§ Decisions D2 and its success criteria. Further live instances sit on
the merge-resolution half: collision-ledger occurrence #36 (a
foreign Active Claims row dropped by a sibling's conflict resolution) and
the claims-table erasure in the 6/11 ledger queue; five write-contended
ledger meta-instances landed in ~90 minutes on 2026-06-10, traced to the
sync path itself. The downstream cost is concrete: a careful agent
reasonably inferred a "history-level non-FF overwrite" from a phantom
success, and dissolving that false finding cost a multi-agent
investigation. The tool's success report was the defect.

**Call-site inventory (exhaustive, per the
[staff-engineer technical seed](https://github.com/forwardimpact/monorepo/issues/1583#issuecomment-4676224637)).**
Exactly two production code paths reach the operation — the sync command's
whole-tree path and the claim/release helper's MEMORY.md-scoped path — and
nothing else consumes it outside tests. The helper serves three command
surfaces, so the per-caller contract in § Decisions D1 is complete with
three caller rows:

| Caller | Commit scope | Invoked by | Fail-loud tolerance |
|---|---|---|---|
| `fit-wiki push` (sync command) | Whole tree | Session-end Stop hook, CI post-run push steps, manual runs | Can fail loud — loud failure here is the point: it is how a session learns its record is stranded. |
| `fit-wiki claim` | MEMORY.md only | Agents claiming work | Must keep zero exit when the local write succeeded: a claim whose row landed locally is a completed claim; the session-end push is the retry. Loud warning, quiet exit. |
| `fit-wiki release` (targeted and `--expired` — two distinct call sites) | MEMORY.md only | Agents releasing work, expiry cleanup | Same contract as `claim`, exercised separately per call site. |

## Scope

### In scope

| Component | What changes |
|---|---|
| `WikiSync.commitAndPush` conflict handling | The merge-with-ours fallback is removed. On rebase conflict the operation aborts the rebase and fails loudly with a resolve-or-retry message — the same contract the pull command already has. The tool never mechanically resolves a conflict by discarding the remote side. |
| `WikiSync.commitAndPush` outcome honesty | Success is reported only when the remote accepted the push, **as established from observed remote state — the pushed commit reachable from the remote ref, or the remote-originated per-ref update report for that ref — never inferred from the push subprocess's prose output, its exit status alone, or the mere absence of a caught error** (the per-ref report is admissible despite arriving on the subprocess's stdout because the remote produces it; the prose and exit channels are not — § Decisions D2) (§ Decisions D2 grounded-success property; occurrence #41 evidence). Every other outcome is reported with a reason per the § Decisions D2 taxonomy, through an observable channel that reaches every caller — today's unconditional success result makes the `claim`/`release` degradation branch unreachable; the channel's mechanism (typed error vs. outcome result, per-ref status parsing vs. post-push remote observation) is a design decision, the observability and grounding requirements are not. |
| Command surfaces `fit-wiki push`, `claim`, `release` | Each caller maps every outcome to an honest message per § Decisions D1: `push` exits non-zero whenever the push did not land; `claim`/`release` keep zero exit on a successful local write and print an honest saved-locally warning naming the reason. |
| Session-end hook surfacing | The Stop-hook wiring maps a push-failure exit to the hook semantics that block the stop and feed the reason back to the agent for a remediation turn, with the CLI's exit status propagated losslessly through every invocation layer in between — no shell-pipeline or wrapper layer may mask it (§ Decisions D4 fidelity clause). |
| Bounded retry | At most one reconcile-and-retry on rejection, under two binding constraints (§ Decisions D3). |
| Foreign claim-row conservation | A push that would delete an Active Claims row it was not instructed to remove refuses or re-merges — never silently drops. Detection is a write-time content comparison of remote-tip claim rows against the would-be-pushed tree (§ Decisions D5 — file-history inspection is structurally blind to this erasure class). |
| Unsafe-precondition refusal | A rebase in progress or a detached HEAD refuses before mutating, with a precondition reason and non-zero exit on all three surfaces — the backstop that keeps an interrupted reconcile from minting a success-shaped verdict (§ Decisions D7). |
| Operator message contract | Failure messages name the reason class and the recovery path; where uncommitted work is retained in the stash on a failed autostash reapplication, the message names where it went (§ Decisions D3 guarantee). Contract is exit code plus reason class — exact wording is plan territory. |
| Documented contract surface | The `commitAndPush` contract documentation describes the outcome taxonomy and per-caller mapping, traceable to this spec. |

### Out of scope

- **Ancestry verification on unverifiable clones** — spec 1750 (PR #1588),
  the other half of the coordinated series. Its two guard-refusal classes
  slot into this spec's D2 taxonomy as additional reason classes, not a
  parallel scheme; its D1 ancestry judgment binds this spec's retry
  (§ Decisions D3).
- **Conflict frequency** — parallel claims conflict textually at the same
  table tail by construction, and no honesty fix changes how often. Row
  format and contention-reduction work belongs to the W26 window. 1780
  fixes honesty, not frequency.
- **The fetch's graceful degradation** — a failed fetch still leaves the
  stale ref in place and the operation proceeds; what changes is only that
  the fetch outcome feeds the D2 classification.
- **Facilitator-side ask-serialization discipline** — session-protocol
  surface, not libwiki.
- **Shallow-clone fetch depth at session setup** (#1577) — independent
  lane.
- **Spec 1730** (compliant-by-construction writes) — standalone; references
  this contract rather than absorbing it.

## Decisions

Each decision names its carried alternative because the approval signal
adjudicates between them (settlement sentence above); rationale is kept to
what the adjudication needs.

**D1 — Push-failure contract per caller.** `fit-wiki push` exits non-zero
whenever the push did not land, with a reason-specific message, so the
session-end hook surfaces stranded records. `claim` and `release` keep a
zero exit when the local write succeeded — a claim whose row landed locally
is a completed claim, and the session-end push is its retry — but print an
honest "saved locally — not yet visible to parallel sessions" warning
carrying the D2 reason. Success messages on all three surfaces are printed
only when the remote accepted. The zero-exit half is a contract of its own,
not a side effect: an implementation that exits non-zero from `claim` on a
push failure fails this spec even with the right warning text. The
intended trajectory for the dominant conflict class (two parallel claims
appending at the same table tail) is explicitly: claim exits zero with the
saved-locally warning → the session-end push fails loud with the conflict
reason → remediation is pull and re-apply on the true tip.
*Alternative carried:* non-zero at all three callers — stricter; fails a
claim whose local write succeeded and which the session-end push will
usually land.

**D2 — Outcome-reason taxonomy, conditioned on the fetch outcome.**
Distinguish at minimum: *landed*, *nothing to push*, *rejected by remote*
(non-fast-forward — actionable now: rerun from the true tip), *conflict*
(rebase conflict — resolve or retry from the true tip),
*transport/credential failure* (possibly transient), and *precondition*
(§ Decisions D7 — the repository state invalidated the operation's
instruments before it could run). **Grounded-success
property:** *landed* is asserted only from observed remote state, through
either admissible channel: the pushed commit reachable from the remote ref
(post-push remote observation), or the per-ref update report for that ref —
the machine-readable status the *remote* produces during the push,
admissible because it is remote-originated even though git relays it on the
push subprocess's stdout. The inadmissible channels are the subprocess's
prose output text, its exit status alone, and the absence of a caught
error — those attest that a process ran, not that the remote accepted.
The grounding covers the other success-shaped quiet outcome too:
***nothing to push* is asserted only when the observed remote ref already
contains local HEAD** — never from pre-fetch arithmetic against the
remote-tracking ref, which is how it is computed today. As contract, not
doc-comment convention: the push decision is keyed to whether the remote
contains the local commits, never to working-tree dirtiness — a
stranded-resume state (clean tree, local commits ahead: exactly the
workspace a #41-class stranding leaves behind when D4's remediation turn
never runs) must re-push, not report quiet success. This pair of
groundings is what
makes the external ancestry-verify floor unnecessary over *every*
success-shaped outcome: occurrence #41
(§ Evidence) is precisely a success claim made on output text while the
commit was stranded, detectable only by an out-of-band floor. Any outcome
that fails this grounding is classified as a failure reason from this
taxonomy, never as *landed*. *Rejected* is
reportable only when the preceding remote observation succeeded; when the
fetch failed, a subsequent push rejection is classified as transport —
otherwise broken credentials masquerade as contention and "rerun" guidance
loops forever against a stale ref. Spec 1750's two guard-refusal classes
(confirmed-unrelated, could-not-verify) join this taxonomy when both specs
have landed; D7's *precondition* refusal is could-not-verify-shaped
(verification could not run) and reportable in either series order. *Alternative carried:* collapse *rejected* and *transport*
into one failure reason — simpler, but they direct different operator
responses, and conflation is exactly how the run-275 false finding grew.

**D3 — Bounded retry, ×1, under two binding constraints.** At most one
reconcile-and-retry on a rejection outcome; none on transport failure; the
final outcome is never masked by the retry's existence. One retry is
sufficient because it helps exactly one case — the fetch-stale race where
the remote advanced with no textual overlap, so the rebase replays clean
and the push lands. The dominant conflict class (parallel claims at the
table tail) re-conflicts deterministically on every reconcile; no retry
budget changes that, and its trajectory is D1's loud-at-session-end path.
Two constraints bind any retry, neither subsuming the other:

- *Joint with fallback removal* — a retry's conflict path must fail loudly;
  retry is safe only jointly with the silent-clobber removal in this spec's
  scope.
- *Re-enter the ancestry judgment* — any push-retry (the in-command retry
  here, or a re-invocation) must re-enter spec 1750 D1's ancestry judgment
  before re-rebasing, per its no-auto-re-grant clause: the empty-remote
  allowance covers only the single invocation that earned it. This closes
  the lost-first-publication shape where a race-losing unrelated root would
  replay conflict-free onto the winner's tip
  ([staff-engineer seed](https://github.com/forwardimpact/monorepo/issues/1583#issuecomment-4676198696)).
  On a healthy clone the re-judgment is a trivially passing local check;
  the cost is confined to the failure path.

Retry is in contract only while both constraints are satisfiable. Whenever
either is not — the silent-clobber fallback still present, or spec 1750's
ancestry judgment not yet landed **in implementation** (the spec is a
coordinated unmerged series peer, PR #1588; a merged-but-unimplemented
1750 leaves the judgment absent from code, so retry stays out of
contract) — the carried alternative **is** the contract: no retry, report
*rejected* immediately with rerun guidance. A 1780 implementation that
precedes 1750's therefore ships without retry, and the matching success
criteria below bind only once both implementations have landed. The
activation obligation has a named owner: the second-landing
implementation's plan carries the step that enables the retry and brings
the three retry criteria into force — if impl(1780) precedes impl(1750),
activation is a deliverable of 1750's plan, not a free-floating
follow-up.

*Working-tree guarantee, restated for the retry era:* a failed push never
**loses** uncommitted work — not "never touches the working tree", which
the operation cannot promise on its conflict paths. Uncommitted work
survives every failure outcome — in the working tree, or retained
elsewhere by the tool, in which case the failure message names where it
went. *Alternative carried:* no retry — report *rejected* immediately with
rerun guidance.

**D4 — Session-end hook surfacing maps failure to a remediation turn.** A
plain non-zero exit at the Stop hook only logs after the agent has stopped
— in headless CI, a line in a long workflow log. The hook semantics that
*block* the stop and feed the failure reason back to the agent for a
remediation turn are what make D1's trajectory actionable: the agent
learns its record is stranded and can pull and re-apply in the same
session. The CLI itself exits plain non-zero, taxonomy-mapped; the mapping
from CLI failure to the hook's blocking semantics is a deliverable of this
spec at the hook wiring (which wiring component carries it, and the exit
convention it uses, are design decisions). CI post-run push steps need no
mapping — a loud failed step is the desired surfacing there.
**Push exit-status fidelity through the invocation layer:** the wiring's
failure determination is grounded in the CLI's own exit status, read
losslessly — no layer between the push subprocess and the hook's blocking
decision may substitute, aggregate, or discard that status. The constraint
is live, not hypothetical: the phantom-push class has a **second proven
lying surface** one wrapper above the libwiki swallow — during a
2026-06-11 03:02Z write attempt, a rejected push's non-zero exit was eaten
by a shell pipeline whose status reflected a downstream command, so the
invocation layer reported success for a push origin never accepted, caught
only by the external ancestry floor
([coach adjudication](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4676820014)).
An invocation pattern whose observed status can be another process's — a
pipeline without pipefail-equivalent semantics, a wrapper keying on prose,
a compound command returning its last member's status — fails this
contract regardless of how honest the CLI beneath it is. This is D2's
grounded-success property restated at the wiring layer: D1/D7's
honest-outcome guarantee must hold through every layer that can lie
between `git push` and the agent's decision, not only at the libwiki API
return value — otherwise the fix invites the same defect to reappear one
wrapper up, where this instance actually lived. Which wiring component
carries the mapping and the exit convention it uses remain design
decisions; that the status arrives unmasked is not.
*Alternative carried:* scope the mapping out and state the weaker
log-only guarantee honestly — rejected in one line: #1580's harm is
precisely the writer not knowing.

**D5 — Foreign claim-row conservation needs its own guard.** The banked
criterion — foreign Active Claims rows survive conflict resolution
([security-engineer review N1](https://github.com/forwardimpact/monorepo/pull/1588#issuecomment-4676068899))
— is **not** implied by the fallback removal plus reject surfacing: a
stale-snapshot commit whose effective row-deletion has no textual overlap
with the remote's hunks replays as a clean rebase and drops the row with no
conflict ever raised, and manual resolution after a loud conflict can drop
it too. This spec therefore requires a conservation guard before the push:
claim rows present on the remote branch must still exist in what would be
pushed unless their removal is a deliberate act carried by the history
being pushed — a targeted release of one's own claim or an expired-claim
cleanup, whether performed by the pushing invocation itself or recorded by
a prior claim/release invocation whose stranded write the session-end push
is retrying (D1 makes that push the retry, so the guard must not refuse
the removals it carries). A push that fails this check refuses or
re-merges, never silently drops. **The check is a write-time content
comparison — Active Claims rows present at the observed remote tip checked
for presence in the tree about to be pushed.** That shape is pinned by
evidence, not preference: the erasure class this guard exists for is
invisible to file-history inspection — under default merge-history
simplification a path-limited `git log` TREESAME-prunes the erased commit,
and `git log -S` shows only the *adding* commit — so a guard built on
inspecting the branch's history is structurally blind to exactly the damage
it must refuse, however plausible its fixtures look (fourth
side-pick-erasure specimen,
[#1564](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4689300925);
[detection-constraint routing](https://github.com/forwardimpact/monorepo/pull/1601#issuecomment-4689343074)).
The same constraint binds verification: the § Success criteria conservation
rows observe content states — rows present in trees and refs — never log
output, because absence from file history is not evidence of absence. What
remains design territory: where in the push pipeline the comparison runs,
and how deliberate-removal intent is recorded and consulted (the
staff-engineer's
[design-seat confirmation](https://github.com/forwardimpact/monorepo/pull/1601#issuecomment-4676414473)
that locally-recorded removal intent satisfies the deliberate-removal leg
composes with the pinned comparison shape — intent recording classifies a
detected removal, content comparison detects it). Until this lands, the
team's adopted "claims are the authority" stance remains conditional.
*Alternative carried:* narrow the criterion to "the tool never mechanically
resolves a conflict by discarding the remote side" (which the fallback
removal alone delivers) and route the conservation guard elsewhere —
rejected in one line: the consolidation banked the broad criterion against
a live incident that passes every ancestry check, and claiming it without
a guard would be indefensible.

**D6 — The whole-tree sweep contract stands.** `fit-wiki push` keeps its
whole-tree commit scope; this spec adds no pathspec option (#1583 item 3
resolved as out). The unscoped sweep was the *carrier* in the observed
losses only because the silent-clobber fallback turned its conflicts into
overwrites; with that fallback removed, a stale contended file riding the
sweep produces a loud conflict from the true tip instead of silent damage.
Contention frequency belongs to the W26 row-format work.
*Alternative carried:* a pathspec option for the sweep — reverses a settled
scoping decision (#1568 lineage) for frequency relief this spec's honesty
goal does not require; revisit only if post-1780 evidence shows loud sweep
conflicts are themselves a material burden.

**D7 — Unsafe-precondition refusal.** When the repository state invalidates
the operation's own instruments — a rebase in progress, or a detached HEAD
(the state behind spec 1750's canonical trap: a push from it publishes the
configured branch ref while the session's commits sit on the detached
chain) — the operation refuses before mutating anything: never any
success-shaped outcome, a *precondition* reason. The per-caller mapping is
uniform — a command failure with non-zero exit on `push`, `claim`, and
`release` — because the refusal fires before the local write commits, so
D1's zero-exit contract (keyed to a claim row that landed locally) never
engages; the message names the preserved uncommitted edit and the
remediation. This aligns with spec 1750's settled exit semantics for guard
refusals and keeps exit code discriminating on every surface. The
*precondition* reason joins the outcome taxonomy alongside 1750's two
guard-refusal classes — three refusal sources, one taxonomy, no parallel
class; it is could-not-verify-shaped (verification could not run),
distinct from confirmed-unrelated (verification ran and condemned), and
reportable in either series order. Seam note: 1750's detached-HEAD
criterion and this row collapse to one observable refusal on that fixture;
the second-landing implementation reconciles reason naming, not behavior.
The binding reason this is in scope rather than implementation detail:
**an interrupted pre-push reconcile *produces* the mid-rebase state** —
the first attempt's reconcile today (an autostash rebase in the current
tool; the criterion binds the state, not the mechanism), and D3's retry
once active — so the refusal is the backstop that prevents a half-finished
reconcile from minting a success-shaped verdict on re-invocation;
companion to, not duplicate of, the retry⇄1750-D1 binding (that one
governs integration eligibility, this one verdict eligibility). The check
is testable without message-copy assertions: rebase-in-progress or
detached HEAD ⇒ refusal, exit code plus reason class. *Alternative
carried:* warn-and-attempt — refuse nothing, attempt the push, and let the
grounded-success property classify the outcome. Weaker on two grounds,
stated so the either/or is honest: (a) D2's groundings prevent *landed*
for the session's stranded commits, but ***nothing to push* can fire
success-shaped from exactly this state** — a rebase stopped at its onto
point leaves HEAD contained in the remote tip, so the attempt path can
mint a quiet success the warning does not prevent; (b) the attempt's
partial mutations on an already-invalid tree are what D3's
work-preservation guarantee then has to clean up. The alternative's
remaining case: a refusal inside the Stop-hook path delays a record whose
push a human must re-trigger — mitigated, not eliminated, by D4's blocking
remediation turn. If the alternative is chosen, the matching § Scope
refusal row and this decision's criterion row revise in the same approval
signal.

## Success Criteria

Each criterion is verified against a fixture wiki clone plus a controllable
remote. Observable channels: exit code, printed message, repository commit
state, remote state, stash state, and the sequence of remote operations the
command performs; each row names what it observes. The three retry rows
bind only once spec 1750's **implementation** has landed (§ Decisions D3 —
a merged-but-unimplemented 1750 still leaves retry out of contract and a
rejection reports immediately); every other row binds regardless of series
order.

| Claim | Verification |
|---|---|
| Landed push ⇒ success reported, and only then. | Healthy fixture, uncontended; run `fit-wiki push`; observe zero exit, success message, and the commit reachable from the remote ref. |
| Success is grounded in observed remote state — never claimed on the push subprocess's output text alone, so no external floor is needed. | Occurrence-#41 fixture ([#1564 allocation anchor](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4676312051)): force only the inadmissible channels to report success — success prose and zero exit, with the per-ref update report absent or reporting the ref un-updated — while the remote ref does not advance to contain the commit, so both permitted grounding mechanisms (per-ref report parsing and post-push remote observation) must classify failure. The stub's per-ref contract is pinned: **absent or failed, never a fabricated ok line** — a fabricated ok would make the fixture falsify the per-ref-parsing mechanism this spec permits; run `fit-wiki push`; observe non-zero exit, a D2 failure reason, and the success message **absent** — the command itself surfaces the stranding that the external run-283 ancestry-verify floor previously had to catch. Repeat via `fit-wiki claim` and `fit-wiki release` (the run-303 specimen's surface — `704cf95a`, § Problem Evidence); observe zero exit with the saved-locally warning carrying the reason, never the success message. |
| Honest subprocess rejection ⇒ the wrapper does not lie — the production shape of occurrences #30/#41. | Companion fixture: bare remote whose `pre-receive` hook exits 1, so the push subprocess fails *honestly* and only the wrapper's swallow could mint success (the shape actually observed in the `ba1468cf` and `bc982943` events — no forced stub, real refusal); run `fit-wiki push`; observe non-zero exit, a D2 failure reason, the success message absent, and the remote ref unchanged. Repeat via `fit-wiki claim`; observe zero exit with the saved-locally warning. |
| Nothing to push ⇒ zero exit with the existing honest message — asserted only when the remote ref contains local HEAD. | Clean fixture whose local HEAD is contained in the observed remote ref; run `fit-wiki push`; observe zero exit and the nothing-to-push message. |
| Stranded-resume state re-pushes: clean tree, local commits ahead ⇒ push attempted, never *nothing to push*. | Fixture with a clean working tree and local commits the remote ref does not contain (the workspace a #41-class stranding leaves when no remediation turn ran — session death, hook skip), with the remote-tracking ref stale so pre-fetch arithmetic would report nothing to do; run `fit-wiki push`; observe a push attempt in the remote-operation sequence and the nothing-to-push message **absent** — an implementation gating the push on tree-dirtiness fails this row. |
| Mid-rebase / detached HEAD ⇒ precondition refusal, never any success-shaped outcome. | Fixture with a rebase in progress, and separately a plain detached HEAD (`git checkout <sha>` — kept distinct because a stopped rebase is itself detached); run `fit-wiki push`; observe non-zero exit, a precondition reason class, the success **and** nothing-to-push messages absent, no remote mutation, and no local mutation — no new commit, rebase state untouched, stash unchanged. Repeat via `fit-wiki claim` and `fit-wiki release`: observe non-zero exit, the precondition reason, no commit created, and the message naming the preserved uncommitted edit. The interrupted-reconcile path is verified by state-equivalent construction — a stopped rebase with an autostash entry present, the state an interrupted reconcile leaves behind (first attempt today; D3 retry once active) — re-invoke and observe the refusal with the stash entry left untouched and named in the message. |
| Rebase conflict ⇒ loud failure, remote side never mechanically discarded. | Fixture with a textually overlapping remote advance; run `fit-wiki push`; observe non-zero exit, a conflict-reason message naming resolve-or-retry, the rebase aborted, no merge commit resolving to the local side, and the remote tip unchanged. |
| Push rejection after a successful fetch ⇒ *rejected* reported, never success. | Fixture whose remote advances without textual overlap between the operation's fetch and push (retry exhausted, see retry rows); observe non-zero exit and the rejected reason — not a success report. |
| Push failure with a failed fetch ⇒ *transport*, not *rejected*. | Fixture with remote observation forced to fail (credentials) and a push that would be rejected against the stale ref; run `fit-wiki push`; observe the transport classification and no rerun-guidance loop. |
| Transport failure on the push itself ⇒ *transport*, no retry. | Fixture with the push forced to fail at transport; observe non-zero exit, transport reason, and a remote-operation sequence containing exactly one push attempt. |
| Retry: fetch-stale race with no textual overlap ⇒ lands on the single retry. | Fixture whose remote advances cleanly after the operation's first fetch; run `fit-wiki push`; observe a second reconcile-and-push in the operation sequence, zero exit, and the commit on the remote. |
| Retry is bounded at one. | Fixture whose remote advances cleanly after every fetch; observe at most two push attempts and a final non-masked rejected outcome. |
| Retry re-enters the ancestry judgment. | First-publication fixture (empty-remote allowance granted) whose push loses its race to another first-pusher; observe the retry refuses fail-closed with no replay of the unrelated root onto the winner's tip, and the remote tip unchanged. |
| `claim` with a failed push ⇒ **zero exit**. | Claim fixture with the push forced to fail (rejection and transport, separately); run `fit-wiki claim`; observe exit code zero in both cases. |
| `claim` with a failed push ⇒ honest saved-locally warning carrying the reason. | Same fixtures; observe the warning names saved-locally, not-yet-visible, and the D2 reason class; observe the success message is **absent**. |
| `claim` with a landed push ⇒ success message, zero exit. | Healthy claim fixture; observe the success message only after the remote accepted. |
| `release` (targeted) maps outcomes identically. | Repeat the three `claim` rows via `fit-wiki release` on an owned claim; observe the same exit codes, warning, and success gating. |
| `release --expired` maps outcomes identically. | Repeat via `fit-wiki release --expired` over an expired foreign claim; observe the same exit codes, warning, and success gating — and the expired row's removal still pushes when healthy. |
| Parallel-claim trajectory holds end to end. | Two fixture sessions claim concurrently (same table tail); observe the loser's claim exits zero with the saved-locally warning, its session-end `fit-wiki push` fails loud with a conflict or rejected reason, and a pull-then-push from the true tip lands the row. |
| Stop-hook failure blocks the stop and feeds the reason to the agent. | Invoke the session-end hook wiring with a push forced to fail; observe the hook-blocking exit semantics carrying the failure reason, and that a subsequent clean push permits the stop. |
| Exit-status fidelity: the invocation layer never masks the CLI's failure status. | Wiring fixture where the CLI exits non-zero while every other process in the invocation chain exits zero (the shell-pipeline masking shape, 2026-06-11 03:02Z surface); invoke the session-end wiring; observe the failure classification and the hook-blocking semantics engage — an implementation whose observed status can be a downstream process's (pipeline last-member status, prose keying) fails this row. |
| A failed push never loses uncommitted work. | Run `fit-wiki claim` and `fit-wiki release` (the MEMORY.md-scoped surfaces, where uncommitted foreign residue exists at reconcile time — the whole-tree path commits the tree before reconciling) with the work-preservation step forced to conflict on the failure path; observe the residue present in the working tree or retained where the failure message says it went. |
| Foreign claim-row conservation: clean-rebase drop refused. | Fixture whose local MEMORY.md commit was written from a stale read and deletes a foreign claim row present in both the merge base and the remote tip, with no textually overlapping remote change so the rebase replays clean; run `fit-wiki push`; observe the push refuses or re-merges and the foreign row survives on the remote — read as a content state of the remote-tip tree, never inferred from file-history output, which TREESAME-prunes this erasure class (§ Decisions D5). |
| Foreign claim-row conservation: post-resolution drop refused. | Fixture where a manual conflict resolution dropped a foreign row; run `fit-wiki push`; observe refusal or re-merge and the row's survival, read as a content state of the remote-tip tree. |
| Conservation holds on the claim/release surfaces. | Drive the stale-read deletion fixture through `fit-wiki claim`; observe zero exit with the saved-locally warning (the guard refusal is a push failure under D1), the foreign row's survival on the remote, and no silent drop pushed. |
| Deliberate removals pass the conservation guard, including when retried by the session-end push. | Targeted release of an owned claim and `release --expired` over a foreign expired claim, each pushing successfully; then a targeted release whose own push is forced to fail, followed by `fit-wiki push` from the same clone — observe the carried removal lands and the push succeeds. |
| Whole-tree sweep contract unchanged. | Fixture with changes across multiple files; run `fit-wiki push`; observe a single commit sweeping the tree, as today. |
| Healthy-clone behavior otherwise unchanged — and the suite's defect-asserting rows are inverted, not preserved. | Run the libwiki test suite — with the rows that assert the removed behaviors revised to the new contract: the silent-clobber recovery rows, and specifically the "commitAndPush tolerates a failing push (WikiRepo fire-and-forget)" test (`wiki-sync.test.js:218` at spec time), which locks in the phantom-success defect and must be **inverted** to assert a failure outcome — plus a healthy-clone fixture through all three surfaces; observe unchanged outcomes and messages apart from the honest-success gating and those revised rows. |
| The contract documentation describes the taxonomy and per-caller mapping. | Read the `commitAndPush` contract surface documentation; observe it states the outcome taxonomy, the per-caller exit mapping, the conservation guard, and traces to this spec. |

## Provenance

Folded with attribution: call-site inventory, hook-exit semantics,
propagation-channel requirement, retry scope, fetch-conditioned taxonomy,
conservation-criterion gap, and autostash residue from the
[staff-engineer technical seed](https://github.com/forwardimpact/monorepo/issues/1583#issuecomment-4676224637);
retry⇄ancestry binding from the
[staff-engineer carry seed](https://github.com/forwardimpact/monorepo/issues/1583#issuecomment-4676198696);
D1–D3 shape from the
[panel-tested decision table](https://github.com/forwardimpact/monorepo/issues/1583#issuecomment-4675991399);
conservation criterion from the
[security-engineer review of PR #1588](https://github.com/forwardimpact/monorepo/pull/1588#issuecomment-4676068899);
evidence framing per the
[improvement-coach correction anchor](https://github.com/forwardimpact/monorepo/issues/1583#issuecomment-4676124931);
occurrence #41 evidence and the grounded-success ("no external floor
needed") acceptance framing from the
[improvement-coach allocation pass](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4676312051),
folded 2026-06-11; run-303 release-path specimen (`704cf95a` →
`8b211fe8`) and the deterministic-rate revision from the
[improvement-coach ledger disposition](https://github.com/forwardimpact/monorepo/issues/1580#issuecomment-4676327242),
folded 2026-06-11; grounded-success channel disambiguation (remote-originated
per-ref report admissible, prose/exit inadmissible), the
inadmissible-channels-only fixture clause, and the ordinal hedge from the
[staff-engineer amendment review](https://github.com/forwardimpact/monorepo/pull/1601#issuecomment-4676393596)
(F1, F2), folded 2026-06-11; implementation-landed retry-trigger
clarification and the second-landing-plan retry-activation ownership rule
from the
[staff-engineer seed-faithfulness review](https://github.com/forwardimpact/monorepo/pull/1601#issuecomment-4676414473)
(findings 1, 2), folded 2026-06-11; nothing-to-push remote grounding and
the stranded-resume criterion from the
[improvement-coach framing-question adjudication](https://github.com/forwardimpact/monorepo/pull/1601#issuecomment-4676413817)
(residual gap, one-row fix adopted with the D2 contract clause), folded
2026-06-11; D7 unsafe-precondition refusal restoring the
[seed-table Update #2 adoption](https://github.com/forwardimpact/monorepo/issues/1580#issuecomment-4676307171)
(coach proposal, PM-adapted: refuse-vs-warn carried, testable criterion,
could-not-verify sub-class, D3-composition backstop) that the authored
spec had lost, folded 2026-06-11 per the adjudication's ask#9 note;
occurrence-#41 live verification, the defect-asserting-test inversion,
the pinned per-ref stub contract, and the honest-rejection companion
fixture from the
[release-engineer verification](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4676483628),
with ordinals per the
[improvement-coach final ledger reconciliation](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4676486013)
(#41 = `bc982943` stands as written), folded 2026-06-11; D7 package
panel-treated post-landing (3 product + 3 technical fresh seats,
2026-06-11) with the consensus findings folded — uniform non-zero
per-caller mapping aligned with 1750's guard-refusal exit semantics
(replacing the zero-exit claim/release branch, which the panels showed
vacuous-or-wrong since the refusal precedes the local commit), the
three-source taxonomy count corrected against 1750's class distinction,
the warn-and-attempt defense corrected (it cannot prevent a false
*nothing to push* from a stopped rebase's onto point), the 1750
detached-HEAD seam named, claim/release + local-non-mutation legs added
to the criterion, the interrupted-reconcile leg recast as
state-equivalent construction, and the four-instrument problem framing
anchored — and the four-instrument § Problem paragraph itself folded from
the [spec-owner gap flag](https://github.com/forwardimpact/monorepo/pull/1601#issuecomment-4676394990)
(item 2a), completing the coach-input fold whose decision-row half D7
carried; wiring-layer push exit-status fidelity clause (D4), the
matching scope-row tightening, and the masking-fixture criterion from the
staff-engineer live event (shell-pipeline exit-status masking, fourth
observation-layer floor-save) routed by the improvement-coach
([PR #1601 routing](https://github.com/forwardimpact/monorepo/pull/1601#issuecomment-4676821202);
[adjudication anchor](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4676820014)),
folded 2026-06-11; D5 write-time content-comparison constraint and the
content-state-not-log-output observation rule from the
[staff-engineer detection-constraint routing](https://github.com/forwardimpact/monorepo/pull/1601#issuecomment-4689343074)
(fourth side-pick-erasure specimen,
[#1564](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4689300925)),
folded 2026-06-12.

— Product Manager 🌱
