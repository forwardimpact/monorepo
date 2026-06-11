# Spec 1760 — fit-wiki audit admits wiki files by a declared filename grammar

Paired with [Spec 1770](../1770-sealed-part-h1-slot-grammar/spec.md) (sealed-part
heading semantics), authored in the same `kata-spec` pass per the
[pairing decision](https://github.com/forwardimpact/monorepo/issues/1582#issuecomment-4675802555).
This spec owns filename **admission** — which files may exist under `wiki/`.
Spec 1770 owns heading **semantics** — what a sealed part's H1 says. Neither
rule needs the other's mechanism, but both grammars are declared in one shared
contract home (§ Decision 2) and share one grandfathering posture
(§ Grandfathering).

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The wiki is the team's memory substrate, gated by `fit-wiki audit` on every Stop hook and pre-merge CI run. Files whose names match no convention are invisible to that gate: the audit classifies summaries and weekly logs and silently ignores everything else. Issue #1570 proved the consequence — `fit-wiki fix` minted a rogue `product-manager-2026-W24-history.md` and **the audit passed with it in place** — an orphan narrative home the rotation, bisect, and budget tooling never seals, splits, or checks. Memory decays silently while the contract reports clean. |

## Problem

`fit-wiki audit` has no opinion about which files may exist under `wiki/`.
Its file classifier recognises summary and weekly-log shapes and deliberately
leaves everything else unclassified — a posture adopted when the previous
stray-file rule was **removed** (#1185 / PR #1403, 2026-06-03) for rejecting
legitimate per-deliverable agent files. Two defects have since demonstrated
both failure directions:

- **False negative, minted**: the #1570 rogue `product-manager-2026-W24-history.md`
  passed audit while siphoning weekly-log narrative out of the rotation
  tooling's reach. PR #1572 closed the minting path; detection remains open.
- **False negative, residue**: `.claude/worktrees/agent-a41a176e` — sweep
  residue git-tracked inside the wiki — sat invisible to the audit for seven
  weeks (2026-04-22 → 2026-06-10) and was removed only after a
  triple-confirmed forensic investigation (occurrence-#23, W24) established it
  as safe to delete.

The blocker for simply restoring a rule is that the legitimate-file contract
was never written down. A survey at HEAD finds the obvious grammar (summaries,
weekly logs and parts, storyboards, `MEMORY.md`/`STATUS.md`/`Home.md`,
`metrics/<skill>/*.csv`) plus a long tail it does not cover: nine dated
study/analysis files following an undocumented `<topic>-YYYY-MM-DD.md`
convention; per-agent sidecar directories at the wiki root
(`product-manager/`, `release-engineer/`) holding experiment CSVs and a
documenting README; a `metrics/staff-engineer/` sidecar with a
four-level `trace-analysis` hierarchy of `.ndjson` and `.json` files; and a
dated protocol markdown at the `metrics/` root. A naive allowlist flags all
of these on day one — the exact condition that got the previous rule deleted.

## Decisions settled by this spec

These are the four decisions the originating issue
([#1574](https://github.com/forwardimpact/monorepo/issues/1574)) requires the
spec to settle.

### Decision 1 — Grammar for the root, directory-scoped admission below it

**The contract governs git-tracked files under `wiki/`** — tracked meaning
present in the wiki repository's index. The wiki working copy's own
version-control internals (`.git/`) and untracked scratch files are outside
the grammar — the historical true positive was a *git-tracked* residue, and
tracked state is what the memory contract protects. In a wiki without git
state (test fixtures, fresh bootstrap), the grammar governs all files: the
tracked scoping exists to exclude VCS internals and uncommitted scratch where
git state is present, not to shrink the contract.

The wiki **root** namespace is governed by a filename grammar of conventions
(classes), not an allowlist of instances. The grammar's **calendar tokens**
are: week `YYYY-Www`, month `YYYY-MNN`, date `YYYY-MM-DD`, and bare year
`YYYY` — recognised as hyphen-delimited segments of the filename (so `8080`
inside a longer segment is not a year token); finer boundary mechanics are the
design's. Admitted root classes:

| Class | Shape | Today's members (descriptive inventory) |
|---|---|---|
| Named ledgers | `Home.md`, `MEMORY.md`, `STATUS.md` | exactly those three |
| Summaries | `<slug>.md`, where `<slug>` carries no calendar token | agent summaries, `downstream-skill.md` |
| Weekly logs | `<agent>-YYYY-Www.md` (live) and `<agent>-YYYY-Www-partN.md` (sealed part), where `<agent>` carries no calendar token | all weekly logs and parts |
| Storyboards | `storyboard-YYYY-MNN.md` | monthly storyboards |
| Dated deliverables | `<topic>-YYYY-MM-DD.md`, where `<topic>` carries no calendar token | the nine study/analysis files — the undocumented convention, now documented as a class |

The load-bearing sharpening: a root filename containing any calendar token
must match a weekly-log, storyboard, or dated-deliverable shape **exactly**.
`product-manager-2026-W24-history.md` carries a week token but matches none of
the three — flagged. The token-free constraints on `<topic>` and `<agent>`
keep a token-bearing name from smuggling itself in behind a trailing date or
week (`product-manager-2026-W24-history-2026-06-11.md`,
`product-manager-2026-W24-history-2026-W25.md` — both flagged). A token-free
`<slug>.md` is admitted as a summary-class member; existing content rules then
apply or ignore it as today. Classes admit shapes, not registries: `<agent>`
and `<slug>` are not checked against a roster — deliberately, since the
grammar polices the namespace, and content rules own what files say.

**Subdirectories** are admitted as directories, evaluated at the wiki root
level only: `metrics/` and per-agent sidecars `<agent>/` where `<agent>` has a
summary-class file at the root. Contents of an admitted directory — today,
skill- and agent-keyed subdirectories of mixed `.csv`/`.ndjson`/`.json`/`.md`
under `metrics/` (a descriptive inventory, not an enforced shape), data files
plus documenting markdown in the sidecars — are admitted by membership; the
rule polices which root-level directories may exist, not their innards. Any
other git-tracked root-level directory — including dot-directories, which is
how the `.claude/` true positive is caught — is flagged.

**Accepted residual risk, stated so the rule is not oversold**: a token-free
rogue (`product-manager-history.md`), a date-suffixed orphan narrative home
(`product-manager-history-2026-06-11.md`), and a sidecar directory minted
beside a token-free `<slug>.md` are all admissible under this grammar; and a
freshly minted rogue is untracked until the wiki's next commit (the Stop hook
commits each run), so detection lags minting by up to one cycle. The defect
class is bounded elsewhere: the rotation tooling writes only week-token names,
and the minting path that produced #1570 is closed (PR #1572). The bare-year
token, conversely, costs a future bare-year convention (`roadmap-2026.md`) a
trip through the admission path (Decision 4) — accepted, because
flag-for-human remediation makes a false positive a human glance rather than
the memory loss the #1185 rule risked.

This split is why the rule survives the #1185 condition: false-positive risk
concentrates where the defect class lives (the root namespace), per-deliverable
files are admitted as a class rather than enumerated, and directory innards
stay free.

### Decision 2 — One contract home

The grammar is declared in
[memory-protocol.md](../../.claude/agents/references/memory-protocol.md) in a
single grammar section that also carries the sealed-part heading grammar
decided by Spec 1770 — declared once, so the two never drift. The section
becomes the sole declaration of wiki filename shapes: memory-protocol.md's
existing contract sections reference it rather than carrying drifting copies.
Whichever paired implementation lands first creates the section with its own
half; the second extends it — each spec's success criterion verifies only its
own half's presence. The audit rule catalog enforces what the section
declares; one home per policy.

### Decision 3 — Remediation is flag-for-human

A finding from this rule is never auto-fixed: a wrong automated move or delete
destroys memory. The `.claude/worktrees/` true positive is the canonical
argument — it was safely deletable, but only a triple-confirmed forensic
investigation could establish that. The rule gates like other contract rules
(audit failure), and `fit-wiki fix` routes its findings to the existing
flag-for-human report, leaving the file untouched.

### Decision 4 — Admission path for new conventions

Admitting a new convention is a one-place edit: extend the grammar section in
memory-protocol.md and the audit's matching declaration in the same reviewed
change; the grammar section documents this path itself — the **single**
general admission mechanism in memory-protocol.md, defined for *future*
conventions.

Coordination with the live consumer, per issue #1574's amended decision 4 and
the [coach's cross-link record on #1480](https://github.com/forwardimpact/monorepo/issues/1480#issuecomment-4675714271):
Obstacle #1480's option (1) is in flight as **spec 1610 / PR #1487** (a
companion file moving the RE Carry inventory off the summary surface). The
phase-entry check was performed in this pass: spec 1610 is at `spec draft`
and its design has not landed, so its filename and H1 are not yet fixed
(explicitly deferred to 1610's design) and its one-surface audit admit is in
**1610's scope**, not this spec's. The reciprocal obligation stands:
whichever implementation lands second conforms to the first — the failure
mode both specs must avoid is two parallel admission mechanisms in
memory-protocol.md. A token-free companion filename is admissible under the
summary class with no grammar change; should 1610's design choose a
token-bearing name or want its content contract audited, it enters through
this admission path as its first consumer.

## Grandfathering

Shared posture with Spec 1770: **existing legitimate files never need
rewriting or renaming.** This spec needs no transitional clause because the
grammar admits every legitimate git-tracked file at HEAD as a member of a
class, verified by a day-one-clean success criterion; Spec 1770 achieves the
same posture for headings with a transitional shape grammar carrying its
accepted-legacy shapes. Both rules reject only what should never have existed
(this spec) or validate shape without numbers (1770).

## Scope

### In scope

| Component | What changes |
|---|---|
| Wiki file grammar contract | Declared in memory-protocol.md's grammar section (shared home with Spec 1770), covering the root classes, the admitted directories, and the calendar-token vocabulary of Decision 1 and the admission path of Decision 4. |
| `fit-wiki audit` | Gains a rule flagging any git-tracked file under `wiki/` not admitted by the grammar, with flag-for-human remediation. |
| `fit-wiki fix` | Routes the new rule's findings to the flag-for-human report; never moves or deletes a flagged file. |

### Out of scope

- **Heading semantics and the sealed-part write path** — Spec 1770.
- **Content contracts** for admitted files (what a summary or dated
  deliverable must contain) — existing rules continue unchanged.
- **Retro-correction or relocation of any existing file**, including the nine
  dated study files and sidecar layouts; the grammar admits them where they
  are.
- **Untracked files and version-control internals** under `wiki/` — outside
  the contract's universe.
- **The minting path** — shipped in PR #1572.
- **Spec 1610's companion-file surface and its audit admit** — both in
  1610's scope (its design fixes the filename; its success criteria carry the
  rule shape); this spec guarantees only that one general admission mechanism
  exists and that whichever implementation lands second conforms to the
  first.
- **Files outside `wiki/`.**

## Success Criteria

| Claim | Verification |
|---|---|
| The wiki at current HEAD passes the new rule with zero findings — day-one clean. | Run `bunx fit-wiki audit` against the live wiki; observe no finding from the new rule. |
| The #1570 rogue filename is rejected. | In a test wiki, create (and track) `product-manager-2026-W24-history.md`; audit reports it. |
| The historical true positive is rejected. | Reconstruct `.claude/worktrees/agent-a41a176e` as a tracked test fixture in a test wiki; audit reports it. |
| Every legitimate class at HEAD is admitted. | Fixtures per class — named ledgers, summaries, `downstream-skill.md`, weekly logs and parts, storyboards, all nine dated-deliverable filenames, sidecar CSVs plus README, `metrics/` nested `.ndjson`/`.json` hierarchy, `metrics/`-root dated protocol markdown — each passes the rule. |
| A flagged file is never auto-fixed. | Run `bunx fit-wiki fix` on a fixture wiki containing a flagged file; observe the file byte-identical and the finding in the flag-for-human report. |
| The grammar's home is the shared section. | Read memory-protocol.md's grammar section; observe the filename grammar, calendar-token vocabulary, and admission path declared there (beside the heading grammar once Spec 1770's implementation has also landed), with audit behaviour matching the declaration; other sections of the file may mention shapes but defer to this section as the normative declaration. |
| The admission path is the single admission mechanism and serves spec 1610. | Read the grammar section's admission-path documentation; confirm it is the only admission mechanism declared in memory-protocol.md and that spec 1610's chosen surface (token-free name via the summary class, or any other via this path) is admissible without a parallel mechanism. |

— Product Manager 🌱
