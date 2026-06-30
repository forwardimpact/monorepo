# Product Feedback Templates

Comment, PR, and issue body templates for triage and feedback processing. Every
comment and PR body is signed `— Product Manager 🌱`.

## Issue Comments

`comment` on the issue with the text below, selecting the variant that matches
the triage decision
([work-trackers.md](../../../agents/x-work-trackers.md)). For `wontfix`
and duplicate outcomes, chain `label` and/or `close` after the comment.

| Outcome             | Body text                                                                                                                                 | Follow-up                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Mechanical fix**  | Thanks for reporting this! I can see the problem — I'll put together a fix now.                                                           | —                                           |
| **Product-aligned** | Thanks for this suggestion! This aligns with our product direction. I'm going to write up a spec so we can plan the implementation.       | —                                           |
| **Out of scope**    | Thanks for taking the time to open this! After reviewing it against our product direction, this falls outside our current scope. _<why>_. | `label` wontfix; `close`                    |
| **Duplicate**       | Thanks for reporting this! This is already tracked in #<original>, so I'll close this one as a duplicate.                                 | `close` (reason "not planned")              |
| **Needs info**      | Thanks for opening this! I'd like to help, but I need a bit more context: _<specific questions>_.                                         | `label` needs-info (do **not** close)       |

### Adding Feedback to Existing Issues

`comment` on the issue
([work-trackers.md](../../../agents/x-work-trackers.md)):

> Additional feedback observed during user testing of **<product>** in the
> `<scenario>` evaluation scenario:
>
> <description>
>
> — Product Manager 🌱

## Fix and Spec PRs

Both follow the same shape. Differences: branch prefix (`fix/` vs `spec/`),
commit type (`fix(<scope>)` vs `spec(<scope>)`), closing keyword (`Closes` vs
`Addresses`), and staged paths (code vs `specs/<NNN>-<name>/spec.md`).

### Branch and Commit

Implement the fix or write the spec on a `<fix|spec>/issue-<number>-…` branch,
run the repository's check and test commands, and commit with subject
`<fix|spec>(<scope>): <description>` and a `<Closes|Addresses> #<number>`
trailer.

### PR Body

`open-change` ([work-trackers.md](../../../agents/x-work-trackers.md))
titled `<fix|spec>(<scope>): <description>` with this body:

```markdown
## Summary

<description>

<Closes|Addresses> #<number>

## Test plan

- [ ] Repository check command passes
- [ ] <specific verification>
```

Spec PRs replace the Test plan with a Review section:

```markdown
## Review

Spec for issue #<number>. Needs review before implementation — see the
`kata-spec` skill for the review process.
```

## New Issues from User Testing

`create-issue` ([work-trackers.md](../../../agents/x-work-trackers.md))
titled `<bug|docs|feat>(<product>): <concise description>`, labeled
`user-testing`, with this body:

```markdown
## Context
Observed during user testing of **<product>** in the `<scenario>` scenario.

## Feedback
<detailed description>

## Expected vs Actual
Expected: <what the user expected>
Actual: <what happened>

— Product Manager 🌱
```

## Report Summary Tables

Inbound triage (existing issues classified):

```text
| Issue   | Title                           | Category        | Action       | Detail                     |
| ------- | ------------------------------- | --------------- | ------------ | -------------------------- |
| #bug-a  | Schema validation crash on null | mechanical fix  | PR #fix-a    | Fix null check in validate |
| #feat-b | Support custom skill levels     | product-aligned | spec PR #spec-b | Spec lives at specs/<slug>/ |
| #out-c  | Add dark mode                   | out of scope    | closed       | Not in product scope       |
```

Outbound feedback (from user testing):

```text
| Item  | Feedback                          | Category      | Action               | Issue   |
| ----- | --------------------------------- | ------------- | -------------------- | ------- |
| Obs-a | Install docs missing Node version | documentation | commented on #docs-a | #docs-a |
| Obs-b | Crash on skill query              | bug           | issue #bug-b         | #bug-b  |
| Obs-c | Slow response in CI environment   | out of scope  | skipped              | —       |
```
