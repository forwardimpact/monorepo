# Plan 1790 — Fail-Closed Review Transfer Across Force-Pushes

Implements [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

Documentation-and-procedure change in `kata-release-merge` and the shared
`approval-signals.md`. Land the canonical standard first (`review-transfer.md`),
then wire the three skill invocation points (Step 5, Step 6, DO-CONFIRM) that
reference it, then amend `approval-signals.md` (invalidation section +
in-session pin). Steps are ordered so every cross-reference resolves to an
already-written target; all six edits are in one PR. No executable code, so
verification is `rg` for required phrases plus the existing markdown checks.

The blockquotes below give the required content and the phrases the `rg`
checks key on; they are shape, not verbatim text. Author the shipped prose to
CLAUDE.md § Writing Style — one idea per sentence, no em-dash asides — while
preserving the keyed phrases.

Libraries used: none.

## Step 1: Create the review-transfer reference

Intent: the canonical four-point standard the skill steps invoke.

Files: create `.claude/skills/kata-release-merge/references/review-transfer.md`.

Content (sections, each authored in prose/lists at reference altitude):

- **Heading + purpose** — fail-closed transfer of an approval signal to a moved
  phase-PR head; any unmet point voids the transfer; absence of evidence blocks.
- **Applicability** — governs spec/design/plan **phase PRs** (signals certifying
  the PR's own content); implementation PRs gate on the parent plan (Step 9) and
  are outside the standard.
- **The four points** — one subsection each:
  1. Approval pinned to a head SHA; pin source per signal class lives in
     `approval-signals.md`; no establishable pin → transfers to no other head.
  2. Content identity: touched-path-set equality (each head's diff vs its own
     base; new/deleted/renamed path = set change) **plus** per-path blob + file
     mode identity vs the pinned head. State patch-id is never sufficient
     (whitespace-blind, semantic in gated md/YAML; certifies commit pairs not
     heads). A rebase onto a main that changed the same paths legitimately
     fails.
  3. Structural integrity at every head in the chain: same commit count vs base,
     base is an ancestor of main; names the smuggled-commit (count) and
     foreign-base (ancestry) gaps. Chain established from contemporaneous
     transfer records on the PR, not git reachability.
  4. Human-originated signals never silently transfer: content-identical move
     permits *recorded* mechanical re-verification; any non-identical delta —
     **including the gate's own mechanical fixes** (format/lockfile/codegen) —
     voids and requires fresh human re-approval. Agent plan approvals may
     auto-transfer under points 1–3, also recorded; a voided agent signal needs
     fresh `staff-engineer` re-approval, not human escalation.
- **Transfer record shape** — a PR comment naming the pinned SHA, the new head,
  and per-point evidence (the shape the #1578 audit produced by hand).
- **Patch-id prohibition** — explicit one-liner: patch-id equivalence alone
  never establishes a transfer.

Cross-link `approval-signals.md` for pin sources; link back from there.

Verification:
`rg -n "patch-id|touched-path|ancestor of main|fresh human re-approval|phase PR" .claude/skills/kata-release-merge/references/review-transfer.md`
returns hits for all four points + applicability + prohibition.

## Step 2: Wire Step 5 (rebase) to produce transfer evidence

Intent: before force-pushing a phase-PR head that carries an approval signal,
Step 5 reads the signal and records the transfer (or void).

Files: modify `.claude/skills/kata-release-merge/SKILL.md` (§ Step 5, after the
push line at current line ~113).

Change: append a paragraph after the `git push --force-with-lease` line:

> **Phase-PR review transfer.** Before force-pushing a `spec`/`design`/`plan`
> PR, read whether the current head carries an approval signal (pin per
> [`approval-signals.md`](../../agents/references/approval-signals.md)). If it
> does, apply [`references/review-transfer.md`](references/review-transfer.md):
> on a content-identical move, post the transfer record (pinned SHA → new head,
> per-point evidence); on a delta-producing move — including this step's own
> mechanical fixes — post a void notice naming the now-void signal (human- or
> agent-originated) and the re-approval awaited. The gate may hold a
> delta-producing rebase until re-approval is in hand rather than void eagerly.

Verification:
`rg -n "review-transfer|transfer record|void notice" .claude/skills/kata-release-merge/SKILL.md`
shows the Step 5 addition.

## Step 3: Wire Step 6 (approval gate) to verify head coverage

Intent: STATUS `approved` becomes necessary but not sufficient on phase PRs.

Files: modify `.claude/skills/kata-release-merge/SKILL.md` (§ Step 6).

Change: append to Step 6, after the existing STATUS paragraph and before
Step 7:

> **Phase-PR head coverage.** For `spec`/`design`/`plan` PRs, a STATUS row at
> `approved` is **necessary but not sufficient**: additionally verify, per
> [`references/review-transfer.md`](references/review-transfer.md), that at
> least one approving signal of the phase's required class verifiably covers the
> current head — a pin match, or a recorded valid transfer chain. When none
> does, **blocked**, reason naming the voided or unverifiable transfer. This
> narrows the boundary above: STATUS stays the approval source; the PR-side read
> is for pins and transfer records only.

Verification:
`rg -n "necessary but not sufficient|covers the current head" .claude/skills/kata-release-merge/SKILL.md`
shows the Step 6 addition.

## Step 4: Add the DO-CONFIRM checklist item

Intent: the transfer gate is confirmed on every merged phase PR.

Files: modify `.claude/skills/kata-release-merge/SKILL.md` (DO-CONFIRM block,
lines 26–37).

Change: add one checklist item immediately after the STATUS item (the
`wiki/STATUS.md` row bullet ending at line 32, before the implementation-PR
item on line 33):

```text
- [ ] For phase PRs (spec/design/plan): an approving signal of the required
      class verifiably covers the current head (pin match or recorded transfer),
      per `references/review-transfer.md`.
```

Verification:
`rg -n "verifiably covers the current head" .claude/skills/kata-release-merge/SKILL.md`
shows it inside the `<do_confirm_checklist>` block.

## Step 5: Add the invalidation section to approval-signals.md

Intent: per signal class, define pin source, head-move consequence, transfer
permission, void condition, and re-approval routing.

Files: modify `.claude/agents/references/approval-signals.md` (new
`## Signal invalidation` section, inserted after § The signals / Trust rule,
before § In-session approval).

Change: a new section with a per-class table and the fail-closed rule:

| Signal class | Pin source | On head move |
|---|---|---|
| `<phase>:approved` label | head SHA at the label event | re-verify per review-transfer.md; human-originated → delta voids, fresh human re-approval |
| `gh pr review --approve` | the review's commit SHA | same as label (human-originated) |
| Approval comment | head SHA when the comment was posted | same as label (human-originated) |
| In-session user message | head SHA recorded with the STATUS write (§ In-session approval) | same as label (human-originated) |
| `kata-plan` panel-clean | head SHA on the PR-side panel record | agent-originated → delta voids, fresh `staff-engineer` re-approval |

Prose after the table:

- Fail-closed: a signal with **no establishable pin** transfers to no other
  head — valid only where freshly re-confirmed.
- Patch-id equivalence alone never establishes a transfer.
- A content-identical move (per review-transfer.md points 1–3) permits a
  *recorded* transfer; any non-identical delta voids.
- STATUS untouched: a voided transfer leaves the row as-is; re-approval is a
  fresh signal with a fresh pin, not a STATUS rewrite.
- The "Merged phase PR" and "Implementation merge" classes are inert: a closed
  PR has no head move.

Cross-link `kata-release-merge/references/review-transfer.md`.

Verification:
`rg -ni "Signal invalidation|no establishable pin|voided transfer leaves the row|patch-id" .claude/agents/references/approval-signals.md`
shows the section and its rules (`-i` because the prose capitalizes "Patch-id");
`git diff .claude/agents/references/approval-signals.md` shows the original
signals table (lines 11–19) and trust-rule text changed only by addition.

## Step 6: Amend § In-session approval for pin recording

Intent: the pin exists going forward.

Files: modify `.claude/agents/references/approval-signals.md` (§ In-session
approval, heading at line 33, body lines 35–40).

Change: add to the section that the active agent records the approved head SHA
alongside the STATUS write — as a PR comment when a PR exists, with the wiki
commit otherwise; an approval given before any push is pinned by the same agent
at first push. Note the same recording duty covers `kata-plan` panel-clean
approvals via their existing on-PR record.

Verification:
`rg -n "approved head SHA|at first push|with the wiki commit" .claude/agents/references/approval-signals.md`
shows the amendment.

## Final verification

- `rg` checks in Steps 1–6 all return their expected hits.
- The original `approval-signals.md` signals table (lines 11–19) and trust-rule
  text are unchanged except additions.
- Repository markdown/context checks pass (`bun run check` where available).

## Risks

- **Boundary text drift.** Step 6's existing boundary is specifically "Labels
  and APPROVED reviews feed STATUS via `kata-dispatch`; not consulted here." The
  Step 3 addition narrows it without deleting it — keep both, do not contradict:
  STATUS is still the approval source; the new PR-side read is pins/records
  only.
- **Context-window length limits.** `approval-signals.md` and the SKILL.md feed
  agent context; the new reference and sections must stay tight. If a repo
  context check (`Context/instructions`) flags length, trim prose, not the
  normative content.

## Execution

Single engineering agent (`staff-engineer`), sequential. Steps 2–4 all edit one
file (SKILL.md) and Steps 5–6 both edit `approval-signals.md`, so they are not
parallelizable across agents without conflict. Step 1 must land before Steps 2–3
reference it. No `technical-writer` split — the content is normative skill
procedure, not prose documentation.

— Staff Engineer 🛠️
