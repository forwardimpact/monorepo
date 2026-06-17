# Design 1790 — Fail-Closed Review Transfer Across Force-Pushes

Implements [spec.md](spec.md). Codifies a fail-closed four-point review-transfer
standard so an approval signal carries to a moved phase-PR head only by recorded
mechanical verification, never by patch-id inference, and never silently for
human-originated signals.

## Components

The change is procedure-as-document: no executable code. Four documents form
two layers — a **standard** (the four points, owned by one reference) and its
**invocation surfaces** (the skill steps and the shared agent reference that
read it).

| Component | Role | Owns |
|---|---|---|
| `kata-release-merge/references/review-transfer.md` (new) | Canonical four-point standard | Point definitions, fail-closed rule, phase-PR applicability, chain-from-records rule, transfer-record shape, patch-id prohibition |
| `kata-release-merge/SKILL.md` Step 5 | Producer of transfer evidence | Pre-push signal read; transfer-record-or-void write before force-push |
| `kata-release-merge/SKILL.md` Step 6 | Consumer / gate | STATUS `approved` necessary-but-not-sufficient; current-head coverage check; block-with-reason |
| `kata-release-merge/SKILL.md` DO-CONFIRM | Confirmation | Head-move/transfer checklist item |
| `agents/references/approval-signals.md` invalidation section (new) | Per-signal-class pin + invalidation rules | Pin source per signal class, head-move consequence, void/re-approval routing |
| `approval-signals.md` § In-session approval (amended) | Pin origination | Records the approved head SHA alongside the STATUS write — as a PR comment when a PR exists, with the wiki commit otherwise; an approval given before any push is pinned by the same agent at first push. Covers `kata-plan` panel-clean approvals via their existing on-PR record. |

One home per decision: `review-transfer.md` owns the mechanics of the four
points; `approval-signals.md` owns where each signal's pin comes from and what
re-approval a voided signal needs. The skill steps own *when* the standard
fires. No definition is duplicated across documents — each cross-references.

## Data flow

```mermaid
sequenceDiagram
  participant H as Human/Agent approver
  participant AS as approval-signals.md
  participant S5 as RE Step 5 (rebase)
  participant PR as PR (records + comments)
  participant S6 as RE Step 6 (gate)
  participant RT as review-transfer.md

  H->>AS: approval signal (label/review/comment/in-session/panel)
  alt PR exists
    AS->>PR: pin recorded (SHA) per signal class
  else approval before first push (no PR yet)
    AS->>AS: pin recorded with wiki commit; same agent pins on PR at first push
  end
  Note over S5,PR: head moves
  S5->>RT: invoke four-point check vs pinned head
  alt content-identical (points 2-3 hold)
    S5->>PR: transfer record (pinned SHA, new head, per-point evidence)
  else delta-producing move
    S5->>PR: void notice (signal void, re-approval awaited)
  end
  S6->>PR: read pins + transfer records
  S6->>RT: does a required-class signal cover current head?
  alt covered (pin match or valid recorded chain)
    S6->>S6: gate passes (with STATUS approved)
  else not covered
    S6->>S6: blocked (reason names voided/unverifiable transfer)
  end
```

The pin and transfer records live **on the PR**; STATUS is unchanged. Step 6
reads STATUS for phase approval (necessary) and the PR for head coverage
(sufficient). The chain is reconstructed from the contemporaneous transfer
records, not git reachability, because force-pushed intermediate heads may be
gone.

## Key Decisions

| Decision | Choice | Rejected alternative |
|---|---|---|
| Where the standard lives | New `references/review-transfer.md` under `kata-release-merge` | Inline in SKILL.md — Steps 5 and 6 both need it; a shared reference keeps one home and matches the existing `references/` pattern (comment-gate, announcement-backstop) |
| Where the pin lives | On the PR (comment / panel record), established from each signal's own evidence | STATUS SHA-pin — strictly stronger but a schema change touching every STATUS reader/writer + `kata-dispatch` + wiki audit; spec excludes it as a separate future spec |
| Who teaches the recording duty to non-RE actors | The `approval-signals.md` invalidation section (a shared agent reference) | Duplicating the duty into each producing skill — fragments one rule across many homes; the shared reference is already every agent's signal contract |
| Content-identity primitive | Touched-path-set equality + per-path blob/mode object identity | `git patch-id --stable` alone — whitespace-blind (semantic in gated md/YAML), and certifies commit pairs not head states; the #1578 mechanism this spec replaces |
| Chain reconstruction source | Contemporaneous transfer records on the PR | Git reachability of intermediate heads — force-pushes orphan them, so reachability is not durable evidence |
| Mechanical-fix handling | The gate's own format/lockfile/codegen fixes that change content **void** a human signal | Treating gate fixes as identity-preserving — that is the laundering vector (gate substituting its judgment for what the human approved) |
| Voided-signal routing | Human-originated → fresh human approval; agent plan approvals → fresh `staff-engineer` re-approval | Uniform human-escalation — over-escalates agent-approvable plans; under-protects human signals |
| Eager vs. held voiding | Step 5 may hold a delta-producing rebase until re-approval is in hand rather than voiding eagerly | Always void immediately — forces avoidable churn on a fast main when re-approval is already obtainable |

## Boundaries

- **Applicability.** The standard governs spec/design/plan **phase PRs** only —
  signals that certify the PR's own content. Implementation PRs gate on the
  parent plan's approval (Step 9) and stay outside the standard. The "Merged
  phase PR" and "Implementation merge" signal classes are inert under it: a
  closed PR has no head move, so they need no pin beyond their existing record.
- **STATUS untouched.** Schema and semantics unchanged. A voided transfer leaves
  the row as-is; re-approval is a fresh signal with a fresh pin, never a STATUS
  rewrite. This narrows Step 6's existing "PR-side signals not consulted here"
  boundary to: PR-side read is for pins and transfer records only; STATUS
  remains the approval source.
- **`kata-dispatch` untouched.** It keeps propagating signals to STATUS; pins
  are established from each signal's own evidence by the in-session/gate actors,
  so no capture-path changes.
- **No automation.** The standard is codified procedure the gate agent executes;
  an independent CI enforcer is a possible later spec, not this one. The threat
  model accepts auditability (recorded, recomputable claims) over
  tamper-proofness (records authored by the same trusted-actor class).
- **Clean break.** The new gate **replaces** the head-blind path — patch-id
  inference is prohibited outright, not retained as a fallback. Past #1578
  transfers are already verified by hand; the standard applies from adoption
  forward (no retroactive shim).

## Risks

| Risk | Disposition |
|---|---|
| Re-approval churn on a fast-moving main loops fix → void → re-approval | Accepted trade-off (spec § Accepted trade-offs); Step 5 may hold a delta-producing rebase until re-approval is in hand rather than voiding eagerly |
| Self-attestation: transfer records authored by the trusted-actor class the threat model names | Accepted residual, out of scope by design — the standard converts silent inference into recorded, falsifiable claims any later audit can recompute; independent enforcement is a named future spec |

— Staff Engineer 🛠️
