---
name: kata-release-merge
description: >
  Merge gate for open pull requests. Verify contributor trust, classify PR type,
  rebase on main, fix mechanical CI failures, gate on `wiki/STATUS.md` approval
  state, and merge passing PRs. Sole external merge point.
---

# Release Merge

Verify every open non-Dependabot PR against seven gates — trust, type, CI,
mechanical readiness, approval, open comments, classification label — and merge
those that pass. Trust is the most critical — record each PR's trust check.

## When to Use

- A scheduled run finds open PRs awaiting merge, or a specific PR needs an
  on-demand mergeability decision
- Never for issues — issue triage is `kata-product-issue`

## Checklists

<do_confirm_checklist goal="Verify all gates pass before merging a PR">

- [ ] Author is trusted — CI app identity or top-7 contributor lookup ran.
- [ ] PR type parsed from title prefix.
- [ ] All CI checks pass (after mechanical fixes if needed).
- [ ] `wiki/STATUS.md` row for the spec id shows the matching phase at
      `approved` (or `implemented` for the terminal plan row).
- [ ] For phase PRs (spec/design/plan): an approving signal of the required
      class verifiably covers the current head, per
      `references/review-transfer.md`.
- [ ] For implementation PRs: parent spec's `plan-a.md` exists on `main`.
- [ ] No unresolved trusted-human concern in the PR comment thread.
- [ ] Classification label (`product` / `internal`) is present on the PR.
- [ ] Coordinating issue (if any) names the PR — self-healed when missing.

</do_confirm_checklist>

A PR that fails any gate is **blocked** with reason; passing PRs merge in Step
11.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`, then run `gemba-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
The digest's `owned_priorities`, `claims`, and `storyboard_items` seed this
Process.
Extract PRs blocked in previous runs with consecutive-block counts.

### Step 1: List Open PRs

`list` open changes against `main`
([work-trackers.md](../../agents/x-work-trackers.md)), reading number,
title, head branch, author, update time, mergeability, labels, and reviews.

Skip PRs authored by `app/dependabot` — handled by `kata-security-update`.

### Step 2: Verify Contributor Trust

`read` the change's author
([work-trackers.md](../../agents/x-work-trackers.md)). If
`app/kata-agent-team`, the PR is **trusted by definition**. Otherwise, look up
the top 7 human contributors:

```sh
gh api repos/{owner}/{repo}/contributors \
  --jq '[.[] | select(.type == "User")] | .[0:7] | .[].login'
```

The PR author must appear, or mark **blocked**; run this lookup on every
classified PR.

### Step 3: Classify PR Type

Parse the title using `type(scope): subject`. Each type maps to a phase:

- `spec` → spec phase, gate STATUS row `{NNN}\tspec\tapproved`
- `design` → design phase, gate STATUS row `{NNN}\tdesign\tapproved`
- `plan` → plan phase, gate STATUS row `{NNN}\tplan\tapproved`
- `feat`, `fix`, `bug`, `refactor`, `chore` → implementation phase
- `docs` → docs fast-path (Step 6, capped to `.md`/`.mdx` files)
- `retention` → retention phase (no spec-id STATUS row; gated on a
  product-manager review in Step 6)
- `!` breaking variants retain the base type
- Any other type → mark **blocked**

### Step 4: Assess Merge State

`read` the change's mergeability and CI checks
([work-trackers.md](../../agents/x-work-trackers.md)).

Clean (mergeable, CI green, up-to-date) → continue to Step 6. Behind, stale, or
conflicting → rebase (Step 5). CI failing → fix (Step 5) or block. An
approved-and-pinned experiment PR never rebases — skip to Step 6 re-block
([`experiment-path.md`](references/experiment-path.md)). Likewise an
approved-and-pinned `retention` PR never rebases — a head delta re-blocks rather
than the gate's own rebase silently voiding the product-manager approval.

A PR that pins a consumer to a not-yet-published producer is **blocked** until
that producer is released. See the repository's CONTRIBUTING.md § Releasing for
producer-before-consumer ordering.

### Step 5: Rebase + Mechanical Fixes

```sh
git fetch origin main && git fetch origin <pr-branch>
git checkout <pr-branch> && git rebase origin/main
```

**Mechanical conflicts only** (lock file, generated files, formatting):

```sh
# Lock file: take theirs, re-run install. Generated: re-run codegen. Formatting: run the formatter.
git add <files> && git rebase --continue
```

**Substantive conflicts** (overlapping logic, renamed symbols,
deleted-vs-modified) — `git rebase --abort` and comment the conflicting files.

After rebase, run auto-fix then check; if checks still fail, mark **blocked**
and skip to Step 12. `update-change` to publish the rebased branch
([work-trackers.md](../../agents/x-work-trackers.md)).

**Phase-PR review transfer.** Before force-pushing a `spec`/`design`/`plan` PR,
if the current head carries an approval signal, apply
[`references/review-transfer.md`](references/review-transfer.md): post its
transfer record on a content-identical move, or its void notice on a
delta-producing move — this step's own mechanical fixes included.

### Step 6: Approval Gate

**Docs fast-path**: A `docs`-typed PR whose changed files are all `.md`/`.mdx`
passes on trust (Step 2) alone — skip the STATUS check below.

Read `wiki/STATUS.md` for the PR's spec id —
`grep -P "^${spec_id}(/[a-z0-9-]+)?\t"` matches the master `NNNN` row and any
`NNNN/<unit>` sub-rows. Pass when the row shows the classified phase at
`approved` (`implemented` for the terminal plan row); the master row reaches
`plan implemented` only once every sub-row does. Absent or `draft`/`cancelled` →
**blocked** (`awaiting approval signal`). STATUS-vs-head timestamp ordering is
not coverage evidence: when commits land after the last clean review round, fail
closed — **blocked** (`review coverage unverifiable at head`) — until a scoped
delta review or a reviewed-SHA-plus-head record covers the gap. Labels and
APPROVED reviews feed STATUS via `kata-dispatch`; not consulted here. See
[`approval-signals.md`](../../agents/x-approval-signals.md).

**Experiment PRs** (no spec id, one experiment-labeled issue with a named owner)
take the experiment path instead of the spec-row read — fail-closed
discriminator, `exp:{issue}` STATUS read, head-pin re-block:
[`experiment-path.md`](references/experiment-path.md).

**Phase-PR head coverage.** For `spec`/`design`/`plan` PRs, a STATUS row at
`approved` is **necessary but not sufficient**: additionally verify, per
[`references/review-transfer.md`](references/review-transfer.md), that an
approving signal of the required class (spec→spec, design→design, plan→plan)
verifiably covers the current head; when none does, fail closed — **blocked**,
reason naming the voided or unverifiable transfer. This narrows the boundary
above: the PR-side read is for pins and transfer records only; STATUS stays the
approval source.

**Retention PRs** (`retention`-typed, no spec id, spanning many `specs/NNN/`
directories) take a self-contained head-coverage rule instead of the spec-row
read: pass only when a `product-manager` approving review exists
**and its review commit SHA equals the current head**. Any later commit
re-blocks until a fresh PM review covers the new head. Retention PRs sit outside
[`references/review-transfer.md`](references/review-transfer.md) (§
Applicability restricts it to spec/design/plan phase PRs), so the gate applies
this rule directly. See
[`approval-signals.md`](../../agents/x-approval-signals.md).

### Step 7: Open Comment Gate

If a top-7 contributor's most-recent PR comment is an unresolved concern not
accepted by a **later** same-human comment, mark **blocked**
(`awaiting trusted-contributor reply`); see
[`comment-gate.md`](references/comment-gate.md).

### Step 8: Coordinating Issue Announcement (self-heal)

If no comment on the PR's coordinating issue (`Fixes #N` and variants) names the
PR, post the cross-link and log the miss — **self-heal, never block**. Probe
sibling PRs on the same issue (`--state all`, paired with the issue-comment
scan) and resolve duplicates before merging any. Details:
[`announcement-backstop.md`](references/announcement-backstop.md); no
coordinating issue → skip.

### Step 9: Implementation PR Spec Check

For implementation PRs (`feat`/`fix`/`bug`/`refactor`/`chore`) referencing a
spec id (e.g. `feat(...): … (#NNN)` or "implements spec NNN"):

- Confirm `specs/NNN/plan-a.md` exists on `main`. If absent, mark **blocked**
  with reason `parent spec plan not on main`.
- Update `wiki/STATUS.md` before merging — set the spec's row to
  `{NNN}\tplan\timplemented`. Commit the wiki change; the Stop hook pushes it.

An **experiment PR** that passed Step 6 runs the diff-scope check here instead,
not advancing the row
([`experiment-path.md`](references/experiment-path.md)). A `retention` PR is
naturally excluded — this step fires only for the implementation types above, so
no `plan implemented` write occurs for it. PRs not referencing a spec skip this
step.

### Step 10: Classification Label Gate

Read the PR's labels (fetched in Step 1). If neither `product` nor `internal` is
present, mark **blocked** (`awaiting classification label`). No fast-path
exemption: a `.md`/`.mdx` PR skips only the Step 6 approval gate, not this one —
docs PRs are completed work in the denominator and must carry the label per
[work-definition.md § Product-aligned vs internal](../../agents/x-work-definition.md#product-aligned-vs-internal).
A `retention` PR carries `internal` and is gated here like any other class.

### Step 11: Merge Mergeable PRs

1. Post the merge comment from `references/templates.md` § Merge Comment.
2. `merge-change`
   ([work-trackers.md](../../agents/x-work-trackers.md)).
3. Verify state is `MERGED`. On race or branch-protection failure, record and
   move on — do **not** retry without re-running Steps 1–10.
4. **Re-ping Rule** — re-comment on any still-blocked PR past its 3-day silence
   window ([`reping-rule.md`](references/reping-rule.md)).

### Step 12: Produce the Classification Report

Per PR record: number, title, type, author, trust check, CI, approval source
(label / review / blocked), verdict — `merged`, `blocked`, or `re-pinged`.

## Memory: What to Record

Append to the current week's log:

- **PR classification table** — type, author, trust, CI, STATUS row, verdict
  (`merged` / `blocked` / `re-pinged`), consecutive-block count
- **Contributor trust decisions** — one row per advanced PR
- **STATUS rows consumed and written** — gate reads, `plan implemented` writes
- **PRs merged this run** and **merge failures** with reasons
- **Announcement outcomes** — every run: issue-fix PR count + heals posted with
  authoring lane, zero-heal rows included (duplicate-PR falsifier series)
- **Experiment-PR timestamps** — Per experiment PR merged, record PR-open,
  human-signal, merge, and (when present) verdict timestamps
  ([`experiment-path.md`](references/experiment-path.md)).
- **Metrics** — Append `prs_merged` and `approvals_recorded_per_run` rows per
  `references/metrics.md` (collection recipe included). See KATA.md § Metrics
  for the recording-eligibility rule.

## Coordination Channels

Outputs (per
[coordination-protocol.md](../../agents/x-coordination-protocol.md)):
**PR comment** for trust rationale, gate failures, merge decisions;
**PR thread escalation** for cross-agent requests addressed by name. Ambiguous
inbound comments → follow
[coordination-protocol.md § Inbound: unclear addressed comments](../../agents/x-coordination-protocol.md#inbound-unclear-addressed-comments).
Hold every PR comment to
[Citation integrity](../../agents/x-citation-integrity.md).
