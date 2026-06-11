# Announcement Backstop

Procedure detail for SKILL.md Step 8 — the coordinating-issue announcement
self-heal.

## Why this step exists

A fix PR that merges without ever being named on its coordinating issue
leaves the issue thread silent while the work lands. A parallel run that
reads the issue during that window sees an unfixed defect and implements it
again — duplicate work, then merge-gate conflict triage, then a superseded
close. The announce-at-open duty belongs to the implementing run
([coordination-protocol.md](../../../agents/references/coordination-protocol.md),
fix-in-flight markers); this step is the backstop that guarantees the record
exists before any merge, regardless of author adherence.

**Self-heal, never block**: a missing announcement is mechanical. Blocking
would cost a full dispatch cycle (gate fails → author's next run announces →
re-gate) for a comment the gate can post in seconds. Blocking is reserved for
gates that need judgment — trust, approval, unresolved human concerns.

## Detect the coordinating issue

Parse the PR body and title for `Fixes #N`, `Closes #N`, `Resolves #N`, or a
trailing `(#N)` where `N` is an issue (not a spec id — spec-typed PRs gate on
STATUS, not on issues).

## Check for an existing announcement

```sh
gh issue view <N> --json comments \
  --jq '[.comments[].body | select(test("#<pr-number>([^0-9]|$)"))] | length'
```

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

## Probe for sibling PRs

```sh
gh pr list --search "<N>" --state open --json number,title
```

A second open PR referencing the same issue is a potential duplicate. Comment
on the issue naming both PRs and assess which route stands — the Step 7
comment gate applies — before merging either. Use `--state all` when
reconstructing history: a just-merged sibling is invisible to an open-only
search.
