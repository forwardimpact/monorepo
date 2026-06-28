# Plan 1440 — Re-ping cadence in `kata-release-merge`

Executes [design-a.md](design-a.md) for [spec.md](spec.md). All edits are to
the `kata-release-merge` skill markdown under
`.claude/skills/kata-release-merge/`. No code, no tests — the artifact is an
agent-read skill; verification is by reading the edited markdown against the
spec's three success criteria.

## Approach

Add a named **Re-ping Rule** as a new Step 9.5 in `SKILL.md` (fresh-query
staleness path per design D1, placed after merge per D2), carrying the
owner-taxonomy table; add a § Re-ping Comments section to
`references/templates.md` with one `state`/`owner`/`next_action` variant per
gate; add a `re-pinged` Action value to § Report Summary and Step 10. Writing
under `.claude/` may be blocked — use `bunx fit-selfedit <path>` if a direct
Edit is refused.

Libraries used: none.

## Step 1: Add the Re-ping Rule as Step 9.5 in SKILL.md

Insert a new `### Step 9.5: Re-ping Stale Blocked PRs` between Step 9 (Merge)
and Step 10 (Classification Report).

Files: modified `.claude/skills/kata-release-merge/SKILL.md`.

Content of the new step:

- One-paragraph intro naming the **Re-ping Rule** and its three parameters:
  (a) 3 calendar-day silence window; (b) fires on every release-merge run
  (scheduled sweep and on-demand single-PR run per § When to Use); (c) each
  re-ping resets the window from its own timestamp, so the next re-ping on the
  same PR is no sooner than 3 calendar days later (self-limiting, no separate
  bookkeeping).
- Candidate set: open PRs still **blocked** after Step 9 (a PR that passed all
  gates merged in Step 9 and is gone; a PR first-blocked this run stays a
  candidate but is filtered out by the window test below — there is no
  prior-run-membership check). For each candidate, read the most-recent bot PR
  comment timestamp:

  ```sh
  gh api repos/{owner}/{repo}/issues/<number>/comments \
    --jq '[.[] | select(.user.login == "kata-agent-team[bot]")] | last | .created_at'
  ```

  The REST `issues/<n>/comments` endpoint is the same conversation thread the
  open-comment gate reads (`comment-gate.md`); all of this skill's block,
  re-ping, and merge comments are posted via `gh pr comment`, which lands in
  that thread, so the most-recent bot comment there is the true silence anchor.
  The bot's `user.login` on this endpoint is `kata-agent-team[bot]` (verified
  against the live API); pin that string, not the `app/kata-agent-team` identity
  slug.

  Decision tree for each candidate:
  - **Most-recent bot comment older than 3 calendar days** → **due**: post the
    re-ping variant.
  - **No bot comment at all** → **due** (by-exception guarantee that every
    blocked PR carries one owner-named comment). In practice this is rare:
    Steps 2–8 of this same run post a first-block Skip Comment, so a PR blocked
    this run normally already has a fresh bot comment.
  - **Most-recent bot comment within 3 calendar days** (includes the
    first-block Skip Comment Steps 2–8 just posted) → **not due**: skip.

  When due, post the re-ping variant for the PR's block reason **already
  computed in this run's Steps 2–8** — do not re-run the gates and do not
  re-query `gh pr checks`; the failing-check list and reason carry from the
  run's own classification.
- The per-gate owner taxonomy table, six rows, columns copied verbatim from
  spec § Per-gate owner taxonomy (`Gate (attribute)` / `Gate (block reason)` /
  `owner role on the re-ping`). One line states which gates resolve the role to
  a concrete login and which stay role-only: the **open comments** gate
  resolves to the named unresolved-concern author via `comment-gate.md`; the
  **trust** / **type** / **approval** gates name a role drawn from the Step 2
  top-7 list but resolve to no single login (stay role-level); the **CI** /
  **mechanical readiness** gates resolve to the PR author. No new resolution
  logic.

Verification: `SKILL.md` shows a named Re-ping Rule whose three stated
parameters are window length, trigger scope, and reset-on-fire (success
criterion 1).

## Step 2: Add § Re-ping Comments to templates.md

Files: modified `.claude/skills/kata-release-merge/references/templates.md`.

Add a `## Re-ping Comments` section after `## Skip Comments`. It opens with one
sentence: these variants are posted by the **Re-ping Rule** (SKILL.md Step 9.5)
when a blocked PR's silence window has expired. Then one fenced `gh pr comment`
variant per gate (six total), each `--body` containing three named sections so
the criterion can spot-check them. Use a compact labeled-line form:

```sh
# CI Failing (re-ping)
gh pr comment <number> --body "$(cat <<'BODY'
Release merge re-ping (gate still open >3 days):
- state: CI failing — checks <failing-checks> still red.
- owner: the PR author (agent or human).
- next_action: push a fix for the failing checks; the next sweep re-checks.
BODY
)"
```

Provide the analogous variant for each of the six gates, with the `owner` line
matching the taxonomy:

| Gate | block reason | `owner` line |
| --- | --- | --- |
| trust | Untrusted Author | a trusted human (top-7 contributor) who can review |
| type | Unsupported PR Type | a trusted human who can re-title or close the PR |
| CI | CI Failing | the PR author (agent or human) |
| mechanical readiness | Substantive Conflict | the PR author |
| approval | Awaiting Approval Signal | a trusted human who can apply the approval signal |
| open comments | Awaiting trusted-contributor reply | the named trusted-contributor whose comment remains open |

Each variant's `state` line names the current gate state; each `next_action`
line names the single unblocking action. Placeholders such as
`<failing-checks>` in the `state` line are filled from the PR's block reason
already computed in this run's Steps 2–8 (Step 9.5 does not re-run the gates),
not from a fresh query at re-ping time.

Verification: `references/templates.md` § Re-ping Comments shows six variants;
each body has `state` / `owner` / `next_action` headers and references the
Re-ping Rule; spot-checking one variant per gate, the `owner` line matches the
taxonomy row (success criterion 2).

## Step 3: Add the `re-pinged` action category

Files: modified `.claude/skills/kata-release-merge/references/templates.md`
(§ Report Summary) and `.claude/skills/kata-release-merge/SKILL.md` (Step 10).

- In § Report Summary, add a `re-pinged` example row to the table (distinct
  `Action` value, separate from `blocked`) and one sentence: a PR re-pinged
  this run reports `Action = re-pinged`, one row per re-pinged PR; a blocked PR
  inside its silence window stays `blocked`.
- In SKILL.md Step 10, add `re-pinged` to the per-PR verdict vocabulary
  alongside `merged` / `blocked`.

Verification: Step 10 and § Report Summary show a `re-pinged` action category
separate from `blocked`, one row per re-pinged PR (success criterion 3).

## Step 4: Update Memory section reference

Files: modified `.claude/skills/kata-release-merge/SKILL.md` (§ Memory: what to
record).

The PR classification table bullet already lists verdict; add `re-pinged` is a
verdict value and note the table records no maintained last-comment timestamp
(design D1 — staleness comes from the fresh comments query, not the table). One
line; do not add a timestamp column.

Verification: the Memory section names `re-pinged` as a verdict and states the
table carries no timestamp column.

## Risks

- **Bot login string.** The `--jq` filter pins `kata-agent-team[bot]`, the
  `user.login` the REST `issues/<n>/comments` endpoint returns for this app
  (verified live in Step 1). It is **not** the `app/kata-agent-team` identity
  slug the spec/design name; the slug would silently match nothing and suppress
  every re-ping. Anyone editing the filter must keep the `[bot]` form.
- **"Calendar day" vs 72 hours.** The window is 3 *calendar* days, not 72
  hours. The implementer should keep the prose as "3 calendar days" and not
  introduce an hour-based computation that drifts across timezones.

## Execution

Documentation-shaped change to skill markdown — route to `technical-writer` or
an engineering agent, sequential Steps 1→4. The steps touch two files with no
inter-file ordering constraint beyond Step 3 spanning both; not worth
decomposing or parallelizing.

— Staff Engineer 🛠️
