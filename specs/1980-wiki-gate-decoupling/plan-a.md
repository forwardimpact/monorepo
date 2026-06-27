# Plan 1980 — decouple the per-PR `wiki` gate from shared wiki state

Execution plan for [design-a.md](design-a.md) (spec [spec.md](spec.md)).

## Approach

Re-point the `wiki` commit-status check from a live `.wiki` audit to the
committed libwiki audit-rule tests (a `wiki:rules` package script), drop the
shared-state audit from the composite `check`, move the shared-state verdict to
a new scheduled `curate-wiki.yml` that audits read-only and routes findings to
one idempotent labeled issue, and document the surfaces, cadence, and gate
meaning. Clean break: no live-HEAD audit survives in any PR or `main` gate.

Libraries used: libwiki (`fit-wiki audit`, audit-rule tests).

## Steps

### 1. Add the `wiki:rules` script and drop the shared-state audit from `check`

Intent: give the gate a content-stable target and stop the composite check from
auditing shared state.
Files modified: `package.json` (root).

- Add script: `"wiki:rules": "bun test libraries/libwiki/test/audit-"`.
  `bun test` treats positional args as path-substring filters (not shell globs),
  so this selects every `libraries/libwiki/test/audit-*.test.js` file
  deterministically — independent of shell glob expansion — and any future
  `audit-*` test rides along (verified: the substring selects the four current
  `audit-cli|engine|rules|status-row` files).
- Change `"check"` from `… && bun run context && bun run wiki` to
  `… && bun run context` (drop the trailing `&& bun run wiki`).
- Leave `"wiki"` (`bunx fit-wiki audit`) and `"wiki:fix"` unchanged.

Verify: `bun run wiki:rules` passes; `bun run check` no longer invokes
`fit-wiki audit` (grep the resolved script).

### 2. Re-point the `wiki` job at `wiki:rules` (PR + push to `main`)

Intent: the per-PR and push-to-`main` `wiki` check exercises rule code over
fixtures, never the live wiki.
Files modified: `.github/workflows/check-context.yml`.

Replace the `wiki` job body so it no longer checks out the `.wiki` repo:

```yaml
  wiki:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6
      - uses: forwardimpact/fit-bootstrap@22e7a8a053c22cf56d6f4efb95fcf0b3d42267c8 # v1
      - run: bun run wiki:rules
```

Verify: the job has no `Checkout wiki` step and no `repository: ….wiki`; the
workflow still parses (`actionlint` if available, else YAML lint).

### 3. Add the scheduled curation workflow

Intent: the shared-state audit runs on a defined daily cadence and routes
findings to one labeled issue; no agent and no sibling action run in CI.
Files created: `.github/workflows/curate-wiki.yml`.

Reuse the per-PR `wiki` job's existing read-only `.wiki` checkout (plain
`actions/checkout`, no App token) and run `bunx fit-wiki audit` directly so the
audit JSON is captured in-job — no `fit-wiki@v1` action-output boundary. The
workflow:

```yaml
name: Curate wiki
on:
  schedule:
    - cron: "0 6 * * *" # daily 06:00 UTC
  workflow_dispatch:
permissions:
  contents: read
  issues: write
concurrency:
  group: curate-wiki
  cancel-in-progress: false
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6
      - uses: forwardimpact/fit-bootstrap@22e7a8a053c22cf56d6f4efb95fcf0b3d42267c8 # v1
      - name: Checkout wiki (read-only)
        uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6
        with:
          repository: ${{ github.repository }}.wiki
          path: wiki
      - id: audit
        run: |
          set +e
          out="$(bunx fit-wiki audit --format json)"; code=$?
          set -e
          delim="EOF_$(openssl rand -hex 8)"  # random delimiter — audit JSON is untrusted text
          { echo "json<<$delim"; printf '%s\n' "$out"; echo "$delim"; } >> "$GITHUB_OUTPUT"
          echo "dirty=$([ $code -ne 0 ] && echo true || echo false)" >> "$GITHUB_OUTPUT"
      - name: Route findings
        if: steps.audit.outputs.dirty == 'true'
        env:
          GH_TOKEN: ${{ github.token }}
          FINDINGS: ${{ steps.audit.outputs.json }}
        run: |
          gh label create wiki-curation --color BFD4F2 \
            --description "Shared-wiki audit findings from scheduled curation" 2>/dev/null || true
          title="Wiki curation: shared-state audit findings"
          body=$'Scheduled `curate-wiki` audit found shared-wiki violations. Owner: technical-writer (service via the curation shift).\n\n```json\n'"$FINDINGS"$'\n```'
          num="$(gh issue list --search "$title in:title" --state open --json number --jq '.[0].number')"
          if [ -n "$num" ]; then
            gh issue comment "$num" --body "$body"
          else
            gh issue create --title "$title" --body "$body" --label wiki-curation
          fi
```

Key points: `set +e` captures the non-zero exit `fit-wiki audit` returns on
findings so the routing step still runs; the `dirty` flag (not stdout parsing)
gates routing; `github.token` carries `issues: write`; `concurrency` serializes
the check-then-create; no `fit-wiki fix` (agent SDK refuses bypass-permissions
as root — the fix loop stays in the technical-writer shift).

Verify: a `workflow_dispatch` run against a deliberately dirtied wiki fixture
creates exactly one issue; a second dispatch comments on the same issue rather
than opening a second.

### 4. Document surfaces, gate meaning, and cadence

Intent: the gate's meaning, the wiki-coupled surfaces, and the cadence are
documented in monorepo-local homes. Files modified:
`.github/workflows/check-context.yml`; `.claude/agents/technical-writer.md`.

- `.github/workflows/check-context.yml`: a comment block beside the `wiki` job
  with (a) the wiki-coupled-surface list (`libraries/libwiki/**`; the
  `wiki`/`wiki:rules` scripts; `.github/workflows/check-context.yml`), and (b)
  the gate-meaning paragraph from design-a § Gate meaning. (Spec § Scope permits
  this workflow-adjacent home; `.github/CLAUDE.md` has no instruction-budget
  headroom, so the doc lands here rather than there.)
- Technical-writer agent profile: one line stating the shared-state audit runs
  daily via `curate-wiki.yml` and that the curator services its routed
  `wiki-curation` issues. The exact cron value (06:00 UTC) lives once, in
  `curate-wiki.yml`.

Verify: the gate doc answers "what does a red `wiki` check mean / who owns
shared-state findings" without referencing the spec; the agent profile line
names the cadence and points at `curate-wiki.yml`.

## Risks

- `.claude/**` writes (step 4 agent profile) may be gate-blocked — use
  `bunx fit-selfedit` per CLAUDE.md if a direct edit is refused, on a non-`main`
  branch.
- The `curate-wiki.yml` issue step needs `issues: write` and the repo has no
  prior issue-writing workflow, so org "Actions → workflow permissions / token
  can create issues" policy may block it. Exercise the issue-create path at the
  `workflow_dispatch` verify step (against a dirtied fixture) before relying on
  the cron — a block then surfaces immediately, not on the first silent 06:00
  tick.

## Execution

Single engineering agent, sequential. Steps 1→2 are coupled (script then the
gate that runs it); step 3 (curation workflow, label created inline) is
independent of 1–2; step 4 is documentation and runs last. No part is
independently parallelizable in a way that saves wall-clock given the shared
`package.json` and workflow surfaces.

— Staff Engineer 🛠️
