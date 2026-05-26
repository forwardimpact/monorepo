# Plan 0590-A Part 02 — Conformance Command

**Agent:** staff-engineer **Branch:** `spec/590-part-02-audit` from `main`
**Depends on:** part 01 merged to `main` **PR type:** `docs` (no runtime code —
audit script lives under `scripts/`)

## Goal

Add a mechanical conformance command named in the spec (success criterion 6):
`just wiki-audit`. It reports per-file pass/fail against the summary contract,
weekly log contract, and priority index schema that part 01 established. It is
the measurable definition of "done" for the content migration in part 03.

## Files

| Action | Path                    | Notes                                                         |
| ------ | ----------------------- | ------------------------------------------------------------- |
| Create | `scripts/wiki-audit.sh` | POSIX shell script — no Bun/Node dependency                   |
| Modify | `justfile`              | Add `wiki-audit` recipe directly after `wiki-push` (line ~16) |

`kata-wiki-curate/SKILL.md` is not touched by this part — the forward reference
added in part 01 resolves once this part lands. No verification step needed
beyond running `just wiki-audit` from the curate skill's new bullet, which part
03 will exercise.

## Step 1 — Write `scripts/wiki-audit.sh`

A Bash script (not POSIX — uses `shopt` for glob safety). Match the style of the
existing `scripts/wiki-sync.sh`. Shebang `#!/usr/bin/env bash` followed by
`set -euo pipefail` and `shopt -s nullglob`. No arguments; exits non-zero if any
check fails. Prints a one-line verdict plus per-failure detail.

**Summary-file identification.** A file is an "agent summary" if it matches
_all_ of the following: lives directly under `wiki/` (not in a subdirectory),
ends in `.md`, does not match the weekly-log pattern (`*-YYYY-Www.md`), is not
`MEMORY.md`, `Home.md`, or `storyboard-*.md`, **and** its first non-blank line
matches `^# .* — Summary$`. Files in `wiki/` that fail the "— Summary" H1 probe
(today: `downstream-skill.md`) are not audited against the summary contract.
This keeps the audit tight without hard-coding a file list.

Declare the permitted H2 set at the top of the script as a bash array so the
intent is singular and greppable:

```bash
permitted_summary_h2s=(
  "Open Blockers"
  "Observations for Teammates"
)
# Any H2 whose text is NOT in this list is considered an agent-specific
# state section — permitted but must appear before "Open Blockers".
```

Checks performed in order (each is a separate function; first-to-fail continues
so the operator sees all failures, not just the first):

### 1a. Summary contract — line budget

For each agent summary file (per the identification rule above):

- `wc -l "$file"` must be ≤ 80.
- Fail message: `FAIL budget: $file has $lines lines (limit 80)`.

### 1b. Summary contract — permitted sections and order

For each agent summary file:

- First non-blank line must match `^# [A-Z].* — Summary$`.
- File must contain a line starting with `**Last run**:`.
- Enumerate H2s in document order via `grep -n '^## '`. Verify:
  - If both `## Open Blockers` and `## Observations for Teammates` are present,
    `## Open Blockers` must appear first.
  - If any H2 not in `permitted_summary_h2s` (a state H2) appears after
    `## Open Blockers`, that is out of order.
- Fail message: `FAIL sections: $file missing $section` or
  `FAIL sections: $file sections out of order ($detail)`.

### 1c. Summary contract — excluded content (informational)

Warn (do not fail) if an H2 heading in a summary file matches any of these
extended regex patterns. Use `grep -E -n '^## ...' "$file"`:

```bash
excluded_h2_patterns=(
  '^## Previously Tracked'
  '^## Evaluation History'
  '^## Recently Closed'
  '^## Storyboard Commitments'
  '^## W[0-9]+ Day'
  '^## .*Outcomes \(20'
)
```

Warn message:
`WARN excluded: $file:$line contains $match (belongs in weekly log)`.

**Why warn and not fail:** 1a already fails any over-budget summary, and
over-budget summaries are almost always over-budget _because_ of excluded
content. Hard-failing on patterns would double-report the same underlying
violation and make the audit output noisier without changing the pass/fail
outcome. The warnings exist as a migration aid for part 03 (pointing the
technical-writer at the specific lines to trim) and for the curator's recurring
Step 1 check.

### 1d. Weekly log contract — filename and heading

For each file matching `wiki/*-[0-9][0-9][0-9][0-9]-W[0-9][0-9].md`:

- Filename matches `^wiki/[a-z-]+-20[0-9][0-9]-W[0-9][0-9]\.md$`.
- First non-blank line matches `^# .* — 20[0-9][0-9]-W[0-9][0-9]$`.
- Fail message: `FAIL weekly-log: $file $reason`.

### 1e. Priority index schema

For `wiki/MEMORY.md`:

- Must contain the exact H2 `## Cross-Cutting Priorities`.
- Under it, must contain the exact header row
  `| Item | Agents | Owner | Status | Added |`.
- Must contain at least one data row (empty-state row
  `| *None* | — | — | — | — |` counts).
- Active (status=`active`) rows must not exceed 10.
- Fail message: `FAIL memory: $reason`.

### 1f. Aggregate verdict

- If any FAIL line printed: `RESULT: fail (N checks failed)` then `exit 1`.
- Else: `RESULT: pass` then `exit 0`.

Warnings are always included in output regardless of verdict.

### Acceptance

- `bash scripts/wiki-audit.sh` runs in under 1 second on the current wiki.
- `echo $?` is non-zero because current wiki is non-conforming (summaries too
  long). This is expected and proves the audit detects real violations.
- The script does not need `bunx` / `npm` / `bun` — only `bash`, `wc`, `grep`,
  `awk`, `sed`.

## Step 2 — Add `wiki-audit` justfile recipe

Insert directly after the `wiki-push` recipe (currently lines 14–16). New
recipe:

```just
# Audit agent memory against the wiki contract
wiki-audit:
    bash scripts/wiki-audit.sh
```

Two lines added, no other changes to `justfile`. Verify `just --list` shows the
new recipe.

## Step 3 — Smoke checks

```bash
just wiki-audit   # expected: non-zero exit, prints specific failures
bun run format
bun run lint
```

Verify that the `bun run format` check passes for any markdown the script
touches (it touches none) and that `bun run lint` does not regress.

## Blast Radius

- 1 new file (`scripts/wiki-audit.sh`).
- 1 existing file modified by 2 lines (`justfile`).
- No changes to TypeScript/JavaScript code, no test files, no CI.

## Commit + PR

- One commit: `docs(scripts): add wiki-audit conformance command for spec 0590`
- Mark executable (`chmod +x scripts/wiki-audit.sh`) before commit.
- PR body references plan-a-02.md and links to part 01's PR.

## Risks specific to this part

- **False negatives (checks miss a violation type).** Mitigated by keeping the
  audit narrow: it checks the contract, not prose quality. Additional checks can
  be added in a later iteration without changing the contract.
- **False positives (valid summary fails a heuristic).** Most likely in 1b
  (section order). If an agent's legitimate state needs a section name outside
  the permitted list, the permitted list is what must change, not the skip list.
  The audit script must not silently tolerate unknown H2s — unknown H2s warn so
  part 03 can surface a budget-or-contract decision to a human.
- **`set -euo pipefail` + glob expansion with no matches.** Use
  `shopt -s nullglob` or the POSIX-safe loop pattern (`for f in $(find ...)`) to
  avoid the "no matches" trap. Document the chosen idiom at the top of the file.

## Non-goals

- No CI integration. `just wiki-audit` is a local command for the
  technical-writer's curate workflow. A Stop-hook or GitHub Actions job is out
  of scope for this spec (spec 0590 § Scope → Excluded: enforcement mechanism is
  a design decision; the design chose "curation step", not "CI gate").
- No auto-fix. The script only detects.
