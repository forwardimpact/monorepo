---
name: product-feedback
description: >
  Manage product feedback in both directions. Triage open GitHub issues for
  product alignment — implement trivial fixes or write specs. Create new GitHub
  issues from product feedback observed during user testing sessions.
---

# Product Feedback

Manage product feedback in both directions:

- **Inbound** — Triage open GitHub issues submitted by others: classify by type
  and scope, implement trivial fixes directly, or write specs for
  product-aligned improvements.
- **Outbound** — Assess feedback observed during user testing sessions (e.g.
  evaluation scenarios), classify it for product alignment, and create GitHub
  issues for feedback that serves the product vision.

## When to Use

- Reviewing and actioning open issues for product alignment
- Scheduled to process community feedback regularly
- On-demand when the issue backlog needs attention
- After supervising a user testing or evaluation session where the agent
  reported feedback about product experience (installation, documentation, CLI
  output, error messages, etc.)

## Prerequisites

The `gh` CLI must be installed and authenticated. Verify with `gh auth status`.

## Part 1: Triaging Open Issues

### Classification

Each issue is classified into one of three categories based on its content:

| Category            | Criteria                                                       | Action          |
| ------------------- | -------------------------------------------------------------- | --------------- |
| **Trivial fix/bug** | Clear bug report or small fix with obvious resolution          | Implement + PR  |
| **Product-aligned** | Feature request or improvement aligned with the product vision | Write spec + PR |
| **Out of scope**    | Not aligned with products, unclear, or already addressed       | Label + comment |

### Product vision alignment

Use CLAUDE.md and JTBD.md to determine whether an issue aligns with the product
vision. The six products and their questions:

| Product      | Question it answers                               |
| ------------ | ------------------------------------------------- |
| **Map**      | What does good engineering look like here?        |
| **Pathway**  | Where does my career path go from here?           |
| **Basecamp** | Am I prepared for what's ahead today?             |
| **Guide**    | How do I find my bearing?                         |
| **Landmark** | What milestones has my engineering reached?       |
| **Summit**   | Is this team supported to reach peak performance? |

An issue is product-aligned if it describes a need that one of these products
should address for its users (Leadership, Engineers, or Agents).

### Process

### Step 0: Read Memory for Issue History

Before listing issues, read all files in the memory directory. From previous
`product-manager-*.md` entries (this skill runs under the product-manager
agent), extract:

- Issues that were previously processed and their outcomes
- Recurring themes or requests that inform prioritization

Also check entries from other agents — the improvement coach may have noted
user-facing issues in traces, or the security engineer may have flagged
vulnerabilities reported as issues.

### Step 1: List Open Issues

```sh
gh issue list --state open --limit 50 \
  --json number,title,body,author,labels,createdAt,updatedAt \
  --jq '.[] | {number, title, author: .author.login, labels: [.labels[].name], created: .createdAt}'
```

Skip issues that already have a `triaged` or `wontfix` label — those have been
processed.

### Step 2: Read and Classify Each Issue

For each open issue, read the full details:

```sh
gh issue view <number> --json title,body,comments,labels,author
```

Classify the issue:

1. **Trivial fix/bug** — The issue describes a clear, reproducible bug or a
   small fix. The root cause is identifiable from the description, and the fix
   is mechanical (e.g., typo, broken link, incorrect validation, missing edge
   case). The change would touch a small number of files with an obvious
   resolution.

2. **Product-aligned** — The issue describes a feature request, enhancement, or
   improvement that serves one of the six products and its users. The issue has
   enough detail to understand the need, even if the solution requires design
   work.

3. **Out of scope** — The issue does not align with any product, is a duplicate,
   is unclear and lacks enough context to act on, or has already been addressed.

### Step 3: Handle Trivial Fixes/Bugs

For issues classified as trivial fixes or bugs:

1. Comment on the issue to acknowledge it and explain next steps:

```sh
gh issue comment <number> --body "Thanks for reporting this! I can see the problem — I'll put together a fix now.

— Product Manager 🌱"
```

2. Create a fix branch:

```sh
git checkout main
git pull origin main
git checkout -b fix/issue-<number>-<short-description>
```

3. Investigate and implement the fix. Read relevant code, make the change, and
   verify it works.

4. Run quality checks:

```sh
bun run check
```

5. Commit and push:

```sh
git add <changed-files>
git commit -m "fix(<scope>): <description>

Closes #<number>"
git push -u origin fix/issue-<number>-<short-description>
```

6. Create a PR:

```sh
gh pr create \
  --title "fix(<scope>): <description>" \
  --body "$(cat <<'EOF'
## Summary

<description of the fix>

Closes #<number>

## Test plan

- [ ] `bun run check` passes
- [ ] <specific verification>
EOF
)"
```

7. Label the issue as triaged:

```sh
gh issue edit <number> --add-label "triaged"
```

### Step 4: Handle Product-Aligned Issues

For issues classified as product-aligned, write a spec using the `spec` skill:

1. Comment on the issue to acknowledge it and explain next steps:

```sh
gh issue comment <number> --body "Thanks for this suggestion! This aligns with our product direction. I'm going to write up a spec so we can plan the implementation properly.

— Product Manager 🌱"
```

2. Determine the next available spec number:

```sh
ls specs/ | sort -n | tail -1
```

3. Create a spec branch:

```sh
git checkout main
git pull origin main
git checkout -b spec/issue-<number>-<short-description>
```

4. Write the spec following the `spec` skill process. The spec should:
   - Reference the original issue (`#<number>`)
   - Define the problem from the issue reporter's perspective
   - Scope the change to what the issue describes
   - Define verifiable success criteria

5. Update `specs/STATUS` with the new spec in `draft` status.

6. Run quality checks:

```sh
bun run check
```

7. Commit and push:

```sh
git add specs/<NNN>-<name>/spec.md specs/STATUS
git commit -m "spec(<scope>): <description>

Addresses #<number>"
git push -u origin spec/issue-<number>-<short-description>
```

8. Create a PR:

```sh
gh pr create \
  --title "spec(<scope>): <description>" \
  --body "$(cat <<'EOF'
## Summary

Spec for issue #<number>: <issue title>

<brief description of what the spec proposes>

Addresses #<number>

## Review

This spec needs review before implementation can begin. See the `spec`
skill for the review process.
EOF
)"
```

9. Label the issue as triaged:

```sh
gh issue edit <number> --add-label "triaged"
```

### Step 5: Handle Out-of-Scope Issues

For issues classified as out of scope:

```sh
gh issue comment <number> --body "Thanks for taking the time to open this! After reviewing it against our product direction, this falls outside our current scope. <brief explanation of why>.

Closing for now — feel free to reopen with additional context if you think this assessment is off.

— Product Manager 🌱"
gh issue edit <number> --add-label "wontfix"
gh issue close <number>
```

For duplicate issues, reference the original:

```sh
gh issue comment <number> --body "Thanks for reporting this! This is already tracked in #<original>, so I'll close this one as a duplicate.

— Product Manager 🌱"
gh issue close <number> --reason "not planned"
```

For unclear issues that need more information:

```sh
gh issue comment <number> --body "Thanks for opening this! I'd like to help, but I need a bit more context to act on it. Could you provide <specific questions>?

— Product Manager 🌱"
gh issue edit <number> --add-label "needs-info"
```

Do **not** close unclear issues — leave them open for the reporter to respond.

### Step 6: Report Summary

After processing all issues, produce a summary table:

```
| Issue | Title                           | Category       | Action         | Detail                     |
| ----- | ------------------------------- | -------------- | -------------- | -------------------------- |
| #12   | Schema validation crash on null | trivial fix    | PR #45         | Fix null check in validate |
| #8    | Support custom skill levels     | product-aligned| spec PR #46    | specs/220-custom-levels/   |
| #5    | Add dark mode                   | out of scope   | closed         | Not in product scope       |
| #3    | Unclear error message           | trivial fix    | PR #47         | Improve error text         |
| #1    | Integration with Jira           | out of scope   | needs-info     | Asked for use case detail  |
```

### Memory: what to record

Include these fields in addition to standard agent memory fields:

- **Issue triage table** — Each issue processed with category, action taken, and
  outcome (PR number, spec number, or close reason)
- **Recurring themes** — Feature requests or bug patterns that appear across
  multiple issues, noting frequency and product alignment
- **Specs created** — Spec numbers and their associated issues, for tracking
  through the spec lifecycle

## Part 2: Creating Issues from User Testing Feedback

When supervising a user testing or evaluation session, the agent being tested
will report feedback about their experience — installation friction, unclear
documentation, confusing CLI output, errors, missing features, etc. This
feedback is a valuable product signal. Assess it for product alignment and
create GitHub issues for feedback that serves the product vision.

### When This Applies

Use this process when you have observed or received product feedback from:

- Evaluation scenarios (e.g. `guide-setup`, `pathway-setup`)
- User testing sessions where an agent tried a product as a first-time user
- Any supervised session where the agent reported friction or suggestions

### Process

#### Step 1: Extract Feedback Items

Review the agent's output and identify distinct feedback items. Each item should
describe a single observation — don't merge unrelated feedback.

Examples of feedback items:

- "Installation instructions didn't mention needing Node 18+"
- "fit-guide crashed with 'Cannot read properties of undefined' when asking
  about skills"
- "The response about career progression was generic and didn't reference the
  framework"
- "No example prompts were shown after installation"

#### Step 2: Classify Each Item

Use the same product alignment criteria as inbound triage:

| Category            | Criteria                                                      | Action                 |
| ------------------- | ------------------------------------------------------------- | ---------------------- |
| **Bug**             | Something is broken — crashes, errors, incorrect output       | Create bug issue       |
| **Product-aligned** | Missing feature or improvement that serves the product vision | Create feature issue   |
| **Documentation**   | Instructions unclear, missing steps, or outdated content      | Create docs issue      |
| **Out of scope**    | Not actionable, environmental, or outside product control     | Skip — note in summary |

#### Step 3: Create GitHub Issues

For each product-aligned feedback item, create a GitHub issue:

```sh
gh issue create \
  --title "<type>(<product>): <concise description>" \
  --label "user-testing" \
  --body "$(cat <<'EOF'
## Context

Observed during user testing of the **<product>** product in the
`<scenario>` evaluation scenario.

## Feedback

<detailed description of the feedback item>

## Expected Behaviour

<what the user expected to happen>

## Actual Behaviour

<what actually happened>

— Product Manager 🌱
EOF
)"
```

Use the appropriate title prefix:

- `bug(<product>):` for broken behaviour
- `docs(<product>):` for documentation issues
- `feat(<product>):` for missing features or improvements

#### Step 4: Report Summary

Produce a summary table of all feedback items:

```
| # | Feedback                              | Category       | Action       | Issue |
|---|---------------------------------------|----------------|--------------|-------|
| 1 | Install docs missing Node version     | documentation  | issue #52    |  #52  |
| 2 | Crash on skill query                  | bug            | issue #53    |  #53  |
| 3 | Generic career progression response   | product-aligned| issue #54    |  #54  |
| 4 | Slow response in CI environment       | out of scope   | skipped      |  —    |
```

### Memory: what to record

Include these fields in addition to standard agent memory fields:

- **Feedback items table** — Each item with category, action taken, and issue
  number if created
- **Scenario tested** — Which evaluation scenario produced the feedback
- **Product quality patterns** — Recurring themes across testing sessions that
  suggest systemic issues
