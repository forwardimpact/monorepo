---
name: gemba-product-merge
description: >
  Merge pull requests that have been marked mergeable by the `gemba-product-classify`
  skill. Posts the merge comment, performs the merge, verifies the new state,
  and updates the run report.
phase: Do
---

# Product PR Merge

Merge each PR that the [`gemba-product-classify`](../gemba-product-classify/SKILL.md)
skill marked **mergeable** in its classification report. This is the Do
half of the product backlog workflow — `gemba-product-classify` decides which PRs
qualify, this skill performs the action.

## When to Use

- Immediately after `gemba-product-classify` produces a report with at least
  one mergeable PR
- On-demand when a specific pre-classified PR is ready to merge

This skill **must not** classify PRs itself. If you find a PR that has
not been classified, return to `gemba-product-classify` first. The phase
boundary exists so that trust verification cannot be skipped.

## Prerequisites

- A current classification report from `gemba-product-classify` listing which
  PRs are mergeable
- The `gh` CLI installed and authenticated
- Comment templates in `../gemba-product-classify/references/templates.md`

## Process

### Step 1: Read the Classification Report

The classification report comes from the most recent `gemba-product-classify`
run (in this same agent session, or recorded in this week's memory log).
Process only PRs marked **mergeable**.

### Step 2: Merge Each Mergeable PR

For each mergeable PR:

1. Post the merge comment from the templates file (§ Merge Comment).
2. Perform the merge:
   ```sh
   gh pr merge <number> --merge --delete-branch
   ```
3. Verify the new state:
   ```sh
   gh pr view <number> --json state --jq '.state'
   ```
   Confirm the state is `MERGED`.
4. If the merge fails (race condition, branch protection update, etc.),
   record the failure in the run report and move on — do **not** retry
   without re-classifying, since the gate state may have changed.

### Step 3: Produce the Merge Report

For each PR processed, record: number, title, merge result (`MERGED`,
`FAILED`, or reason for skip).

## Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **PRs merged this run** — number, title, and final state
- **Merge failures** — number and the reason (so the next run can revisit)
