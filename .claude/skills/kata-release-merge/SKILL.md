---
name: kata-release-merge
description: >
  Merge gate for open pull requests. Verify contributor trust, classify PR type,
  rebase on main, fix mechanical CI failures, gate on `wiki/STATUS.md` approval
  state, and merge the PRs that pass. Sole external merge point.
---

# Release Merge

Verify every open non-Dependabot PR against seven gates. The gates are trust,
type, CI, mechanical readiness, approval, open comments, and the classification
label. Merge every PR that passes. Trust is the most critical gate. Record each
PR's trust check.

## When to Use

- A scheduled run finds open PRs that wait for merge, or a specific PR needs an
  on-demand decision on mergeability
- Never for issues. `kata-product-issue` triages them

## Checklists

<do_confirm_checklist goal="Verify all gates pass before merging a PR">

- [ ] Author trusted: CI app identity, or the trusted set resolved from the
      configured trust source (`references/settings.md`).
- [ ] Settings read from the default branch, never from a PR head or a
      worktree that contains PR content.
- [ ] On unreadable trust configuration, fail closed: block trust-gated
      merges with reason `settings unreadable`. Never widen back to the
      default ranking.
- [ ] A diff touching `.kata/`, or a watchdog surface where one exists,
      merges only on a trusted human's signal pinned to the approved head.
      No agent approval qualifies.
- [ ] PR type parsed from the title prefix, and the classification label
      (`product` / `internal`) present.
- [ ] All CI checks pass, after mechanical fixes if needed.
- [ ] The `wiki/STATUS.md` row shows the classified phase at `approved`, or
      `implemented` for the terminal plan row. For phase PRs, a signal of the
      required class covers the head per `references/review-transfer.md`.
- [ ] For implementation PRs, the parent spec's `plan-a.md` exists on `main`.
- [ ] No unresolved trusted-human concern in the PR thread. Self-heal the
      coordinating-issue link when it is missing.

</do_confirm_checklist>

Mark a PR that fails any gate as **blocked** and give the reason. A PR that
passes every gate merges in Step 11.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`. Then run `gemba-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
The digest's `owned_priorities`, `claims`, and `storyboard_items` seed this
Process. Extract PRs blocked in previous runs with consecutive-block counts.

### Step 1: List Open PRs

`list` open changes against `main`
([work-trackers.md](../../agents/x-work-trackers.md)). Read the number,
title, head branch, author, update time, mergeability, labels, and reviews.

Skip PRs authored by `app/dependabot`. `kata-security-update` handles them.

### Step 2: Verify Contributor Trust

`read` the change's author
([work-trackers.md](../../agents/x-work-trackers.md)). If the author is
`app/kata-agent-team`, the PR is **trusted by definition**. Otherwise,
resolve the trusted set from the configured trust source
([`references/settings.md`](references/settings.md)). Read the settings from
the default branch, never from a PR head:

```sh
git show origin/<default-branch>:.kata/settings.json
```

Under `top-contributors`, look up the top `trustContributorCount` human
contributors:

```sh
gh api repos/{owner}/{repo}/contributors \
  --jq '[.[] | select(.type == "User")] | .[0:<trustContributorCount>] | .[].login'
```

Under `allowlist`, the trusted set is exactly `trustAllowlist`. An empty list
trusts no human.

The PR author must appear in the trusted set. If the author does not appear,
mark the PR **blocked**. Run this resolution on every classified PR. On a parse
failure, or an out-of-vocabulary or out-of-range trust value, fail closed:
block every trust-gated merge with reason `settings unreadable`, owned by a
trusted human. Never fall back to the ranking.

### Step 3: Classify PR Type

Parse the title with `type(scope): subject`. Each type maps to a phase:

- `spec` → spec phase, gate STATUS row `{NNN}\tspec\tapproved`
- `design` → design phase, gate STATUS row `{NNN}\tdesign\tapproved`
- `plan` → plan phase, gate STATUS row `{NNN}\tplan\tapproved`
- `feat`, `fix`, `bug`, `refactor`, `chore` → implementation phase
- `docs` → docs fast-path (Step 6, capped to `.md`/`.mdx` files)
- `retention` → retention phase. It has no spec-id STATUS row. Step 6 gates it
  on a product-manager review
- `!` breaking variants retain the base type
- Any other type → mark **blocked**

### Step 4: Assess Merge State

`read` the change's mergeability and CI checks
([work-trackers.md](../../agents/x-work-trackers.md)).

Clean (mergeable, CI green, up-to-date) → continue to Step 6. Behind, stale, or
in conflict → rebase (Step 5). CI failing → fix (Step 5) or block. An
approved-and-pinned experiment PR never rebases. Skip to the Step 6 re-block
([`experiment-path.md`](references/experiment-path.md)). An
approved-and-pinned `retention` PR also never rebases. A head delta re-blocks
it, so the gate's own rebase never silently voids the product-manager
approval.

Mark a PR **blocked** when it pins a consumer to a not-yet-published producer.
Hold the block until that producer is released. See the repository's
CONTRIBUTING.md § Releasing for the producer-before-consumer order.

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

**Substantive conflicts** (overlaps in logic, renamed symbols,
deleted-vs-modified) — run `git rebase --abort` and comment the files in
conflict.

After the rebase, run auto-fix. Then run the check. If checks still fail, mark
the PR **blocked** and skip to Step 12. Use `update-change` to publish the
rebased branch
([work-trackers.md](../../agents/x-work-trackers.md)).

**Phase-PR review transfer.** Before you force-push a `spec`/`design`/`plan`
PR, check whether the current head carries an approval signal. If it does,
apply [`references/review-transfer.md`](references/review-transfer.md). Post
its transfer record on a content-identical move. Post its void notice on a
delta-producing move. This step's own mechanical fixes count as such a move.

### Step 6: Approval Gate

**Docs fast-path**: A `docs`-typed PR whose changed files are all `.md`/`.mdx`
passes on trust (Step 2) alone. Skip the STATUS check below.

Read `wiki/STATUS.md` for the PR's spec id. The pattern
`grep -P "^${spec_id}(/[a-z0-9-]+)?\t"` matches the master `NNNN` row and any
`NNNN/<unit>` sub-rows. Pass when the row shows the classified phase at
`approved`, or at `implemented` for the terminal plan row. The master row
reaches `plan implemented` only after every sub-row does. An absent, `draft`,
or `cancelled` row → **blocked** (`awaiting approval signal`). The order of the
STATUS and head timestamps is not coverage evidence. When commits land after
the last clean review round, fail closed. Mark the PR **blocked**
(`review coverage unverifiable at head`) until a scoped delta review or a
reviewed-SHA-plus-head record covers the gap. Labels and APPROVED reviews feed
STATUS through `kata-dispatch`. Do not consult them here. See
[`approval-signals.md`](../../agents/x-approval-signals.md).

**Experiment PRs** (no spec id, one experiment-labeled issue with a named
owner) take the experiment path instead of the spec-row read. That path has a
fail-closed discriminator, an `exp:{issue}` STATUS read, and a head-pin
re-block. See [`experiment-path.md`](references/experiment-path.md).

**Phase-PR head coverage.** For `spec`/`design`/`plan` PRs, a STATUS row at
`approved` is **necessary**. It is not enough on its own. Also verify, per
[`references/review-transfer.md`](references/review-transfer.md), that an
approval signal of the required class (spec→spec, design→design, plan→plan)
verifiably covers the current head. When no signal does, fail closed. Mark the
PR **blocked** and name the voided or unverifiable transfer in the reason. This
narrows the boundary above. The PR-side read is for pins and transfer records
only. STATUS stays the approval source.

**Retention PRs** (`retention`-typed, no spec id, and they span many
`specs/NNN/` directories) take a self-contained head-coverage rule instead of
the spec-row read. Pass only when a `product-manager` APPROVED review exists
**and its review commit SHA equals the current head**. Any later commit
re-blocks the PR until a fresh PM review covers the new head. Retention PRs sit
outside [`references/review-transfer.md`](references/review-transfer.md), whose
§ Applicability restricts it to spec/design/plan phase PRs. So the gate applies
this rule directly. See
[`approval-signals.md`](../../agents/x-approval-signals.md).

**Settings diffs.** A diff that touches `.kata/`, or, where the repository
runs an activity watchdog, that watchdog's surface (its workflow, its
composite action home, its CLI bin, and its guardrail library), is a
trust-policy change. It merges only on a trusted human's explicit signal on
that change, pinned to the approved head, per the existing approval-signal
classes ([`approval-signals.md`](../../agents/x-approval-signals.md)). No
agent-originated approval qualifies, whatever the PR's type or phase. The
watchdog is the team's brake, and no agent writes the latch it engages
([`killswitch.md`](../../agents/x-killswitch.md)).

### Step 7: Open Comment Gate

A trusted human contributor's most-recent PR comment (the Step 2 trusted set)
may be an unresolved concern. If no **later** comment from the same human
accepts it, mark the PR **blocked** (`awaiting trusted-contributor reply`).
See [`comment-gate.md`](references/comment-gate.md).

### Step 8: Coordinating Issue Announcement (self-heal)

If no comment on the PR's coordinating issue (`Fixes #N` and variants) names the
PR, post the cross-link and log the miss. This step is **self-heal, never
block**. Probe sibling PRs on the same issue with `--state all`, paired
with the issue-comment scan. Resolve duplicates before you merge any of them.
For the details, see
[`announcement-backstop.md`](references/announcement-backstop.md). When there is
no coordinating issue, skip this step.

### Step 9: Implementation PR Spec Check

For implementation PRs (`feat`/`fix`/`bug`/`refactor`/`chore`) that reference a
spec id (e.g. `feat(...): … (#NNN)` or "implements spec NNN"):

- Confirm `specs/NNN/plan-a.md` exists on `main`. If it is absent, mark the PR
  **blocked** with the reason `parent spec plan not on main`.
- Update `wiki/STATUS.md` before you merge. Set the spec's row to
  `{NNN}\tplan\timplemented`. Commit the wiki change. The Stop hook pushes it.

An **experiment PR** that passed Step 6 runs the diff-scope check here instead.
It does not advance the row
([`experiment-path.md`](references/experiment-path.md)). This step excludes a
`retention` PR naturally. The step fires only for the implementation types
above, so it never writes `plan implemented` for a retention PR. A PR that
references no spec skips this step.

### Step 10: Classification Label Gate

Read the PR's labels, fetched in Step 1. If neither `product` nor `internal` is
present, mark the PR **blocked** (`awaiting classification label`). This gate
has no fast-path exemption. A `.md`/`.mdx` PR skips the Step 6 approval gate.
It does not skip this gate. Docs PRs are completed work in the denominator, and
they must carry the label per
[work-definition.md § Product-aligned vs internal](../../agents/x-work-definition.md#product-aligned-vs-internal).
A `retention` PR carries `internal`. This gate applies to it like any other
class.

### Step 11: Merge Mergeable PRs

1. Post the merge comment from `references/templates.md` § Merge Comment.
2. Run `merge-change`
   ([work-trackers.md](../../agents/x-work-trackers.md)).
3. Verify the state is `MERGED`. On a race or a branch-protection failure,
   record it and move on. Do **not** retry until you re-run Steps 1–10.
4. **Re-ping Rule** — re-comment on any still-blocked PR past its 3-day silence
   window ([`reping-rule.md`](references/reping-rule.md)).

### Step 12: Produce the Classification Report

Per PR record: number, title, type, author, trust check, CI, approval source
(label / review / blocked), and verdict. The verdict is `merged`, `blocked`, or
`re-pinged`.

## Memory: What to Record

Append to the current week's log:

- **PR classification table** — type, author, trust, CI, STATUS row, verdict
  (`merged` / `blocked` / `re-pinged`), consecutive-block count
- **Contributor trust decisions** — one row per advanced PR
- **STATUS rows consumed and written** — gate reads, `plan implemented` writes
- **PRs merged this run** and **merge failures** with reasons
- **Announcement outcomes** — every run: the issue-fix PR count and the heals
  posted with the authoring agent's lane. Include zero-heal rows
  (duplicate-PR falsifier series)
- **Experiment-PR timestamps** — For each experiment PR you merge, record the
  PR-open, human-signal, merge, and, when present, verdict timestamps
  ([`experiment-path.md`](references/experiment-path.md)).
- **Metrics** — Append `prs_merged` and `approvals_recorded_per_run` rows per
  `references/metrics.md`, which includes the collection recipe. See KATA.md
  § Metrics for the recording-eligibility rule.

## Coordination Channels

Outputs, per
[coordination-protocol.md](../../agents/x-coordination-protocol.md): use a
**PR comment** for trust rationale, gate failures, and merge decisions. Use a
**PR thread escalation** for cross-agent requests addressed by name. For
ambiguous inbound comments, follow
[coordination-protocol.md § Inbound: unclear addressed comments](../../agents/x-coordination-protocol.md#inbound-unclear-addressed-comments).
Hold every PR comment to
[Citation integrity](../../agents/x-citation-integrity.md).
