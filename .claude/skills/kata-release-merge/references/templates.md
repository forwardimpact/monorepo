# Release Merge Templates

Comment templates and report formats for the merge gate.

Each template is a `comment` on a change or issue
([work-trackers.md](../../../agents/x-work-trackers.md)). Fill the body
shown and post it.

## Skip Comments

### Untrusted Author

> Release merge: skipped. Author `<login>` is not in the trusted set (trust
> source: `<trustSource>`).
> This PR requires human review.

### Unsupported PR Type

> Release merge: skipped. PR type `<type>` requires human review.

### Awaiting Approval Signal

> Release merge: blocked. The `wiki/STATUS.md` row for the spec does not yet
> show `<phase>\tapproved`. Apply the `<phase>:approved` label, submit an
> APPROVED review, or post an approval comment from a trusted account.
> `kata-dispatch` will propagate it into STATUS.

### CI Failing

Comment with the specific checks that failed, from the change's CI `read`.

### Substantive Conflict

> Release merge: blocked. Substantive conflicts in <files>. This needs author
> judgment. The gate aborted the rebase.

## Announcement Cross-Link

`comment` on the **coordinating issue** (not the change) when Step 8 finds no
comment that names the PR
([work-trackers.md](../../../agents/x-work-trackers.md)). Adapt the
verb to the PR's state at gate time:

> Release merge (announcement backstop): PR #<pr-number>, `<title>`, is in
> flight for this issue and reached the merge gate. The gate posted this
> cross-link because no prior comment here named the PR. The gate recorded an
> adherence miss per coordination-protocol.md fix-in-flight markers.

## Re-ping Comments

The **Re-ping Rule** (SKILL.md Step 10, item 4) posts these when a blocked PR's
silence window expires. Post the one template below. Fill `<state>`, `<owner>`,
and `<next-action>` from the row that matches the PR's block reason, already
computed in this run's Steps 2–8. The Re-ping Rule does not re-run the gates.
Post it as a `comment` on the change
([work-trackers.md](../../../agents/x-work-trackers.md)):

> Release merge Re-ping Rule — gate still open after 3 calendar days:
>
> - state: <state>
> - owner: <owner>
> - next_action: <next-action>

| Block reason | `<state>` | `<owner>` | `<next-action>` |
| --- | --- | --- | --- |
| Untrusted Author | author `<login>` not in the trusted set (trust source: `<trustSource>`) | a trusted contributor per the configured trust source | review and merge, or close the PR |
| Unsupported PR Type | PR type `<type>` unsupported | a trusted human | re-title to a supported `type(scope): subject`, or close |
| CI Failing | checks `<failing-checks>` still red | the PR author | push a fix. The next sweep re-checks |
| Substantive Conflict | conflicts in `<files>`, so it is not mergeable | the PR author | rebase on `main` and resolve the files |
| Awaiting Approval Signal | row still not `<phase>\tapproved` | a trusted human | apply the `<phase>:approved` label / APPROVED review / approval comment. `kata-dispatch` propagates it |
| Awaiting trusted-contributor reply | concern from `<contributor>` still open | `<contributor>` | accept the response or post an override signal |

## Merge Comment

Post the `comment`, then run `merge-change`
([work-trackers.md](../../../agents/x-work-trackers.md)):

> Release merge: all gates pass. Type `<type>`, CI green, author trusted,
> STATUS row `<phase>\tapproved`. The gate merges this PR now.

After the merge, `read` the change's state. If it is still `OPEN`, note that in
the summary. Do not report it as merged.

## Report Summary

```text
| PR     | Title                          | Type | Author | CI    | STATUS         | Action  | Reason                          |
| ------ | ------------------------------ | ---- | ------ | ----- | -------------- | ------- | ------------------------------- |
| #fix-a | fix(parser): schema validation | fix  | alice  | green | n/a            | merged  | All gates pass                  |
| #spec-b| spec(security): SSRF hardening | spec | bob    | green | spec draft     | blocked | STATUS row not at spec approved |
| #feat-c| feat(export): export feature   | feat | carol  | red   | plan approved  | blocked | CI failing: format check        |
| #fix-d | fix(ui): color contrast        | fix  | eve    | green | n/a            | blocked | Author not in trusted set       |
| #dsgn-e| design(map): ingest pipeline   | design| dan   | green | design draft   | re-pinged | Awaiting approval signal; silent >3 days |
```

`Action` is `merged`, `blocked`, or `re-pinged`. A PR the Re-ping Rule
(SKILL.md Step 10, item 4) commented on this run reports `re-pinged`, with one
row per re-pinged PR. That value is distinct from `blocked`. A blocked PR still
inside its 3-day silence window stays `blocked`.

**Flag PRs blocked across 3+ consecutive runs** prominently above the table.
These may need human escalation.
