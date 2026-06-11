# Spec 1750 — libwiki commitAndPush ancestry guard

`fit-wiki push` on a clone that has lost sight of origin's history would
today sweep the entire working tree into a snapshot commit before any
failure surfaces. This spec adds a fail-loudly ancestry guard ahead of
both halves of the operation — the commit when one would be created, and
the push even when none is (#1576). The invariant in one sentence:
**unverifiable ⇒ refuse, everywhere — before damage.**

Scope note: this spec was initially drafted as a fold with #1580 (honest
push-outcome reporting). That half now belongs to the consolidated
"commitAndPush fails loudly" spec covering #1583 items 1–2 + #1580, with
item 3 (sweep scoping) carried there as an explicit in-spec decision
point, per the reconciliation recorded on all three issues. The two specs
are a coordinated series on the same method: whichever lands second
rebases on the first.

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The wiki is the team's persistent memory, written by every agent session through the Stop hook (`fit-wiki push`) and through `claim`/`release`. A clone that cannot see origin's history is exactly the state where committing should stop — yet today it is the state where the whole-tree sweep mints a multi-thousand-line snapshot commit that a later healthy actor could rebase or merge into shared history, polluting every teammate's memory. |
| Platform Builders | [Build Agent-Capable Systems](../../JTBD.md#platform-builders-build-agent-capable-systems) | `WikiSync.commitAndPush` in `libwiki` is the shared write primitive behind the `fit-wiki push`, `claim`, and `release` command surfaces. It commits before verifying that HEAD exists or shares ancestry with the remote branch, so every consumer inherits the same unguarded failure mode; a guard at the primitive covers all surfaces at one seam. |

## Problem

Staff-engineer verification on #1576 (at main `0951c37d`) confirmed the
defect and sharpened it: **in every failure path, the damage precedes the
first failure.** A second source verification (run-131, at main
`055ed3f5`) confirmed the two review findings folded into this revision:
the commit and push gates are independent by documented design, and a
detached HEAD turns publication into silent data loss.

| Path on an unverifiable clone | Today's behavior |
|---|---|
| Unborn HEAD, local remote-tracking ref absent | The whole-tree sweep mints a full snapshot root commit; only then does the commits-ahead check crash — one step too late, with the snapshot already available to a later healthy actor. The crash is loud only on `fit-wiki push`; the `claim`/`release` surfaces swallow it into a saved-locally message, so two of the three surfaces are silent even after the damage. |
| Severed history, remote-tracking ref resolvable | The unrelated root rebases onto the remote branch; if it applies cleanly the snapshot lands and pushes silently — the worst case. If it conflicts, the failure is loud but the commit was already minted. |
| Clean tree, unverifiable history already committed locally | No commit is created — the operation's commit gate and push gate are independent by documented design — and the push runs anyway, publishing the unverifiable history without ever entering the commit path. A guard that only runs "before creating any commit" never fires on this shape. Aggravating: the push itself is fire-and-forget and the operation reports success unconditionally, so the bypass is also invisible (outcome honesty rides the consolidated spec; the guard must therefore refuse *before* the push). |
| Detached HEAD with pending writes | The session's commits land on a detached chain, but the push publishes the configured branch ref — not HEAD — so nothing the session wrote is published; the push reports up-to-date, the command prints success, and the orphaned commits are eventually garbage-collected. Silent data loss reported as success. Naive ancestry checks pass on this shape (HEAD resolves, a merge-base exists), which is why D1 demands the verified history be the published history. |

Status: defense-in-depth. No occurrence has been observed, and no code
route currently re-initializes a wiki clone; the guard exists so that if
one ever appears, the failure is a refusal rather than a polluting commit.

One adjacent behavior shapes the contract: the sync layer's remote fetch
swallows all failures, so "the local remote-tracking ref does not resolve"
conflates a *genuinely empty remote* (a new wiki's first commit — must be
allowed) with a *failed observation of the remote* on a history-less clone
(the exact state the guard exists to stop). The settled invariant in
§ Decisions D1 closes this with a positive-evidence requirement.

## Scope

### In scope

| Component | What changes |
|---|---|
| `WikiSync.commitAndPush` verification on every invocation | The clone's ancestry is verified against the remote branch per § Decisions D1 on every invocation of the operation: before the commit when one would be created, and before the push even when none is — the operation's commit and push gates are independent, so a clean tree whose branch already carries unverifiable committed history must refuse at the push gate rather than publish. A refusal creates no commit, attempts no push, adds no working-tree changes of its own, and names its recovery path. Both the whole-tree and pathspec-scoped commit modes pass through the same guard. |
| Command surfaces `fit-wiki push`, `claim`, `release` | A guard refusal exits non-zero on every surface (§ Decisions D2): on `push` the Stop hook then surfaces it in session output; on `claim`/`release` it surfaces directly to the invoking session. On `claim`/`release` this pierces the surfaces' existing degradation, which today maps every sync failure to a saved-locally success: a guard refusal propagates to the non-zero exit, and the refusal message states that the locally written claim/release row is **not published** — the row remains as an uncommitted working-tree change. All other failure modes on those surfaces keep today's degradation; their fate belongs to the consolidated spec. |
| Remote-emptiness evidence | The empty-new-wiki allowance is granted only on a successful, non-swallowed remote observation confirming the branch does not exist on origin (§ Decisions D1). The evidence runs only on the path where the local remote-tracking ref is absent, so the healthy-clone hot path pays no extra remote round-trip. |
| Documented contract surface | The `commitAndPush` contract documentation describes the guard, traceable to this spec. |

### Out of scope

- **Push-outcome honesty and the conflict-time merge fallback** (#1580,
  #1583 items 1–2; item 3's sweep-scoping reversal rides there as an
  explicit decision point) — the consolidated "commitAndPush fails
  loudly" spec, next in the P2 lane and a coordinated series with this
  one.
- **The swallowed pre-rebase fetch on a healthy clone** — that swallow
  belongs to the healthy-clone outcome regime of the consolidated spec.
  This spec requires a non-swallowed remote observation only where D1's
  emptiness evidence demands one.
- **Pathspec scoping of staged commits** — landed in PR #1571 (#1568);
  the guard composes with it unchanged.
- **Shallow-clone fetch depth at session setup** (#1577, release-engineer
  lane) — independent; D1's verify-against-full-history step makes this
  spec deployable before or after it.
- **Spec 1730** (`libwiki-compliant-by-construction-writes`) — standalone
  per the spec-boundary decision on #1576; 1730 references this contract
  rather than absorbing it.
- **Routes that could re-initialize a wiki clone** — none exist today;
  preventing their introduction is not this spec's job.

## Decisions

**D1 — Ancestry invariant (settled on #1576; restated here).** Refuse to
commit and to push — creating no commit, adding no working-tree changes,
naming the recovery — whenever the remote branch exists and HEAD is unborn
or shares no merge-base with it. The guard holds on **every** invocation
of the operation, not only when a commit would be created: a clean tree
contributes nothing new to commit, but if its branch already carries
unverifiable committed history the push half alone is the D1 damage, and
the invocation refuses before it. The empty-new-wiki allowance (accepting a
new wiki's first publication, however many local commits it has
accumulated) is granted only on positive evidence the remote is empty: a successful, non-swallowed remote observation
confirming the branch's absence; mere absence of the local remote-tracking
ref never grants it. The allowance covers the single invocation that earned
it: if that first publication fails to land — for example, it loses its
push race to another first-pusher — the remote branch now exists, and any
retry is judged by the standard rows above (manual recovery, fail-closed);
no design may auto-re-grant the allowance on retry. When shared ancestry
cannot be resolved in a shallow clone, verify against full history before
refusing; if that deeper
verification itself cannot be completed (network, auth), refuse with a
distinct could-not-verify error so the operator knows which state they are
recovering from. Beyond the enumerated shapes, fail closed: any state in
which the relationship between the history that would be published and the
remote branch can be neither confirmed nor refuted refuses under the same
distinct could-not-verify class, so "unverifiable ⇒ refuse, everywhere" is
operational rather than aspirational. The history the guard verifies must
be the history the push would publish — a detached HEAD is the canonical
trap: HEAD resolves and shares a merge-base, so a naive ancestry check
classifies it verifiable, yet the push publishes the configured branch
ref, not HEAD, and today the session's commits are silently lost while
the command reports success (source-confirmed at main `055ed3f5`). Provenance: invariant and positive-evidence standard
settled at [#1576 issuecomment-4675759237](https://github.com/forwardimpact/monorepo/issues/1576#issuecomment-4675759237);
fail-closed deepening accepted at [#1576 issuecomment-4675741749](https://github.com/forwardimpact/monorepo/issues/1576#issuecomment-4675741749).
The evidence and verification mechanisms (probe vs surfaced fetch, how
full history is obtained) are design decisions.

**D2 — Refusal exit semantics (settled for `push` on #1576; extended
here to `claim`/`release`).** A guard refusal is a command failure:
non-zero exit on `push`, `claim`, and `release`, because the refusal
prevents damage and must interrupt the session rather than scroll past.
The `push` half is part of the settled invariant ("non-zero exit,
working tree untouched", surfaced by the Stop hook); what this spec adds
is the extension to `claim`/`release`, where the non-zero exit must
pierce those surfaces' existing swallow-everything degradation for guard
refusals only (§ In scope). Accepted consequence: the existing "offline
sessions never fail their Stop hook" property narrows — a session on a
broken clone, or one whose ancestry cannot be verified, now fails
visibly. That is the point of the guard; healthy clones (the modal case,
including today's CI sessions whose ancestry resolves within the fetched
window) are unaffected.

## Success Criteria

Each criterion is verified against a fixture wiki clone plus a
controllable remote. The observable channels are exit code, printed
message, repository commit state, remote state, and the sequence of
remote operations the command performs; each row names the channels it
observes.

| Claim | Verification |
|---|---|
| Unborn HEAD with the remote branch present ⇒ refusal: non-zero exit, no commit created, no push attempted, message names re-clone recovery. | History-less clone fixture against a populated remote; run `fit-wiki push`; observe exit code, message, commit state, and the command's remote operations (no push among them). |
| Severed history (no merge-base, full history) ⇒ refusal: non-zero exit, no new commit, remote tip unchanged. | Fixture with an unrelated local root and a resolvable remote branch; run `fit-wiki push`; observe no snapshot commit exists and the remote tip is unchanged. |
| Clean tree with committed unverifiable history ahead of the remote ⇒ refusal at the push half: non-zero exit, no push attempted, remote tip unchanged. | Clean-working-tree clone fixture whose branch already carries committed unrelated history ahead of a populated remote; run `fit-wiki push`; observe non-zero exit, no new commit, no push among the command's remote operations, and the remote tip unchanged. |
| Shallow clone whose shared ancestry lies outside the fetched window ⇒ verified against full history and allowed to proceed. | Depth-limited clone fixture with ancestry beyond the window; run `fit-wiki push`; observe a completed commit-and-push with no refusal. |
| Shallow clone whose shared ancestry resolves within the fetched window ⇒ proceeds with no deepening fetch. | Depth-limited clone fixture with the merge-base inside the window; run `fit-wiki push`; observe a completed commit-and-push and a remote-operation sequence containing no history-deepening fetch. |
| Shallow clone where the full-history verification completes and still finds no shared ancestry ⇒ confirmed-unrelated refusal: non-zero exit, no commit. | Depth-limited fixture over a genuinely unrelated history; run `fit-wiki push`; observe the confirmed-unrelated refusal after the deeper verification, and no new commit. |
| Failure of the deeper verification itself ⇒ distinct could-not-verify refusal: non-zero exit, no commit, error text differs from the confirmed-unrelated refusal. | Shallow fixture with the full-history verification forced to fail; observe the distinct message and absence of any new commit. |
| Detached HEAD ⇒ could-not-verify refusal: non-zero exit, no commit created, no push attempted. | Fixture clone checked out at a commit SHA (detached HEAD) with pending working-tree changes; run `fit-wiki push`; observe the could-not-verify refusal, no new commit on any ref, and no push among the command's remote operations — replacing today's silent loss, where the push publishes the branch ref instead of HEAD and reports success. |
| Genuinely empty remote with positive evidence ⇒ first commit accepted and pushed. | Fresh wiki fixture against an empty remote; run `fit-wiki push`; observe the commit on the remote. |
| Local remote-tracking ref absent and remote unobservable ⇒ refusal: non-zero exit, no commit. | History-less clone fixture with remote observation forced to fail; observe a refusal, not a snapshot commit. |
| Local remote-tracking ref absent, remote observable, branch present on origin, shared ancestry confirmed against full history ⇒ allowed to proceed. | Fixture clone with the remote-tracking ref removed but its history genuinely shared with a populated remote; run `fit-wiki push`; observe a completed commit-and-push with no refusal. |
| Pathspec-scoped surfaces flow through the same guard, and a refusal leaves the claim/release row uncommitted with a message stating it is not published. | Repeat the unborn-HEAD and severed-history fixtures via both `fit-wiki claim` and `fit-wiki release`; observe on each surface a non-zero exit, no commit created, the row change present only as an uncommitted change, and the not-published message. |
| Healthy-clone hot path pays no extra remote round-trip for the emptiness evidence. | Fixture with a resolving local remote-tracking ref and clean ancestry; run `fit-wiki push`; observe the sequence of remote operations the command performs matches today's baseline. |
| Healthy-clone behavior is otherwise unchanged: existing `push`, `claim`, and `release` flows complete as today. | Run the existing libwiki test suite plus a healthy-clone fixture through all three surfaces; observe unchanged outcomes and messages. |
| The `commitAndPush` contract documentation describes the guard. | Read the JSDoc contract surface; observe it states the refusal conditions, the positive-evidence allowance, and traces to this spec. |

— Product Manager 🌱
