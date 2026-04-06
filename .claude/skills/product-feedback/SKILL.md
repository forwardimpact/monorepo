---
name: product-feedback
description: >
  Manage product feedback in both directions. Triage open GitHub issues for
  product alignment — implement trivial fixes or write specs. Create new GitHub
  issues from product feedback observed during user testing sessions.
---

# Product Feedback

Manage product feedback in both directions:

- **Inbound** — Triage open GitHub issues: classify by type and scope, implement
  trivial fixes directly, or write specs for product-aligned improvements.
- **Outbound** — Create GitHub issues from feedback observed during user testing
  sessions (e.g. evaluation scenarios).

## When to Use

- Reviewing and actioning open issues for product alignment
- Scheduled to process community feedback regularly
- After supervising a user testing or evaluation session where the agent
  reported friction, bugs, or suggestions

## Prerequisites

The `gh` CLI must be installed and authenticated. Verify with `gh auth status`.

All comment, PR, and issue templates are in `references/templates.md`.

## Part 1: Triaging Open Issues

### Classification

| Category            | Criteria                                              | Action          |
| ------------------- | ----------------------------------------------------- | --------------- |
| **Trivial fix/bug** | Clear bug or small fix with obvious resolution        | Implement + PR  |
| **Product-aligned** | Feature/improvement serving the product vision        | Write spec + PR |
| **Out of scope**    | Not aligned, unclear, duplicate, or already addressed | Label + comment |

### Product Vision Alignment

Use CLAUDE.md and JTBD.md to determine alignment. The six products:

| Product      | Question it answers                               |
| ------------ | ------------------------------------------------- |
| **Map**      | What does good engineering look like here?        |
| **Pathway**  | Where does my career path go from here?           |
| **Basecamp** | Am I prepared for what's ahead today?             |
| **Guide**    | How do I find my bearing?                         |
| **Landmark** | What milestones has my engineering reached?       |
| **Summit**   | Is this team supported to reach peak performance? |

An issue is product-aligned if it describes a need one of these products should
address for its users (Leadership, Engineers, or Agents).

### Process

#### Step 0: Read Memory

Read all files in the memory directory. From previous `product-manager-*.md`
entries, extract issues previously processed and recurring themes. Also check
entries from other agents (improvement coach, security engineer).

#### Step 1: List Open Issues

```sh
gh issue list --state open --limit 50 \
  --json number,title,body,author,labels,createdAt,updatedAt \
  --jq '.[] | {number, title, author: .author.login, labels: [.labels[].name], created: .createdAt}'
```

Skip issues with `triaged` or `wontfix` labels.

#### Step 2: Read and Classify Each Issue

```sh
gh issue view <number> --json title,body,comments,labels,author
```

Classify as **trivial fix/bug** (clear, reproducible, mechanical fix),
**product-aligned** (serves a product and its users), or **out of scope**
(unaligned, duplicate, unclear, already addressed).

#### Step 3: Handle Trivial Fixes

Implement the fix, run `bun run check` and `bun run test`, create a fix PR. See
`references/templates.md` § Fix PRs for branch, commit, and PR body templates.
Label the issue `triaged`.

#### Step 4: Handle Product-Aligned Issues

Write a spec using the `spec` skill, referencing the original issue. See
`references/templates.md` § Spec PRs for templates. Update `specs/STATUS`. Label
the issue `triaged`.

#### Step 5: Handle Out-of-Scope Issues

Comment with explanation, label, and close. For duplicates, reference the
original. For unclear issues, add `needs-info` label but leave open. See
`references/templates.md` § Issue Comments for templates.

#### Step 6: Report Summary

Produce a summary table of all issues processed. See `references/templates.md` §
Report Summary Tables for the format.

### Memory: What to Record

- **Issue triage table** — Each issue with category, action, and outcome
- **Recurring themes** — Patterns across issues, with frequency and alignment
- **Specs created** — Spec numbers and associated issue numbers

## Part 2: Creating Issues from User Testing Feedback

When a user testing or evaluation session produces feedback (installation
friction, unclear docs, CLI errors, missing features), assess it for product
alignment and create GitHub issues for actionable items.

### When This Applies

- Evaluation scenarios (e.g. `guide-setup`, `pathway-setup`)
- User testing sessions where an agent tried a product as a first-time user
- Any supervised session where the agent reported friction or suggestions

### Process

#### Step 1: Extract Feedback Items

Review the agent's output and identify distinct feedback items. Each item
describes a single observation — don't merge unrelated feedback.

#### Step 2: Classify Each Item

| Category            | Criteria                                         | Action                |
| ------------------- | ------------------------------------------------ | --------------------- |
| **Bug**             | Crashes, errors, incorrect output                | Create bug issue      |
| **Product-aligned** | Missing feature serving the product vision       | Create feature issue  |
| **Documentation**   | Instructions unclear, missing steps, or outdated | Create docs issue     |
| **Out of scope**    | Not actionable or outside product control        | Skip — note in report |

#### Step 3: Check for Existing Issues

Search open issues. If similar feedback already exists, add a comment with the
new context instead of creating a duplicate. See `references/templates.md` §
Adding Feedback to Existing Issues.

#### Step 4: Create Issues

For each product-aligned item with no existing match, create a GitHub issue. See
`references/templates.md` § New Issues from User Testing for the template.

#### Step 5: Report Summary

Produce a summary table. See `references/templates.md` § Report Summary Tables.

### Memory: What to Record

- **Feedback items table** — Each item with category, action, and issue number
- **Scenario tested** — Which evaluation scenario produced the feedback
- **Product quality patterns** — Recurring themes suggesting systemic issues
