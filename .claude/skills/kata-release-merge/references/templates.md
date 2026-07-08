# Release Merge Templates

Comment templates and report formats for the merge gate.

Each template is a `comment` on a change or issue
([work-trackers.md](../../../agents/x-work-trackers.md)); fill the body
shown and post it.

## Skip Comments

### Untrusted Author

> Release merge: skipping — author `<login>` is not in the top 7 contributors.
> Requires human review.

### Unsupported PR Type

> Release merge: skipping — PR type `<type>` requires human review.

### Awaiting Approval Signal

> Release merge: blocked — `wiki/STATUS.md` row for the spec does not yet show
> `<phase>\tapproved`. Apply `<phase>:approved` label, submit an APPROVED
> review, or post an approval comment from a trusted account; `kata-dispatch`
> will propagate it into STATUS.

### CI Failing

Comment with the specific failing checks from the change's CI `read`.

### Substantive Conflict

> Release merge: blocked — substantive conflicts in <files>. Author judgment
> needed; aborting rebase.

## Announcement Cross-Link

`comment` on the **coordinating issue** (not the change) when Step 8 finds no
comment naming the PR
([work-trackers.md](../../../agents/x-work-trackers.md)). Adapt the
verb to the PR's state at gate time:

> Release merge (announcement backstop): PR #<pr-number> — `<title>` — is in
> flight for this issue and has reached the merge gate. Cross-link posted by the
> gate because no prior comment here named the PR; recorded as an adherence miss
> per coordination-protocol.md fix-in-flight markers.

## Re-ping Comments

Posted by the **Re-ping Rule** (SKILL.md Step 10, item 4) when a blocked PR's
silence window has expired. Post the one template below, filling `<state>`,
`<owner>`, and `<next-action>` from the row matching the PR's block reason —
already computed in this run's Steps 2–8; the Re-ping Rule does not re-run the
gates. Post it as a `comment` on the change
([work-trackers.md](../../../agents/x-work-trackers.md)):

> Release merge Re-ping Rule — gate still open after 3 calendar days:
>
> - state: <state>
> - owner: <owner>
> - next_action: <next-action>

| Block reason | `<state>` | `<owner>` | `<next-action>` |
| --- | --- | --- | --- |
| Untrusted Author | author `<login>` not in the top 7 contributors | a trusted top-7 contributor | review and merge, or close the PR |
| Unsupported PR Type | PR type `<type>` unsupported | a trusted human | re-title to a supported `type(scope): subject`, or close |
| CI Failing | checks `<failing-checks>` still red | the PR author | push a fix; the next sweep re-checks |
| Substantive Conflict | conflicts in `<files>`; not mergeable | the PR author | rebase on `main` and resolve the files |
| Awaiting Approval Signal | row still not `<phase>\tapproved` | a trusted human | apply the `<phase>:approved` label / APPROVED review / approval comment; `kata-dispatch` propagates it |
| Awaiting trusted-contributor reply | concern from `<contributor>` still open | `<contributor>` | accept the response or post an override signal |

## Merge Comment

`comment` then `merge-change`
([work-trackers.md](../../../agents/x-work-trackers.md)):

> Release merge: all gates pass — type `<type>`, CI green, author trusted,
> STATUS row `<phase>\tapproved`. Merging.

After merging, `read` the change's state. If still `OPEN`, note in the summary
rather than reporting as merged.

## Report Summary

```text
| PR     | Title                          | Type | Author | CI    | STATUS         | Action  | Reason                          |
| ------ | ------------------------------ | ---- | ------ | ----- | -------------- | ------- | ------------------------------- |
| #fix-a | fix(parser): schema validation | fix  | alice  | green | n/a            | merged  | All gates pass                  |
| #spec-b| spec(security): SSRF hardening | spec | bob    | green | spec draft     | blocked | STATUS row not at spec approved |
| #feat-c| feat(export): export feature   | feat | carol  | red   | plan approved  | blocked | CI failing: format check        |
| #fix-d | fix(ui): color contrast        | fix  | eve    | green | n/a            | blocked | Author not in top contributors  |
| #dsgn-e| design(map): ingest pipeline   | design| dan   | green | design draft   | re-pinged | Awaiting approval signal; silent >3 days |
```

`Action` is `merged`, `blocked`, or `re-pinged`. A PR the Re-ping Rule
(SKILL.md Step 10, item 4) commented on this run reports `re-pinged` — one row
per re-pinged PR — distinct from `blocked`. A blocked PR still inside its 3-day
silence window stays `blocked`.

**Flag PRs blocked across 3+ consecutive runs** prominently above the table —
these may need human escalation.
