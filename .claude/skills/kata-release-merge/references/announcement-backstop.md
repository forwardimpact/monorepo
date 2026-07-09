# Announcement Backstop

Procedure detail for SKILL.md Step 8 — the coordinating-issue announcement
self-heal.

## Why This Step Exists

A fix PR that merges without ever being named on its coordinating issue
leaves the issue thread silent while the work lands. A parallel run that
reads the issue during that window sees an unfixed defect and implements it
again — duplicate work, then merge-gate conflict triage, then a superseded
close. The announce-at-open duty belongs to the implementing run
([coordination-protocol.md](../../../agents/x-coordination-protocol.md),
fix-in-flight markers); this step is the backstop that guarantees the record
exists before any merge, regardless of author adherence.

**Self-heal, never block**: a missing announcement is mechanical. Blocking
would cost a full dispatch cycle (gate fails → author's next run announces →
re-gate) for a comment the gate can post in seconds. Blocking is reserved for
gates that need judgment — trust, approval, unresolved human concerns.

## Detect the Coordinating Issue

Parse the PR body and title for `Fixes #N`, `Closes #N`, `Resolves #N`, or a
trailing `(#N)` where `N` is an issue (not a spec id — spec-typed PRs gate on
STATUS, not on issues).

## Check for an Existing Announcement

`read` the coordinating issue's comments
([work-trackers.md](../../../agents/x-work-trackers.md)) and count
those whose body matches the PR number with a boundary pattern
(`#<pr-number>([^0-9]|$)`).

The boundary pattern matters: a plain substring match lets `#15981` satisfy a
check for `#1598`, so the gate would skip the heal and the miss would go
unlogged — exactly the signal loss this step exists to prevent.

Zero means unannounced: post the cross-link from
[`templates.md`](templates.md) § Announcement Cross-Link, then record the
adherence miss in the run log with the authoring agent's lane (SKILL.md
§ Memory). Record the Step 8 outcome unconditionally — e.g. "announcement
backstop: N PRs with coordinating issues, 0 heals" — so a zero-heal run is
positive evidence of author adherence, distinguishable from the check never
running.

## Probe for Sibling PRs

`list` all changes (any state) searching for the issue number `<N>`, reading
number, title, and state
([work-trackers.md](../../../agents/x-work-trackers.md)).

A second PR referencing the same issue is a potential duplicate. Comment on
the issue naming both PRs and assess which route stands — the Step 7 comment
gate applies — before merging either. `--state all` is load-bearing at the
gate for the same reason it is in
[coordination-protocol § Claim → probe → create](../../../agents/x-coordination-protocol.md#claim--probe--create):
a just-merged sibling settles which route stands, and is invisible to an
open-only search.

The search index lags by minutes, so an empty result is not absence
evidence. The comment scan in the announcement check above is the lag-free
complement: it reads the coordinating issue directly, so a sibling that
followed the fix-in-flight marker rule appears there even when the index has
not caught up. Treat the two instruments as a pair — index search for
unannounced siblings, comment scan for announced ones. The remaining blind
spot (unannounced **and** index-lagged) is bounded: the sibling's own merge
gate runs this same probe after the index catches up.
