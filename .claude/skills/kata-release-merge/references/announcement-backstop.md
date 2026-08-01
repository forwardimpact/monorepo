# Announcement Backstop

Procedure detail for SKILL.md Step 8, the coordinating-issue announcement
self-heal.

## Why This Step Exists

A fix PR can merge before any comment names it on its coordinating issue. The
issue thread then stays silent while the work lands. A parallel run that reads
the issue during that window sees an unfixed defect. That run implements the
defect again. The result is duplicate work, then merge-gate conflict triage,
then a superseded close. The announce-at-open duty belongs to the run that
implements the fix
([coordination-protocol.md](../../../agents/x-coordination-protocol.md),
fix-in-flight markers). This step is the backstop. It guarantees the record
exists before any merge, and it does not depend on author adherence.

**Self-heal, never block**: a missing announcement is mechanical. A block would
cost a full dispatch cycle (gate fails → author's next run announces →
re-gate). The gate can post that comment in seconds. Reserve the block for
gates that need judgment: trust, approval, and unresolved human concerns.

## Detect the Coordinating Issue

Parse the PR body and title for `Fixes #N`, `Closes #N`, `Resolves #N`, or a
trailing `(#N)` where `N` is an issue. `N` is never a spec id. Spec-typed PRs
gate on STATUS, and they do not gate on issues.

## Check for an Existing Announcement

`read` the coordinating issue's comments
([work-trackers.md](../../../agents/x-work-trackers.md)) and count
those whose body matches the PR number with a boundary pattern
(`#<pr-number>([^0-9]|$)`).

The boundary pattern matters. A plain substring match lets `#15981` satisfy a
check for `#1598`. The gate would then skip the heal, and the miss would go
unlogged. That is exactly the signal loss this step prevents.

A count of zero means the PR is unannounced. Post the cross-link from
[`templates.md`](templates.md) § Announcement Cross-Link. Then record the
adherence miss in the run log with the authoring agent's lane (SKILL.md
§ Memory). Always record the Step 8 outcome, for example "announcement
backstop: N PRs with coordinating issues, 0 heals". A zero-heal run is then
positive evidence of author adherence, and you can tell it apart from a run
where the check never ran.

## Probe for Sibling PRs

`list` all changes (any state) with a search for the issue number `<N>`. Read
the number, title, and state
([work-trackers.md](../../../agents/x-work-trackers.md)).

A second PR that references the same issue is a potential duplicate. Comment on
the issue and name both PRs. Assess which route stands before you merge either
one. The Step 7 comment gate applies. `--state all` is load-bearing at the gate
for the same reason it is load-bearing in
[coordination-protocol § Claim → probe → create](../../../agents/x-coordination-protocol.md#claim--probe--create):
a just-merged sibling settles which route stands, and an open-only search
cannot see it.

The search index lags by minutes, so an empty result is not absence
evidence. The comment scan in the announcement check above is the lag-free
complement. It reads the coordinating issue directly. A sibling that followed
the fix-in-flight marker rule appears there even when the index still lags.
Treat the two instruments as a pair. The index search finds unannounced
siblings. The comment scan finds announced ones. The remaining blind spot
(unannounced **and** index-lagged) is bounded. The sibling's own merge gate
runs this same probe after the index catches up.
