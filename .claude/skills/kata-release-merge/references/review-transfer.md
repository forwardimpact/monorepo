# Review Transfer

A fail-closed standard for carrying an approval signal to a moved phase-PR
head. When a PR head moves after an approval signal, that signal transfers to
the new head only when all four points below hold. Any unmet point voids the
transfer for that signal. Fail-closed means absence of evidence blocks; the
gate never infers validity.

The standard governs head moves. A PR whose head has not moved since its
approving signal is covered by that signal directly and needs no transfer
record, even when the signal predates this standard and so carries no recorded
pin. The coverage check applies once a head moves.

## Applicability

The standard governs approval signals that certify a PR's own content. That is
`spec`, `design`, and `plan` **phase PRs**. Implementation PRs gate on the
parent plan's approval (Step 9 of [`SKILL.md`](../SKILL.md)), which certifies
the plan PR's content rather than the implementation head. Implementation PRs
stay outside this standard.

## The four points

### 1. Approval pinned to a head SHA

An approval signal certifies the specific head it was given on. It never
certifies a bare phase. The pin source per signal class is defined in
[`approval-signals.md`](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/approval-signals.md)
§ Signal invalidation. A signal whose pin cannot be established transfers to no
other head. It is valid only on a head where the signal is freshly
re-confirmed.

### 2. Content identity of the PR's touched paths vs the pinned head

Compute each head's touched-path set from that head's diff against its own
base. The set at the current head must equal the set at the pinned head. A new,
deleted, or renamed path is a set change and fails the check. Every touched
path must also be identical at the object level: the content blob and the file
mode must match the pinned head.

Patch-id equivalence is never sufficient. `git patch-id` ignores whitespace,
and whitespace is semantic in the markdown and YAML this repo gates. Patch-id
also certifies a commit pair rather than a head state. A rebase onto a main
that itself changed the same paths legitimately fails this check, because
overlapping changes get fresh review by design.

### 3. Structural integrity at every head in the chain

At every head between the pinned head and the current one, the PR carries the
same commit count against its base. That base is the parent commit beneath the
PR's oldest commit, and it must itself be an ancestor of main. The count closes
the smuggled-commit gap: no commits were added alongside. The ancestry closes
the foreign-base gap: no foreign history sits beneath the PR. Together they
certify the PR is exactly its N commits sitting directly atop genuine main
history.

Establish the chain from the contemporaneous transfer records on the PR, not
from git reachability. Force-pushed intermediate heads may be unreachable
later.

### 4. Human-originated signals never silently transfer

A content-identical head move, where points 2 and 3 hold, permits a recorded
mechanical re-verification of a human signal. Record it on the PR.

Any non-identical delta voids the transfer and requires fresh human
re-approval. This includes the gate's own sanctioned mechanical fixes
(formatting, lockfile, codegen) when they change PR content. The human approved
specific content, and the gate never substitutes its own judgment for what
changed.

Agent-originated plan approvals may auto-transfer under the same points 1 to 3
check, also recorded. A voided agent signal requires fresh agent re-approval
per the trust rule. Plans are approvable by `staff-engineer`, so a voided plan
signal routes there, not to human escalation.

## Transfer record

Record every transfer as a PR comment. Name the pinned SHA, the new head SHA,
and the per-point evidence. The record carries this shape so any later audit
can recompute the claim from the comment alone. A void notice is the same
comment in the negative: it names the now-void signal, whether it is human- or
agent-originated, and the re-approval awaited. The gate may hold a
delta-producing rebase until re-approval is in hand rather than void eagerly.

## Patch-id prohibition

Patch-id equivalence alone never establishes a transfer. It is whitespace-blind
and certifies commit pairs rather than head states. Content identity is
established by point 2 only.
