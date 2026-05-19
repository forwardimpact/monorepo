# Plan 1060 — Memory Protocol Redesign

## Approach

`fit-wiki` becomes the agent's memory surface before the protocol cites it.
Land the CLI primitives first (Part 01), then rewrite the protocol and seed
`MEMORY.md ## Active Claims` so the contracts have implementations
(Part 02), then update every citation across agent profiles and skills so
the read/write asymmetry that fed F11 cannot reappear (Part 03), then wire
mechanical enforcement under a runtime-computed rolling grace window
(Part 04), then retroactively migrate the existing wiki via a temporary
one-shot script that self-deletes in the same commit that produces its
output (Part 05). The spec mandates the protocol and the CLI ship together;
they share one PR series on a single `feat/memory-protocol-redesign`
branch with commits ordered 01 → 02 → 03 → 04 → 05A → 05B. 05A adds the
temporary migration script; 05B runs it, deletes it, retires the audit
grace, and writes the eval-corpus manifest — atomically in one commit.

Part 05 is a **user-directed deviation from spec § Out of scope**
("Backfill of past weekly logs to the new contract"). The spec disclaims
backfill so the redesign can ship with the cutover-only contract; the user
adds Part 05 to convert the existing wiki into the high-fidelity eval
corpus the system will be measured against. The deviation is documented
in plan-a-05.md § Spec deviation (which lifts both concrete deviations —
backfill and sealed-file deletion — and names the four approver paths:
accept, wholesale rejection, partial-deletion rejection, partial-backfill
rejection) and reflected in this plan's Risks.

Libraries used: `@forwardimpact/libcli` (createCli),
`@forwardimpact/libutil` (Finder), `@forwardimpact/libharness` (test
helpers). No new dependencies.

## Parts Index

| Part | Title | Depends on | Scope |
|---|---|---|---|
| [01](plan-a-01.md) | libwiki CLI primitives | — | Add `boot`, `log {decision\|note\|done}`, `claim`, `release`, `inbox {list\|ack\|promote\|drop}`, `rotate`, `audit`; modify `init`; extend `refresh`. Tests for each. |
| [02](plan-a-02.md) | Protocol rewrite and MEMORY.md schema | 01 (primitive names must exist) | Rewrite `memory-protocol.md` to specify CLI contracts; add `## Active Claims` and `## Cross-Cutting Priorities` symmetry to `wiki/MEMORY.md`; update `KATA.md`, `CONTRIBUTING.md`, and `coordination-protocol.md` cross-references; produce citation inventory. |
| [03](plan-a-03.md) | Agent profile + skill citation updates | 02 (protocol headings must be final) | Update Step 0 in 6 agent profiles to mandate `Read MEMORY.md` then `fit-wiki boot`; update 11 skills citing memory-protocol; update `fit-wiki` SKILL and `kata-wiki-curate` SKILL. |
| [04](plan-a-04.md) | CI wiring, Stop-hook install, verification | 01–03 (and re-invokes Part 01's `init`) | Wire `fit-wiki audit` into pre-merge CI; install Stop-hook via `init`; delete `scripts/wiki-audit.sh`; file follow-up issue for JTBD gap; collect 8-run trace sample for spec § Success Criteria row 4. |
| [05](plan-a-05.md) | Retroactive wiki migration (eval corpus) | 01–04 (uses constants from Part 01; shells out to `bunx fit-wiki rotate` for the current week only) | Run a one-time migration via **temporary script `scripts/spec-1060-migrate-wiki.mjs`** (added in 05A, self-deletes in 05B — no permanent CLI surface for a one-shot operation). Partitions 31 over-budget weekly logs into `-partN.md` files, compacts over-cap summaries (Step 4's compaction-backfill stub is the third backfill site), backfills `### Decision` stubs in ~140 dated entries that predate the contract, retires the audit grace window. The migrated wiki becomes the eval substrate for measuring the system against a realistic historical corpus. **Two-part deviation** (backfill + sealed-file deletion) — see plan-a-05.md § Spec deviation for the four approver paths. |

## Cross-Cutting Concerns

- **Stable digest contract.** Part 01 freezes the `boot` JSON schema; Parts
  02 and 03 rely on it. Schema changes after this redesign require a
  follow-up spec (design § Trade-offs).
- **Cutover date 2026-W23 (Mon 2026-06-01).** Pre-cutover weekly logs are
  exempt from the 500-line cap. The `audit` cap check skips files whose
  ISO week predates 2026-W23. Part 04 ships before the boundary so the
  rotation primitive is in place when the first post-cutover write fires.
- **First-run audit grace (design § CLI Surface).** `audit` reports
  existing violations on its first run but does not fail the gate; 7-day
  remediation window begins on PR merge. Part 04 wires this with an
  environment variable read at audit time so the grace window is
  observable in trace.
- **Append-only audit preserved.** Part 01's `log` and `rotate` only
  append or rename — no in-place edits. Tests in each subcommand assert
  no `writeFileSync` to existing file content other than appends or the
  rename-then-create rotation.
- **Run-from-anywhere via Finder.** Every new subcommand resolves
  `projectRoot` via `Finder.findProjectRoot(process.cwd())` before any
  filesystem access (design § Cross-cutting choices). Tests assert
  invocation from a subdirectory works.
- **No changes to `memo`, `push`, `pull`.** Design retains them
  unchanged. Tests for these commands stay untouched.

## Risks

- **Stop-hook entry installation touches `.claude/settings.json`.** A
  manual entry already exists for `just wiki-push`. `init` must merge,
  not overwrite. Part 01's `init` change uses a structured read-modify-
  write of the JSON; a hook with the same `command` string is treated as
  present and skipped. The settings file may also be absent on a fresh
  install — `init` creates a minimal `{ "hooks": { "Stop": [...] } }`
  shell in that case.
- **Per-run audit cost.** The Stop-hook installed by Part 01 runs
  `fit-wiki audit` on every agent run, materially adding to per-run
  cost. The audit is pure-JS (Part 01 Step 6) and reads <100 small
  files; benchmarked at <500ms locally. Surface this regression in the
  PR description so reviewers see it.
- **`boot` reading large `{self}.md`.** A summary at 106 lines (current
  `release-engineer.md`) sits well under the Read-cap, but the digest
  parser must tolerate files with non-standard H2 ordering (audit-grace
  cohort). Test the digest against a pre-redesign 106-line summary.
- **Active Claims write race.** Two `claim` calls within the same second
  can produce duplicate rows. Mitigation: `claim` reads, checks for an
  existing row with the same `(agent, target)`, and refuses with exit
  code 2 if one is present. `release` is idempotent — absence is
  success.
- **`refresh` against an unreachable `gh`.** Design § Trade-offs accepts
  empty marker blocks with stderr warning. Test the empty-`gh` path so
  XmR rendering stays intact when `gh issue list` fails.
- **Audit grace window mechanism.** Part 04 Step 1 computes
  `FIT_WIKI_AUDIT_GRACE_UNTIL` at workflow runtime (`date -u -d '+30
  days' +%Y-%m-%d`) inside the audit step's `run:` block, not as a
  committed literal. This avoids per-commit CI failing on rebases or
  long-open PRs (the variable always resolves to a fresh 30-day
  window). Part 05 commit 05B retires the variable by removing the
  `export` line entirely.
- **Trace sample (success criterion row 4) is post-merge.** The 8-run
  trace sample is a verifier commitment, not a code artifact. Part 04
  defines the collection protocol; the implementation PR does not merge
  until the sample is posted. If the post-merge window fails to
  accumulate ≥3 React-mode runs in 48h, Part 04's Risks describe the
  manual-dispatch fallback.
- **Spec deviation: two concrete cases, four approver paths.** Spec §
  Out of scope explicitly disclaims backfill of past weekly logs.
  Part 05 makes two concrete deviations from that — (1) backfill of
  past weekly logs (Steps 2, 3, 4 — Step 4's compaction emits its
  own decision stub, so the deviation covers compaction too), and (2)
  deletion of the original sealed `<agent>-YYYY-Www.md` files post-
  partition. The deviations are documented in plan-a-05.md § Spec
  deviation, which enumerates four approver paths: accept; wholesale
  reject (drop Part 05; grace becomes rolling-30d permanently);
  partial-reject-deletion (rename to `-archive.md` instead of delete);
  partial-reject-backfill (Step 2 partition only, no Step 3/4 stubs).
  Surface the four-path trade-off in the PR description so the
  approver picks one explicitly.

## Execution Recommendation

Sequential on a single `feat/memory-protocol-redesign` branch, one
commit per Part (with Part 05 split into 05A and 05B), executed by
`staff-engineer` via `kata-implement`. Parallelism within Part 01
(independent subcommand files) is acceptable inside one commit. Parts
02 and 03 stay as separate commits — the reviewer split below pivots
on the commit boundary, so collapsing them would muddle the review
panel composition. Part 04 installs the audit gate under a runtime-
computed rolling grace window. Part 05's commit 05A adds the
temporary migration script (~200-line Node ESM, fully reviewable);
commit 05B runs the script, captures its mechanical output (the bulk
of the diff), retires the audit grace, writes the eval-corpus
manifest, and deletes the script — atomically.

The `technical-writer` agent is the natural reviewer for Part 02's
protocol rewrite via `kata-review`; engineering reviewers cover Parts
01, 03, and 04. Part 05 needs both perspectives — a technical-writer
review of commit 05A's script and 05B's backfill stubs (do they
preserve readability without fabricating history?) and an engineering
review of the migration script (idempotence, dry-run parity, git
history shape).

## References

- [Spec 1060](spec.md)
- [Design A](design-a.md)
- [Current memory-protocol.md](../../.claude/agents/references/memory-protocol.md)
- [libwiki](../../libraries/libwiki/)
- [scripts/wiki-audit.sh](../../scripts/wiki-audit.sh) — absorbed by Part 04
