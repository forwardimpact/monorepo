# Plan 1060 Part 04 — CI Wiring, Stop-hook, Cutover, Verification

Lands the mechanical enforcement that the protocol now mandates, retires
the legacy audit script, prepares the wiki for the 2026-W23 cutover,
files the JTBD follow-up issue, and collects the post-merge trace
sample. Depends on Parts 01–03 — the audit primitive must exist, the
protocol must name it, and the agent profiles must invoke `boot` /
`log` before this part installs the gating.

Libraries used: none. Workflow, justfile, and wiki edits, plus a single
manual issue file.

## Step 1 — Wire `fit-wiki audit` into pre-merge CI

Identify the host workflow at implementation time:

```sh
rg -l 'on:.*pull_request' .github/workflows/
```

`check-quality.yml` is the planning-time candidate; verify before
editing.

Modified: `.github/workflows/<host>.yml`. Place the audit step inside
an existing job (e.g. `quality`) after the lint/test steps. **Compute
the grace date at workflow runtime, not commit time** — a literal
date drifts as the PR sits open while CI runs against stale rebases:

```yaml
      - name: Wiki audit
        run: |
          export FIT_WIKI_AUDIT_GRACE_UNTIL=$(date -u -d '+30 days' +%Y-%m-%d)
          bunx fit-wiki audit
```

Every workflow run computes a fresh `today + 30d` window. The grace
expires deterministically 30 days after the *workflow* runs, not 30
days after some long-ago commit. The window stays active for as long
as the per-commit CI keeps running, which is the right semantics for
a PR-lifecycle gate.

Part 05 commit 05B retires the variable by **removing the `export`
line entirely** (Step 6). After 05B lands, the audit step reduces to
`bunx fit-wiki audit` with no grace, running in strict mode against
the migrated wiki.

If Part 05 is dropped per the user-deviation rejection path, the
audit step's runtime-computed grace becomes permanent — the line
above stays in the workflow and every CI run gets a rolling 30-day
window. The follow-up spec named in plan-a-05.md § Spec deviation
owns the closure.

Pre-cutover weekly logs are exempt by the cutover check inside `audit`
itself. The grace var covers existing summary-budget and decision-block
violations until Part 05's migration remediates them mechanically.

Verification:
- `rg "FIT_WIKI_AUDIT_GRACE_UNTIL" .github/workflows/` returns the runtime-computed `export` line, not a literal date and not a `${{ env.* }}` reference.
- A deliberate test commit that adds an 81-line agent summary passes CI under the grace window (audit reports finding but exits 0). Revert before merge.

## Step 2 — Stop-hook entry installation

Two paths, exactly one runs in this part:

- **If the implementation environment has `bunx fit-wiki init` available
  before merge** (i.e. Part 01 is on the same branch already): run
  `bunx fit-wiki init` once during the implementation. It is idempotent
  (Part 01 Step 8). The diff to `.claude/settings.json` is committed
  in this part.
- **If `init` is not safely runnable here** (e.g. wiki repo not
  cloneable in the sandbox): hand-write the same diff to
  `.claude/settings.json`. Add `{ "type": "command", "command": "bunx
  fit-wiki audit" }` to the `hooks.Stop[0].hooks` array, keeping the
  existing `just wiki-push` entry first.

The committed `.claude/settings.json` diff is the contract; the path
chosen does not affect the outcome.

Verification: `jq '.hooks.Stop[0].hooks' .claude/settings.json` shows
both the existing `just wiki-push` and the new `bunx fit-wiki audit`
entries.

## Step 3 — Retire `scripts/wiki-audit.sh`

Orphan-caller scan first:

```sh
rg -n 'wiki-audit\.sh|scripts/wiki-audit' \
   .github/ .claude/ products/ services/ libraries/ scripts/ \
   CONTRIBUTING.md KATA.md README.md justfile
```

Expected hits at planning time: `justfile:20` (recipe) and
`scripts/wiki-audit.sh:3` (self-reference in usage comment). Anything
else is an orphan that needs migration to `bunx fit-wiki audit` in this
step.

Deleted: `scripts/wiki-audit.sh`.

Modified: `justfile`. Replace the `wiki-audit` recipe body with
`bunx fit-wiki audit`. Keep the recipe — the typed entry point is part
of the developer interface (mentioned in `CONTRIBUTING.md` and
`kata-wiki-curate` SKILL); Part 03 rewrites those callers but the
recipe stays as the canonical convenience handle.

Verification:
- `just wiki-audit` runs and produces a RESULT line.
- `git log --follow scripts/wiki-audit.sh` shows the deletion commit.
- Orphan-caller rg above returns zero hits post-edit (excluding the deletion-commit reference itself).

## Step 4 — Cutover-window verification (no pre-cutover rotation)

Pre-cutover weekly logs are exempt from the 500-line cap (spec §
Success Criteria row 5: "Pre-cutover logs are exempt and remain
as-is"). **Do not** rotate W22 or earlier files — modifying them
violates the append-only-audit invariant for that period and
contradicts the exemption.

This step is normally a no-op. The only verification is:

```sh
for f in wiki/*-2026-W2[3-9].md wiki/*-2026-W[3-5][0-9].md \
         wiki/*-202[7-9]-W*.md; do
  [ -f "$f" ] || continue
  l=$(wc -l < "$f")
  [ "$l" -gt 500 ] && echo "OVER-BUDGET $f $l"
done
```

(Bash glob misses are tolerated by the `-f` test; the loop only fires
for files that exist.)

If a post-cutover file exceeds the cap on merge day — meaning a writer
appended without going through `log` / `rotate` — that is a CI failure
(audit check #1) not a manual rotation. Fix the writer, not the file.

Verification: no `wiki/*-2026-W23.md` or later file exceeds 500 lines
on merge (asserted by `audit` in CI; this step is the documentation
that the check is sufficient).

## Step 5 — Documentation: cap rationale in protocol

Confirmed in Part 02 Step 1 (the rationale paragraph cites the
2.5%-of-1M-tokens anchor). Step 5 here is the cross-link from CLI
help: ensure `fit-wiki audit --help` and `fit-wiki rotate --help`
mention the 500-line cap and the cutover date. One-line description
update each in `bin/fit-wiki.js` (already drafted in Part 01 Step 9;
this step verifies it landed).

Verification: `node bin/fit-wiki.js audit --help` prints a description
mentioning the cap.

## Step 6 — File JTBD follow-up issue

The spec (lines 112–119) commits to filing
`JTBD.md gap: Teams Using Agents persona missing` "at the same time
the spec PR opens". Since the spec PR has already merged, file it now
from this implementation PR's branch.

First check for an existing open issue with the same title:

```sh
gh issue list --search "JTBD.md gap: Teams Using Agents persona missing" \
  --state open --json number,title
```

If one exists, skip the rest of this step and record the existing
issue number in the PR description. Otherwise file:

```sh
gh issue create \
  --title "JTBD.md gap: Teams Using Agents persona missing" \
  --body "Per spec 1060 § Personas and Job: JTBD.md does not carry a
\`<job user=\"Teams Using Agents\">\` entry. Spec 1060 verified
against the Big Hire (\"run a development team that keeps getting
better\") and Little Hire (\"boot, read, decide, work, write, exit\")
named in that section — this issue tracks landing the missing JTBD
entry. See specs/1060-memory-protocol-redesign/spec.md." \
  --label "spec,documentation"
```

The implementation commit message references the issue number with
"Per spec 1060 carry-over commitment — JTBD follow-up filed as #NNN"
so reviewers can trace the carry-over to the spec line.

Verification: `gh issue view <NNN>` returns the filed issue; its body
links to spec 1060.

## Step 7 — Collect post-merge trace sample (success criterion row 4)

Spec § Success Criteria row 4 requires "at least 8 runs — comprising
at least 3 React-mode participant runs and at least 3 direct skill
invocations across at least 3 distinct agents — show the named priority
surface opened in each run's first ten tool calls" and "the sample is
… posted as a PR comment on the implementation PR; the implementation
does not merge until the sample passes."

Order of operations. Note the spec says "the implementation does not
merge until the sample passes" — interpret pragmatically: the PR is
open and reviewed, but the release engineer holds the merge until the
trace-sample comment lands.

1. Push Parts 01–04 to `feat/memory-protocol-redesign` and open the PR.
2. The audit CI gate runs immediately under the grace window; reviewers
   approve.
3. Run the agent fleet via `workflow_dispatch` triggers on
   `.github/workflows/agent-team.yml` (covers all 6 domain agents) and
   on `agent-react.yml` (covers React-mode). Two scheduled cycles plus
   one dispatched cycle per mode reach the ≥8 / ≥3 / ≥3 thresholds in
   under 24h without waiting for natural cadence.
4. Ingest the resulting traces. The trace CLI in this repo is
   `libraries/libeval/bin/fit-trace.js` (invoke via
   `bunx fit-trace ...`). If `fit-trace` does not expose a per-run
   first-N-tool-events filter, fall back to reading the raw NDJSON
   traces directly from wherever they persist (`wiki/traces/` or the
   `libeval` trace store; locate at implementation time with
   `rg -l 'tool_use' wiki/ libraries/libeval/`). The success criterion
   accepts either form.
5. For each run, check whether the first 10 tool events contain one of:
   `Read` of `wiki/MEMORY.md` OR `Bash` invoking `fit-wiki boot`.
6. Aggregate to ≥3 React-mode + ≥3 direct skill invocations + ≥3
   distinct agent identities + ≥8 runs total. If a category falls
   short, dispatch more runs and re-aggregate.
7. Post the aggregated table as a PR comment on the implementation PR:

   ```
   ## Spec 1060 verification trace sample
   Window: <start> → <end>
   Runs: N (M React-mode, K direct)
   Distinct agents: ...
   | run-id | mode | agent | tool-1..10 contains MEMORY.md or fit-wiki boot |
   |---|---|---|---|
   | ... | ... | ... | yes |
   ```

8. Notify `kata-release-merge`. The release engineer's gate sees the
   passing sample comment and the `audit` check green; the PR merges.
9. If the 48h post-dispatch window fails to accumulate ≥3 React-mode
   runs (low PR-comment volume) — open a labelled `agent:test` issue
   that triggers `agent-react` dispatch directly, until the count is
   reached.

Verification: PR comment landed; merge gate passes; the sample shows
the 0-of-8 finding does not recur (spec § Success Criteria row 4
satisfied).

## Step 8 — Final clean-up and STATUS

After merge:

- The implementation PR description carries the JTBD issue number from
  Step 6 and the trace-sample comment URL from Step 7.
- `wiki/STATUS.md`: the spec's row advances to `plan implemented` per
  `kata-implement`'s normal closeout (not in this plan's scope —
  recorded here for completeness).

## Risks (Part 04 only)

- **CI workflow name discovery.** `check-quality.yml` is the assumed
  host for the audit step but verify with `rg -l 'on:.*pull_request' .github/workflows/`
  at implementation time. Place the step in the same job as the test
  step so a failed audit blocks merge alongside test failures.
- **Grace-window date drift mitigated by runtime computation.** Step 1
  computes `FIT_WIKI_AUDIT_GRACE_UNTIL` inside the workflow at run
  time, not at commit time, so per-commit CI on rebases and on PRs
  that sit open for weeks does not silently expire the grace. Part 05
  Step 6 retires the export line entirely.
- **Trace ingestion path discovery.** The trace CLI is at
  `libraries/libeval/bin/fit-trace.js`; if its filters do not match the
  Step 7 use case, fall back to raw NDJSON.
- **agent-react dispatch volume.** React-mode runs only fire on PR /
  Discussion comments, so the 3-React-mode floor may not naturally
  accumulate in 24h. Step 7 names the labelled-issue trigger as the
  fallback; reach for it after 24h, not earlier.
- **JTBD issue duplication.** Step 6 explicitly searches before
  filing — the spec's commitment is "open an issue", not "open it
  twice".
