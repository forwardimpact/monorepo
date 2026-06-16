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
