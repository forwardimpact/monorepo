# Spec 1830 — Merge gate: documented approval path for spec-less experiment PRs (PDSA Act leg)

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The PDSA Act leg ships code from an `experiment`-labeled issue, not a `specs/NNN/` artifact, so the merge gate's spec-keyed approval read has no row to match and no documented path — an Act leg that can't predictably reach `main` breaks the loop the product exists to run. |

## Problem

`kata-release-merge` Step 6 reads `wiki/STATUS.md` for the PR's classified
phase at `approved`. Experiment PRs — implementation-typed PRs whose lineage
is an `experiment`-labeled issue adjudicated through the coaching session
protocol — have no spec id, hence no row, hence no defined gate treatment.
The gap has produced three documented failures:

| Evidence | What happened |
|---|---|
| PR #1170 (Exp 45, merged 2026-05-27) | Fail-open improvisation: merged on trust + green CI alone, with zero human review on an agent-profile self-edit — the highest-risk surface the gate protects. |
| PR #1353 (Exp 1 of issue #1351) | Fail-closed improvisation: blocked ten days on an absent STATUS row despite a PASS verdict adjudicated 2026-06-02; ~7-day trace-artifact retention destroyed the evidence the PR was opened to collect. Nobody owned requesting a human signal, so nobody did until a sweep forced the question. |
| RFC Discussion #1355 (2026-06-02) | A full mechanism design (experiment-keyed STATUS row, `registered → approved → cancelled` lifecycle, gate predicate, diff-scope check) stalled on quorum process — one ratification, two non-responses, horizon passed, pre-stated extension never executed. It failed on process, not substance. |

Inconsistent gate behavior is worse than either rule: agents cannot predict
the path, experiments stall past their evaluation horizons, and each ad-hoc
unblock re-litigates the same question. The release engineer's interim
posture is fail-closed citing this spec's issue (#1651) — correct, but a
placeholder for a rule, not a rule.

## Decision — fail-closed trust model carrying the RFC #1355 mechanism

The issue framed two options: **(a)** an experiment carve-out where a coach
PASS verdict plus a human ack unblocks the gate, versus **(b)** fail-closed
default with a PR-side human signal as the canonical experiment path. This
spec commits to **(b)**, implemented through the #1355 machinery. The #1355
design is plumbing, not policy: its only (a)-specific element is who
originates `approved`. With a trusted human PR-side signal as the
originator — propagated to STATUS through the same pipeline spec approvals
use today — the #1355 mechanism implements (b) intact.

| Axis | (a) coach verdict + human ack | (b) fail-closed, human PR-side signal |
|---|---|---|
| Trust provenance | Approval originates from an agent verdict; the gate must verify verdict + ack provenance mechanically, which no current machinery supports | Approval originates from a trusted human; agents only propagate — the trust rule the whole approval system already enforces |
| Risk posture on self-edit surfaces | Weakens fail-closed exactly where experiments most often write (`.claude/agents/**`, skill self-edits) | One human checkpoint on every merge to `main`, unchanged |
| Precedent fit | Ratifies the PR #1170 path that had zero human eyes on a self-edit | Reconciles #1170 as a historical exception; #1353's stall is fixed by naming an owner for the ask, not by weakening the rule |
| Cost | New verdict-provenance machinery before any experiment merges | Human signal latency — bounded by the named-owner ask at PR-open and block-count escalation |
| Future path | — | (a) becomes a one-element writer change on plumbing already in place, once verdict provenance is machine-checkable |

### What the path consists of

1. **Experiment-keyed approval row in `wiki/STATUS.md`**, preserving STATUS
   as the gate's only **approval** read. States: `registered` (experiment
   registered, no approval yet), `approved` (human signal observed),
   `cancelled` (experiment adjudicated FAIL or VOID, or retired without an
   Act PR). `cancelled` is reachable from either prior state until the Act
   PR merges and blocks open PRs referencing the experiment, symmetric to
   spec `cancelled`. The row is written only for experiments whose
   execution plan includes shipping code, at latest at registration of
   that intent. Terminal resting states are `approved` (after the Act PR
   merges) and `cancelled`; the wiki audit accepts all three states as
   valid. Experiment rows must be **mechanically distinguishable from spec
   rows** — spec ids and issue numbers draw from overlapping numeric
   ranges, so the row key must disambiguate independent of digit count
   (exact syntax is a design-phase choice; RFC #1355's `:exp` namespace is
   prior art). The path covers one Act PR per experiment; further PRs on
   the same experiment route through the spec stack.
2. **Human-originated `approved`.** A trusted human's PR-side signal
   (label, APPROVED review, approval comment — per approval-signals.md) is
   the sole origin; `kata-dispatch` or an in-session agent propagates it to
   the row. Agents never originate `approved`, and propagation requires an
   existing `registered` row — on an absent row the signal does not
   propagate until the owning agent backfills registration. The signal pins
   the PR head commit at signal time, readable from the gate's approval
   read; any later commits — **including gate-performed mechanical
   rebases** — re-block the PR until a fresh human signal covers the new
   head. The gate therefore does not rebase an approved-and-pinned
   experiment PR; if a rebase is unavoidable, the PR re-blocks. This pin is
   deliberately stricter than today's pin-less spec-row approvals: no spec,
   design, or plan artifact bounds what the approved commits contain, so
   the signal must bind to exact content.
3. **Agent-written bookkeeping states.** The experiment's **owning agent**
   — which already creates, comments on, and closes its own experiment
   issues; the session facilitator writes no files — writes `registered`
   and `cancelled`. These are bookkeeping states, not approvals, so agent
   origination is consistent with the trust rule: only `approved` requires
   a human origin.
4. **Mechanical discriminator at the gate.** An implementation-typed PR
   referencing **no spec id** and **exactly one** issue labeled as an
   experiment with a named owning agent takes the experiment path. Because
   spec ids and issue numbers share the same reference shape, the
   discriminator classifies each reference by what it resolves to: a number
   matching a STATUS spec row is a spec reference; one resolving to an
   experiment-labeled issue is an experiment reference; a number matching
   both, and any PR referencing multiple experiments, is **blocked
   fail-closed** with a reason naming the ambiguity — never silently
   routed.
5. **Diff-scope check.** In place of the implementation-PR spec check, the
   gate verifies the PR diff stays within the experiment's pre-registered
   execution plan, recorded on the issue at registration time. The
   execution-plan field must name the intended change surface in a form
   the gate can compare against a diff's file list without judgment calls
   (exact format is design-phase); any change outside the registered
   surface blocks the PR. Risk posture for agent-profile and skill
   self-edit surfaces is at least as strict as today's fail-closed
   default: such paths pass only when the registered plan names them and a
   human signal pins the exact head.
6. **Named latency owner.** The experiment's owning agent requests the
   human signal at PR-open, naming the experiment issue and flagging any
   time-sensitive evidence (e.g. retention-bounded artifacts). The gate's
   blocked report carries the consecutive-block count, and at a defined
   threshold (value is design-phase) the gate re-surfaces the signal
   request rather than silently re-blocking.
7. **Instrumentation.** Per experiment PR merged, the gate's memory
   records PR-open, human-signal, merge, and (when present) experiment
   verdict timestamps, so verdict→merge and request→signal latency are
   derivable against the #1353 baseline.

## Scope

### In scope

| Component | What changes |
|---|---|
| `kata-release-merge` skill | The approval-gate step names the experiment-PR path: resolution-based discriminator with fail-closed ambiguity handling, STATUS row read across the three lifecycle states, blocked reason for an absent/`registered`/`cancelled` row, head-pin re-block rule including the no-rebase-while-pinned treatment, and the block-count re-surface threshold. The implementation-PR spec check gains the experiment branch (diff-scope check; merge does not advance the row). The memory section adds the timestamp instrumentation. |
| `kata-session` experiment lifecycle reference | The registration command shape gains an execution-plan field (the gate-comparable change surface) and the `registered` row write for code-shipping experiments; the conclusion step defines the verdict vocabulary — PASS / FAIL / VOID semantics — and the `cancelled` row write on FAIL/VOID; the PR-open step instructs the owning agent to request the human signal with the time-sensitive-evidence flag. All writes belong to the owning agent, never the facilitator. |
| `approval-signals.md` | Documents the experiment row lifecycle, its writers (owning agent: `registered`/`cancelled`; dispatch or in-session agent: `approved` on human signal), the signal types that feed it, and the head pin. Published skills reach this reference by public URL; it is the contract's documentation home. |
| `wiki/STATUS.md` schema prose | The header's format/lifecycle description admits experiment-keyed rows, their states, and the pin. |
| STATUS mechanical validation | The wiki tooling that parses and audits STATUS rows (`libwiki` status parsing, `fit-wiki audit`) recognizes the experiment row key, all three states, and the pin field, so experiment rows do not redden the wiki audit. |
| Genericity | `kata-release-merge` and `kata-session` are published skills: all experiment-path text stays free of monorepo-specific names, issues, and PRs. |
| Transition | Experiments registered before this ships have no row; their owning agents backfill `registered` before an Act PR can pass. Spec 1440 is **not** a competing vehicle — it carries issue #1358's re-ping cadence spec (the stale "fallback vehicle" lineage on issue #1651 is corrected alongside this spec). |
| Precedent reconciliation | Recorded on issue #1651: PR #1170 stands as a historical exception (no skill text references it); the RE's 2026-06-02 fast-path proposal and RFC #1355 are superseded by this spec. |

### Out of scope

- **Option (a) — coach-verdict-originated approval.** A future relaxation,
  contingent on machine-checkable verdict provenance; under this design it
  is a writer change on the same row, not a rebuild.
- **Unblocking PR #1353 itself.** A human-signal request already stands on
  that PR and it merges on that signal. If it is still open when this
  ships, it joins the path: its owning agent backfills the row and the
  standing signal propagates per approval-signals.md.
- **Spec-less non-experiment PRs.** Their gate default remains blocked
  fail-closed, unchanged by this spec.
- **CLI tooling for the row write** (e.g. a `fit-wiki` experiment
  subcommand). Manual STATUS edits carry the same authority and audit trail
  today; tooling is a design/plan decision, not a WHAT requirement.
- **The human-approval-bandwidth family** (#1358/#1361). Signal latency is
  mitigated here by ownership and escalation, not solved; the family has
  its own lane.
- **Spec routing for non-experiment work.** Bug fixes, refactors, and
  features that are not registered experiments are unaffected; the
  experiment path activates only on the discriminator.

## Success Criteria

| Claim | Verification |
|---|---|
| The gate names the experiment path explicitly. | Read `kata-release-merge` SKILL.md: the approval-gate step defines the resolution-based discriminator with fail-closed ambiguity handling, the STATUS row read with lifecycle states, the blocked reason for an absent/`registered`/`cancelled` row, the head-pin re-block rule with the no-rebase-while-pinned treatment, and the block-count re-surface threshold. |
| Published skills stay generic. | The repository's skill-genericity invariants check passes; the experiment-path text in `kata-release-merge` and `kata-session` names no monorepo-specific issue, PR, package, or path. |
| The approval signal is human-originated end to end. | Read `approval-signals.md`: the experiment row's `approved` state lists only trusted-human signal types as origins, with agents as propagators requiring a pre-existing `registered` row; `registered` and `cancelled` name the owning agent as writer. |
| STATUS remains the gate's only **approval** read. | Read the gate step: the approval predicate for experiment PRs consults only the STATUS row (which carries the pin) — PR-side labels, reviews, and comments feed the row via propagation, never the predicate directly. (The discriminator's issue-label read and the diff-scope check's issue read are classification and scope inputs, not approval inputs.) |
| Experiment rows are mechanically distinguishable. | Read the STATUS schema prose and validation rules: an experiment row cannot be parsed as a spec row, and the disambiguation holds for any issue-number width. |
| Experiment rows pass the wiki audit in every state. | Add experiment-keyed rows in `registered`, `approved` (with pin), and `cancelled` states to a STATUS fixture and run the wiki audit; observe no finding against any of the three. |
| Registration produces the row and the plan. | Read the `kata-session` experiment lifecycle reference: the registration step records the gate-comparable execution plan on the issue and writes the `registered` row for code-shipping experiments; the conclusion step defines PASS/FAIL/VOID and writes `cancelled` on FAIL/VOID — all owned by the coached agent, with no facilitator write. |
| The signal ask has a named owner at PR-open. | Read the experiment lifecycle reference: it instructs the owning agent to request the human signal at PR-open, with the time-sensitive-evidence flag. |
| A FAIL/VOID experiment blocks its PRs. | Read the gate step: a `cancelled` row — including one written after `approved` but before merge — is a blocked verdict for any open PR referencing that experiment. |
| Scope is bounded by the registered plan. | Read the gate step: experiment PRs pass a diff-scope check comparing the diff against the registration template's execution-plan field, in place of the spec-stack plan check; out-of-surface changes block. |
| Self-edit surfaces keep fail-closed posture. | Read the gate step and the diff-scope rule: a diff touching agent-profile or skill self-edit paths passes only when the registered plan names those paths and the human signal pins the exact head — no path is exempted from either condition. |
| The rule is instrumented. | Read the gate's memory section: PR-open, human-signal, merge, and verdict timestamps are recorded per experiment PR merged. |
| The precedents reconcile on the record. | Read issue #1651: the lineage records PR #1170 as a historical exception and RFC #1355 + the RE fast-path proposal as superseded; the spec-1440 fallback bullet is corrected. |
| One path, zero improvisation *(post-ship falsifier — does not gate implementation merge; PM closes the loop on the next experiment-Act PR)*. | The next experiment-Act PR follows the documented path with zero improvisation, and its verdict→merge latency is within the trace-retention window — checked against the gate's recorded timestamps. |

— Product Manager 🌱
