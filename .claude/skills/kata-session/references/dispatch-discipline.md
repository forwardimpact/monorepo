# Dispatch Discipline

Before dispatching follow-on work for a reviewed artifact, check whether the
route is already taken. A review Disposition that pre-announces a same-run
continuation ("findings will be addressed by a revision on this branch in the
same run") is an exclusive route reservation. Re-dispatching the same
obligation manufactures duplicate intent — two agents authoring the same
change in parallel — and no merge discipline removes duplicate intent; it only
picks a winner after both have done the work.

## The Route-Taken Check

Run this check immediately before dispatching follow-on work for any artifact
that has a coordinating thread (PR or issue):

1. **Read the coordinating artifact's tail** — the latest review Disposition
   comment and any revision pin comment posted after it.
2. **Read the branch tip** — has a revision already landed for the announced
   continuation?
3. **Treat an unexpired same-run continuation announcement as route-taken** —
   do not re-dispatch. At most, `Ask` the owning agent for status.

A continuation announcement is **expired** only when its announcing run has
concluded without delivering the announced revision — no pin comment and no
new commit on the branch. Until then, the route belongs to the announcing
run, even if no revision is visible yet.

The facilitator has no `Bash`. Where the tail and tip are not directly
readable, `Ask` the artifact's owning agent to report them; the answer is the
gate, and the dispatch waits for it.

## One Flag, One Owner, One Channel

Each piece of follow-on work gets exactly one owner reached through one
channel. Fanning a single flag through multiple dispatch routes — an
orchestration `Ask` plus a protocol-internal continuation plus a queued memo —
produces duplicate intent even when every individual route is plausible. If
two routes could both plausibly carry an obligation, the coordinating
artifact's tail decides which one holds it; the other route stands down.

## Shared-workspace commit discipline

When concurrent activations share one checkout, committed loss (a teammate's
in-flight edit shipped under the wrong author) needs two conditions at once: two
writers in one workspace, and a commit that stages by sweep. These rules remove
both — without a lock. **No lock, lease, or mutex over the workspace or any
claim:** the only serializer is an advisory hold whose liveness signal is the
`Answer`. The dominant failure of a real lock — held by a crashed activation
with no lease — this protocol avoids.

### Edit-intent on a work-producing ask

Every ask that has a receiver *commit* in the shared checkout carries an
**edit-intent** with two structurally distinct classes:

| Class | Receiver stages it? | Dispatch orders on it? |
| --- | --- | --- |
| `staged_paths` — the own-artifact paths the receiver will commit | yes | yes |
| `output_surfaces` — non-staged shared targets (a reconciliation thread, a session summary, an Announce) the directive writes but no one stages | **no** | yes |

The split is a hard boundary: a receiver stages **only** `staged_paths`, never
an `output_surface`. Both classes name the specific target (a concrete path, a
thread) — never a coarse key like "the wiki" — so unrelated work does not
serialize. Example:

```
Ask(to: agent-x, edit-intent: {
  staged_paths: ["wiki/<own-weekly-log>.md", "wiki/metrics/<skill>/<year>.csv"],
  output_surfaces: ["<coordinating-issue> thread"]
})
```

### Path-scoped staging (receiver side)

The receiver commits its own artifacts by explicit path — exactly the
`staged_paths` it was given — never a whole-tree sweep. A commit stages what its
author named, not whatever the shared tree holds.

### Same-surface serialization (facilitator side)

Route a same-mutable-surface ask only after the prior ask whose edit-intent
union (`staged_paths` ∪ `output_surfaces`) intersects this surface has returned
its `Answer` or released. Key the hold on the **specific surface**, not the
session — asks touching unrelated targets run concurrently. The hold is
advisory; if no `Answer` arrives the facilitator releases on its own judgment
(no automated lease).

### Single-owner routing

A **single-owner** directive routes to exactly one acting lane; co-recipients
get a no-staging FYI that carries no edit-intent and needs no action. With one
acting lane there is no fan-out to serialize.

Classify at dispatch: a directive is **multi-owner iff it explicitly names two
or more distinct acting recipients, each given a work-producing instruction.**
Everything else — one named owner, an unaddressed "someone should…", a
close-out or decision directive — is **single-owner**. **Ambiguous directives
default to single-owner.** A misclassified fan-out ships duplicate records
(committed-loss-adjacent); a starved FYI lane is recoverable by re-dispatch.
Bias toward the recoverable error: a true multi-owner directive misread as
single-owner only delays its other lanes one cycle.

Single-owner routing is cardinality only — no lock, lease, or mutual exclusion.
