# Plan 1550 — Sibling-edit workflow: permission-scoped, audited dispatch

Executes [design-a.md](design-a.md) for [spec 1550](spec.md).

## Approach

Add one `workflow_dispatch`-only `.github/workflows/sibling-edit.yml` with two
jobs: a `gate` job that always runs, validates the actor (G2) and sibling (G3),
and writes a per-attempt audit comment to a long-lived monorepo Issue with the
monorepo `GITHUB_TOKEN` **before** deciding its exit code (so a rejection is
still audited, G5); and an `edit` job that `needs:` the gate's success, mints a
sibling-scoped `contents`-only App token (G4), runs the edit, pushes, and writes
a terminal audit comment. Then correct `.github/CLAUDE.md` to match. The audit
Issue is created once (manually or by the first run) and its number is recorded
in the doc.

Libraries used: none (GitHub Actions workflow + `.github/CLAUDE.md`).

## Step 1 — Create the audit Issue and record its number

Intent: a durable monorepo destination exists before the workflow references it.

Files: none in-repo (a GitHub Issue); its number is hard-referenced in Steps 2
and 4.

- Open a monorepo Issue titled "Sibling-edit audit log" (label `audit`), pinned,
  describing that every `sibling-edit.yml` invocation appends a comment. Capture
  its number `<AUDIT_ISSUE>` for the workflow and the doc.

Verification: the issue exists and is referenced by `<AUDIT_ISSUE>` in Steps
2/4.

## Step 2 — The `gate` job (always-run, validate, audit-intent)

Intent: validate and record every attempt, including rejections.

Files: create `.github/workflows/sibling-edit.yml` (this job).

- `on: workflow_dispatch` only, with inputs `sibling` (required) and
  `edit-command` (required). No other `on:` keys (G1).
- Top-level `permissions:` minimal; the `gate` job needs `issues: write` (audit
  comment) and `contents: read`.
- Job `gate` has **no job-level `if:`** — it always runs (a job-level `if:`
  would skip the job and its audit, defeating G5; this deliberately supersedes
  G2's "job-level `if:`" surface text while honouring its property — note this
  in the workflow comment). Steps, in order:
  1. Echo the in-source actor allowlist (`kata-agent-team[bot]` + any documented
     trusted humans) to the log (G2 visibility).
  2. **Outcome-computation step that itself never fails** (always exits 0): set
     a step output `outcome` to `actor-rejected` if `github.actor` is not
     literally in the allowlist; else `sibling-rejected` if `inputs.sibling` is
     not exactly one of
     `fit-bootstrap fit-eval fit-benchmark fit-wiki kata-agent` (literal
     equality, no glob/regex/substring); else `intent`. Also set a step output
     `sibling_validated` = the matched value (empty unless `intent`). The check
     does not interpolate `sibling` into a command before the equality test.
  3. **Audit-write step marked `if: always()`** so it runs even if an earlier
     step crashed/was cancelled (G5 crash-durability): post a comment to Issue
     `<AUDIT_ISSUE>` via `gh issue comment` with the monorepo `GITHUB_TOKEN`,
     carrying all five G5 fields
     `{actor, sibling, commit_sha_being_pushed: n/a, invocation_time, workflow_run_id}`
     plus `outcome` (the reason code; `intent` on the pass path). The five
     fields are present on **every** record including rejections.
  4. Final step: `exit 1` if `outcome != intent`, so the `edit` job (which
     `needs: gate`) does not run on a rejection. The audit step (3) runs before
     this regardless because it is `always()`.
- Expose `outcome` and `sibling_validated` as job outputs for the edit job.

Verification: a `workflow_dispatch` with a bad actor or bad sibling writes an
`actor-rejected` / `sibling-rejected` audit comment **carrying all five G5
fields** and the run fails before any token mint; a simulated mid-job failure
still leaves the `always()` audit comment; the `on:` block has only
`workflow_dispatch` (G1).

## Step 3 — The `edit` job (scoped mint, edit, push, terminal audit)

Intent: do the sibling edit under a minimal token and close the audit record.

Files: `.github/workflows/sibling-edit.yml` (this job).

- Job `edit` with `needs: gate` (runs only on gate success). Steps:
  1. Mint the token: `actions/create-github-app-token@<pinned-sha> # v3` with
     `app-id`/`private-key` from `KATA_APP_*` secrets,
     `repositories: ${{ needs.gate.outputs.sibling_validated }}` (the
     gate-validated value, **not** the raw `inputs.sibling` — G3 carries the
     literal-matched value through to the mint), and the `contents`-write-only
     permission input — **no** `actions`/`workflows`/other `permission-*` (G4).
  2. Clone the sibling with the minted token; run the operator-supplied
     `edit-command` in the clone; commit if the tree changed; push with the
     minted token. The step's `env:` exposes **only** `GH_TOKEN=<minted>` and
     `SIBLING=<validated>` — never `toJSON(secrets)` or any pre-existing secret
     (G4). The job's monorepo-side `permissions:` is `contents: read` only (it
     needs nothing else on the monorepo; the audit-write below uses
     `issues: write` granted to this step).
  3. Terminal audit-write to `<AUDIT_ISSUE>` with the monorepo `GITHUB_TOKEN`
     (`if: always()`): `commit_sha_being_pushed` = the pushed SHA on success,
     else `n/a` + a reason code from `{edit-failed, push-rejected, no-change}`;
     **also record the minted credential's declared `repositories` and
     `permissions`** (from the mint step's outputs) so a reviewer can verify the
     runtime scope after the fact (G4 final clause).

Verification: a valid dispatch against one allowlisted sibling mints a token
scoped to that sibling only (via the gate-validated value), performs the edit,
pushes, and writes a terminal audit comment with the pushed SHA and the minted
token's recorded scope; the edit step's environment contains no pre-existing
secret.

## Step 4 — Correct `.github/CLAUDE.md`

Intent: the documented edit path matches reality and points to the workflow.

Files: modify `.github/CLAUDE.md` § Editing a published action.

- Replace the clone-and-push recipe and the "GITHUB_TOKEN has push rights to
  every sibling" framing with: the in-workflow `GITHUB_TOKEN` is
  monorepo-scoped; the supported sibling-edit path is dispatching
  `sibling-edit.yml`; link the workflow and the audit Issue `<AUDIT_ISSUE>`.
  Leave the § Third-party actions table and the append-only-tag/Dependabot
  guidance intact (out of scope).

Verification: the section no longer asserts sibling push rights for
`GITHUB_TOKEN`, names the workflow and audit destination, and the
`coaligned`/instructions doc checks pass.

## Step 5 — End-to-end run evidence (spec criterion)

Intent: prove the workflow runs green against one sibling with an audited
record.

Files: none (a dispatch run + PR description link).

- Dispatch `sibling-edit.yml` against one allowlisted sibling (e.g. a no-op
  `edit-command` that touches a comment, or a real pending fix), confirm green,
  and link the run + the resulting audit comment in the implementation PR
  description.

Verification: the linked run is green and the audit comment satisfies G5's five
fields; the PR diff touches only `sibling-edit.yml`, `.github/CLAUDE.md`, the
`specs/1550-…` tree, and at most one new `.github/actions/` dir.

## Risks

- **`create-github-app-token` permission-input name.** The action restricts
  scope via `permission-contents: write` (and grants the App's full set if no
  `permission-*` is given). The implementer must confirm the exact input name on
  the pinned v3 SHA and that omitting other `permission-*` inputs yields a
  contents-only token — verify against the action's README at the pinned ref.
- **App installation precondition.** Minting `repositories: <sibling>` requires
  the `kata-agent-team` App already installed on that sibling with
  `contents:write` (spec residual). If absent, the mint fails — that is a
  fail-closed outcome, audited as `edit-failed`/`push-rejected`, not a silent
  skip.
- **Audit Issue must pre-exist.** Step 2 references `<AUDIT_ISSUE>`; the run
  fails to audit if the issue does not exist. Step 1 creates it first.
- **Actor-gate audit ordering.** The audit-write is `if: always()` and the
  outcome-computation step never fails, so a rejection (or a crash) still
  records; if an implementer instead makes the validation step `exit 1` on
  rejection, the `always()` audit still fires but the `exit 1` must live in the
  *final* step.
- **`edit-command` is operator-supplied arbitrary code under the minted token.**
  The dispatch input runs as a shell command in the sibling clone with
  `contents:write` on that sibling — a command-injection / arbitrary-edit vector
  distinct from the spec's "sibling content executed during edit" residual. It
  is bounded by the actor gate (G2) and the single-sibling contents-only token
  (G4): only an allowlisted dispatcher can supply it, and it can only write
  `contents` on the one validated sibling. The implementer must NOT expand the
  token scope to make a richer edit-command convenient; richer edits are a
  separate spec. Record this as a residual in the PR description.

## Execution

`release-engineer` or `staff-engineer` owns the workflow + doc (CI/policy
surface); the Step 5 dispatch needs a trusted-human or bot dispatch with the App
installed on the target sibling. Steps 1 → 2/3 → 4 in order; 5 after
merge-ready.

— Staff Engineer 🛠️
