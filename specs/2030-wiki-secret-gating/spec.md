# Spec 2030: Fail-closed secret gating on the wiki push path

Tracks [#1740](https://github.com/forwardimpact/monorepo/issues/1740).
Standalone — **not** folded into spec 2010 (see § Relationship to spec 2010).

## Persona and job

Serves **Teams Using Agents**
([JTBD.md](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team)):
the agent team's shared memory must not become a credential-leak vector. An
agent that writes a secret into its memory should be stopped at the boundary,
not discovered after the fact in a public history.

## Problem

`fit-wiki` writes agent memory by committing and pushing through one behaviour,
`WikiSync.commitAndPush` (in `libwiki`). It is reached by the commands that
write the wiki — `claim`, `release`, and `push` — through two call sites: the
shared `pushWiki` helper in `commands/claim.js` (used by both `claim` and
`release`) and the push command in `commands/sync.js`. That behaviour stages,
commits, and
pushes to the wiki remote with **no secret scan anywhere on the path**.
`libwiki` contains zero secret-scanner references; the wiki checkout carries no
workflow and no scanner config.

The monorepo's only secret-leak detective control runs gitleaks as a step in
the `audit` composite action, invoked by the `secret-scanning` job of the
Security workflow — which fires only on `push`/`pull_request` to the monorepo's
`main`. Wiki commits never route through monorepo CI, so that control is blind
to them.

The exposure is not theoretical:

| Fact | Consequence |
| --- | --- |
| The monorepo is **public** with the wiki enabled | A secret pushed to the wiki lands in a **world-readable** history the instant it pushes, and persists after deletion. |
| The destination is a GitHub **Wiki** repo (`monorepo.wiki`, a `.wiki.git`) | GitHub secret-scanning and push-protection do not cover wiki content, and wiki repos cannot run GitHub Actions — so no destination-side control is buildable. |
| Staging scope (spec 2010 L1, [#1583](https://github.com/forwardimpact/monorepo/issues/1583) item 3) shrinks *what* is committed | It cannot scan the *content* of the intended file. A secret pasted into `MEMORY.md` itself rides through a perfectly path-scoped commit. |

The push path is therefore the only place a secret-leak control can live, and
it has none.

## Proposal

Add a **fail-closed pre-push secret scan** to the wiki push path so no
`fit-wiki` write reaches the wiki remote with a detectable secret in it. Use
the same secret scanner the repository already standardises on (gitleaks) so
the wiki path enforces the same detection the monorepo's `main` already does.

- **Single choke point.** Gate at the `commitAndPush` behaviour so the control
  covers every command that pushes the wiki (`claim`, `release`, `push`)
  without per-command duplication.
- **Scope of the scan.** The content being pushed — what the commit introduces
  relative to the wiki remote — is scanned before the push.
- **Fail-closed.** A detection **blocks the push** and surfaces the finding to
  the caller. The command must not silently degrade to "saved locally" on a
  detection (distinct from today's fire-and-forget tolerance of *network*
  failure, which is preserved).
- **Documented break-glass.** A single, explicit, audited escape hatch lets an
  operator override a confirmed false positive. It must be deliberate (off by
  default), and it must leave a durable record of who overrode and why. The
  procedure is documented in the wiki-operations guide.

## Non-goals

| Excluded | Why |
| --- | --- |
| GitHub-native secret-scanning / push-protection on the wiki repo | Infeasible: GitHub push-protection and secret-scanning do not cover wiki content. The human-admin "enable push-protection on the wiki" leg is dropped — it is not buildable. |
| A workflow/CI control on the wiki repo | Infeasible: wiki repos cannot run GitHub Actions. |
| Changing staging scope (what gets committed) | Owned by spec 2010 L1 / #1583 item 3 — orthogonal axis, see below. |
| Scanning the monorepo push path | Already covered by the gitleaks step on `main`. |

## Relationship to spec 2010

Spec 2010 L1 (path-scoped staging) and #1583 item 3 control **what a commit
stages**. This spec controls **whether the content being pushed contains a
secret**. They are independent axes: shrinking the staged set to exactly the
intended file does not gate the content of that file. Defense-in-depth —
surface reduction (2010) plus an independent content backstop (this spec).
Folding this into 2010 would break 2010's two-lever scope; keep separate.

Sequencing note: spec 2010 is in flight on PR #1736 and not yet on `main`, so
its directory and STATUS row do not exist in the tree yet. This spec does not
depend on 2010 landing — it gates a different axis and stands alone.

## Design caveats (for the design/plan to resolve, not decided here)

- **Scanner availability in the `fit-wiki` runtime.** The scanner runs today
  only in CI (the `audit` action). The local `audit-secrets` task already
  discovers a scanner on the host via `command -v` and errors out when it is
  absent — a
  runtime-discovery precedent the design can build on. How the scanner is made
  available, verified, and version-controlled in the `fit-wiki` runtime, and
  what happens when it is absent, is a design decision. Absence must itself
  fail closed or be an explicit, recorded operator choice — never a silent
  skip.
- **Scan-window correctness.** The push path reconciles with the remote before
  pushing. The design must define the scan window so it covers exactly the
  content this push introduces, under every reconciliation path the push takes.

## Success criteria

| # | Criterion | Verified by |
| --- | --- | --- |
| 1 | A `fit-wiki` write whose pushed content contains a detectable secret does not reach the wiki remote. | Integration test against the push path with content carrying a fixture secret: the remote is unchanged and the command reports the detection. |
| 2 | A detection fails closed — the command exits non-zero and reports no success. | Test asserts non-zero exit and absence of a success result on detection. |
| 3 | A clean write pushes unchanged — no behavioural regression to existing writers. | Existing libwiki push-path tests (the `wiki-sync` and `cli-claim` suites) pass; a clean fixture pushes. |
| 4a | Without the break-glass override, a detection blocks the push. | Test: detection with no override → push blocked. |
| 4b | The break-glass override is off by default and, when used, permits the push despite a detection. | Test: same detection with the override set → push proceeds. |
| 4c | Using the override leaves a durable record of who overrode and why. | Test asserts the override writes an inspectable record (e.g. the commit/its trailer or an audit line). |
| 5 | A network/credential push failure still degrades to "saved locally" — today's fire-and-forget behaviour is preserved, distinct from a secret-detection block. | Existing fire-and-forget push test passes unchanged. |
| 6 | The wiki-operations documentation describes the gate and the break-glass procedure. | `websites/fit/docs/libraries/predictable-team/wiki-operations/index.md` covers both. |

— Security Engineer 🔒
