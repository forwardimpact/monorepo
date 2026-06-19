# Spec 1790 — Fail-Closed Review Transfer Across Force-Pushes in kata-release-merge

## Problem

`kata-release-merge` is the sole external merge point, yet its codified gate is
**head-blind**: approval lives phase-level in `wiki/STATUS.md` with no commit
anchor, and nothing in the skill or in
[`approval-signals.md`](../../.claude/agents/references/approval-signals.md)
says what happens to an approval signal when the PR head moves afterward. The
approval-signals table defines which signals count — not what invalidates them.

The gap surfaced during the PR #1578 provenance audit
([Issue #1602](https://github.com/forwardimpact/monorepo/issues/1602)). The
release engineer transferred an existing approval across a chain of
rebase-only force-pushes (`1baf0c74 → 8c540a2a → 9c024d19`,
[issuecomment-4676261466](https://github.com/forwardimpact/monorepo/pull/1578#issuecomment-4676261466))
by certifying content identity with `git patch-id --stable`. The security
engineer's independent verification (`wiki/security-engineer-2026-W24-part5.md`
§ Run 37) found the **instance sound but the mechanism structurally unsound** —
the verdict held only because the verifier independently checked properties
patch-id does not certify:

1. **Whitespace-blind.** `git patch-id` ignores whitespace, which is semantic
   in the markdown and YAML this repo gates.
2. **Certifies commit pairs, not head states.** Identical patch-ids on a
   commit pair cannot detect commits smuggled in alongside; commit count is
   checked only by reviewer diligence today.
3. **No human-approval re-confirmation standard.** A human signal pinned to
   one head must not be carried to a new head by silent, unrecorded machine
   inference — yet nothing forbids it.

Severity is **MEDIUM** (release-engineer + security-engineer convergent
analysis, [issuecomment-4676382100](https://github.com/forwardimpact/monorepo/issues/1602#issuecomment-4676382100)):
the gate is trust-gated, but a head-blind gate enables review-provenance
laundering by a malicious or compromised trusted actor at the one point every
external change must pass. The sound verification in #1578 was an individual's
extra rigor, not the system's design. The system should make the rigorous path
the easy path.

## Personas and Job

This serves **Teams Using Agents** — "run a continuously improving agent team"
([JTBD.md](../../JTBD.md)). The Plan-Do-Study-Act loop rests on the merge
gate's trustworthiness: humans approve specs and designs precisely once, and
agents carry that signal through **content-identical** rebases — while any
move that changes what the human approved deliberately comes back for fresh
human eyes. If the carry is inferential rather than verified, every downstream
artifact inherits the doubt. Engineering Leaders inherit the benefit — the
audit trail shows *why* a moved head was still covered by its approval — but
the direct hire is the agent team's own gate.

## Scope

Codify a **fail-closed four-point review-transfer standard**: when a PR head
moves after an approval signal, the transfer of that signal to the new head is
valid only when **all four** points below hold. Any unmet point voids the
transfer for that signal. Fail-closed means absence of evidence blocks; the
gate never infers validity.

**Applicability.** The standard governs approval signals that certify the
PR's own content — spec, design, and plan **phase PRs**. Implementation PRs
gate on the parent plan's approval, which certifies the *plan PR's* content,
not the implementation head; they remain governed by the existing
implementation gates and are outside the transfer standard.

### The four-point standard

**1. Approval pinned to a head SHA.** An approval signal certifies the
specific head it was given on — never a bare phase.

- The pin is established from the signal's own evidence; the invalidation
  section defines the pin source per signal class.
- A signal whose pin cannot be established transfers to **no** other head —
  it is valid only for a head on which the signal is freshly re-confirmed.

**2. Content identity of the PR's touched paths vs the pinned head.**

- The PR's touched-path set (each head's diff against its own base) is
  **equal** at the pinned and current heads — a new, deleted, or renamed path
  is a set change — and every touched path is identical at the object level:
  content blob and file mode.
- Patch-id is never sufficient: it is whitespace-blind, and whitespace is
  semantic in the markdown/YAML this repo gates.
- A rebase onto a main that itself changed the same paths legitimately fails
  this check — overlapping changes get fresh review by design.

**3. Structural integrity at every head in the chain.** At every head between
the pinned head and the current one:

- The PR carries the **same commit count vs its base**, and that base — the
  parent commit beneath the PR's oldest commit — **is itself on main's
  history** (an ancestor of main). Together these certify the PR is exactly
  its N commits sitting directly atop genuine main history: no commits
  smuggled in alongside (count), no foreign base beneath (ancestry).
- The chain is established from the **contemporaneous transfer records** on
  the PR, not from git reachability — force-pushed intermediate heads may be
  unreachable later.

**4. Human-originated signals never silently transfer.**

- A content-identical head move (points 2–3 hold) permits *recorded*
  mechanical re-verification of a human signal — the record is posted on the
  PR, naming the pinned SHA, the new head, and the per-point evidence.
- Any non-identical delta **voids the transfer** and requires fresh human
  re-approval — **including the gate's own sanctioned mechanical fixes**
  (formatting, lockfile, codegen) when they change PR content: the human
  approved specific content, and the gate never substitutes its own judgment
  for what changed.
- Agent-originated plan approvals may auto-transfer under the same points 1–3
  check, also recorded; a **voided agent signal** requires fresh agent
  re-approval per the trust rule (plans are approvable by `staff-engineer`),
  not human escalation.

### Accepted trade-offs

- **Re-approval churn.** On a fast-moving main, an approved phase PR that
  needs a mechanical fix loops fix → void → fresh human approval. Accepted:
  phase PRs are bounded documents whose conflicts are rare and whose
  re-review is cheap, and the alternative — the gate deciding which deltas a
  human "would still approve" — is the laundering vector this spec closes.
  The gate may hold a delta-producing rebase until re-approval is in hand
  rather than voiding eagerly.
- **Auditability, not tamper-proofness.** Transfer records are authored by
  the same trusted-actor class the threat model names. The standard converts
  silent inference into recorded, falsifiable claims that any later audit can
  recompute — it makes laundering detectable, not impossible. Independent
  enforcement is the excluded automation candidate below.

### In scope

| Component | What changes |
|---|---|
| Review-transfer reference | A new `kata-release-merge` reference (`references/review-transfer.md`, per the agreed remedy on #1602) defines the four-point standard, its phase-PR applicability, the fail-closed rule, the human/agent signal distinction, and the recording requirement. |
| Step 5 (rebase + mechanical fixes) | The skill's rebase step invokes the standard: before force-pushing a phase PR, the release engineer checks whether the current head carries an approval signal (a signal read Step 5 does not perform today); when it does, it performs and records the transfer check — or, for a delta-producing move, records that the signal (human- or agent-originated) is now void and what re-approval is awaited. The gate actor who moves the head owes the evidence; other actors' unrecorded moves are simply void at Step 6, and the invalidation section — a shared agent reference — is the surface that teaches every agent the recording duty. |
| Step 6 (approval gate) | The skill's approval gate invokes the standard for phase PRs: a STATUS row at `approved` becomes **necessary but not sufficient** — the gate additionally verifies that at least one approving signal of the phase's required class verifiably covers the current head (pin match, or a recorded valid transfer chain); when none does, **blocked**, with a reason naming the voided or unverifiable transfer. This narrows Step 6's existing "PR-side signals not consulted here" boundary: STATUS remains the approval source; the PR-side read is for pins and transfer records only. |
| DO-CONFIRM checklist | The skill's checklist gains a head-move/transfer item, so the gate is confirmed on every merged phase PR rather than when remembered. |
| Signal invalidation | `approval-signals.md` gains an **invalidation section**: per signal class, where the pin comes from, what a head move does to the signal, when transfer is permitted, what voids it, and what re-approval a voided signal needs (human for human-originated, agent for agent-originated). The table keeps defining which signals count; the new section defines what un-counts them. STATUS schema and semantics are untouched: a voided transfer leaves the row as-is, and re-approval is a fresh signal with a fresh pin, not a STATUS rewrite. |
| In-session pin recording | `approval-signals.md` § In-session approval is amended so the pin exists going forward: the active agent records the approved head SHA alongside the STATUS write (as a PR comment when a PR exists; with the wiki commit otherwise), and an approval given before any push is pinned by that same agent at first push. The same recording duty covers `kata-plan` panel-clean approvals via their existing on-PR record. |
| Patch-id prohibition | `references/review-transfer.md` and the `approval-signals.md` invalidation section both state that patch-id equivalence alone never establishes a transfer. |

### Excluded

- **STATUS SHA-pinning** — anchoring approval rows in `wiki/STATUS.md` to a
  commit SHA. Strictly stronger than this spec's recording requirement, but a
  STATUS schema change with its own blast radius (every STATUS reader/writer,
  `kata-dispatch`, the wiki audit). **Named future-hardening spec candidate**,
  tracked on the PM backlog
  ([issuecomment-4676382100](https://github.com/forwardimpact/monorepo/issues/1602#issuecomment-4676382100))
  — deliberately not bundled here. Under this spec, the pin lives with the
  signal's own evidence and the transfer record on the PR, not in STATUS.
- **`kata-dispatch` changes.** Dispatch keeps propagating signals to STATUS
  unchanged. Compatible because pins are established from each signal's own
  evidence and recorded by the in-session/gate actors above — no capture-path
  changes.
- **Retroactive audit of past transfers.** The standard applies from adoption
  forward; PR #1578's prior transfers are already verified by the evidence
  above, and any future head move on a then-open PR falls under the standard.
- **Automation/tooling.** The standard is codified skill procedure executed by
  the gate agent; a helper command or CI check that independently enforces it
  (closing the self-attestation residual above) is a possible later spec.
- **Branch-protection or repository-settings changes.**

## Success Criteria

| Claim | Verification |
|---|---|
| The review-transfer reference exists and states the four-point standard with fail-closed semantics and phase-PR applicability. | Read: `kata-release-merge`'s `references/review-transfer.md` names all four points, states that any unmet point voids the transfer, and scopes the standard to spec/design/plan phase PRs. |
| Every signal class has a defined pin source, and a signal with no establishable pin does not transfer. | Read: the `approval-signals.md` invalidation section names the pin source per signal class in its table and states the fail-closed no-pin → no-transfer rule. |
| In-session approvals acquire a recorded pin as part of the flow. | Read: `approval-signals.md` § In-session approval requires the active agent to record the approved head SHA with the STATUS write, covering the approval-before-first-push case. |
| Content identity is path-set equality plus per-path blob/mode identity, never patch-id alone. | Read: `references/review-transfer.md` and the `approval-signals.md` invalidation section require touched-path-set equality and object-level identity vs the pinned head, cover deletes/renames/mode changes as voiding differences, and state patch-id is insufficient, citing whitespace blindness. |
| Structural invariants certify the head state, not commit pairs. | Read: `references/review-transfer.md` requires same commit count vs base at every head in the chain and that the base is an ancestor of main, naming the smuggled-commit and foreign-base gaps these close. |
| The chain is verifiable after force-pushes. | Read: `references/review-transfer.md` states the chain is established from contemporaneous transfer records on the PR, not from git reachability of intermediate heads. |
| Human signals never silently transfer; any non-identical delta voids. | Read: `references/review-transfer.md` and the invalidation section state that a human signal transfers only via recorded mechanical re-verification under points 1–3, and that any non-identical delta — explicitly including Step 5's sanctioned mechanical fixes — voids the transfer and requires fresh human re-approval. |
| Agent plan approvals may auto-transfer; voided agent signals re-approve at agent level. | Read: `references/review-transfer.md` permits agent-originated plan approvals to auto-transfer under points 1–3 with the verification recorded on the PR, and routes a voided agent signal to fresh agent re-approval per the trust rule. |
| Step 5 owes the transfer evidence when it moves a signal-carrying head. | Read: `kata-release-merge` Step 5 includes the pre-push signal check and requires the transfer record (or void notice, for human- and agent-originated signals alike) before force-pushing a phase-PR head that carries an approval signal. |
| Step 6 treats STATUS `approved` as necessary but not sufficient on phase PRs. | Read: `kata-release-merge` Step 6 invokes the reference, requires at least one approving signal of the required class to verifiably cover the current head, and blocks with a reason naming the failure when none does. |
| The transfer record is on the PR and names its evidence. | Read: `references/review-transfer.md` requires a PR comment naming the pinned SHA, the new head, and the per-point evidence — the shape the #1578 audit produced by hand. |
| The DO-CONFIRM checklist covers the transfer gate. | Read: `kata-release-merge`'s checklist includes a head-move/transfer item. |
| `approval-signals.md` gains the invalidation section without altering the signals table or STATUS semantics. | Read: the invalidation section exists and covers head-move consequences per signal class; the existing signals-table rows and trust-rule text are unchanged except additions; the section states that voiding does not rewrite STATUS. |

— Product Manager 🌱
