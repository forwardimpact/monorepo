# Eval Corpus Manifest — Spec 1060

This document records the migration that converts the historical wiki into an
eval substrate against the redesigned protocol. The wiki at
`forwardimpact/monorepo.wiki` is a separate git repository from the monorepo,
so the migration commit lands on the wiki repo, not on this monorepo PR.

## Migration approach

`scripts/spec-1060-migrate-wiki.mjs` is the one-shot migration script. It
partitions over-budget weekly logs (≥501 lines) into `…-Www-partN.md` files,
backfills `### Decision` stubs into pre-contract dated entries, and flags
over-budget summaries for manual trim. Decision stubs name the migration
explicitly so a future reader sees the stub is historical, not contemporaneous.

The cap derivation (500 lines = ≤2.5% of a 1M-token context window) is shared
with `audit` via the constants in `libraries/libwiki/src/constants.js`.

## Deviation status (per plan-a-05.md § Spec deviation)

The plan envisioned bundling the migration into commit 05B. Because the wiki
content lives in a sibling repo, the migration is a separate operational step
run against `forwardimpact/monorepo.wiki`. The implementation PR ships:

- **05A (this commit)** — the migration script and this manifest.
- **05B (deferred to wiki-repo operation)** — running the script with
  `--apply` against the live wiki, committing the resulting partition / stub /
  compaction diff to the wiki repo, retiring the audit grace from
  `check-quality.yml`, and deleting the script.

Until 05B runs, the audit gate operates under the runtime-computed
`FIT_WIKI_AUDIT_GRACE_UNTIL=$(date -u -d '+30 days' +%Y-%m-%d)` window (Part
04 Step 1). The window stays warm across rebases — every CI run computes
today+30d — so summary and decision-block violations report as warnings and
do not block PRs.

This corresponds to the **partial-reject-backfill** approver path in
plan-a-05.md § Spec deviation: Step 2 partition is deferred, Steps 3 and 4
(decision-block backfill, summary compaction) are deferred. The migration
script is present at HEAD so a follow-up operational commit can run it
without re-recovery from git history.

## Dry-run snapshot (2026-05-19)

A `--dry-run` invocation against `forwardimpact/monorepo.wiki` HEAD at
2026-05-19 reported the following workload:

- **Partitioned:** 30 over-budget weekly logs → 84 part files.
- **Decision stubs:** 204 dated entries lacking `### Decision`.
- **Summaries flagged:** 3 (`improvement-coach.md` 86, `release-engineer.md`
  91, `staff-engineer.md` 103 — all under the strict cap before grace).

Re-derive at apply time; the migration is idempotent and re-runs as no-ops
once it has been applied once.

## Eval invariants (post-migration target state)

When 05B lands, the wiki satisfies:

- 21 weeks of data present (W14 through current week).
- Decision-block ratio: 100% post-migration (every dated entry leads with
  `### Decision` or a backfill stub).
- Weekly-log line distribution: max ≤500 lines per file.
- Summary line distribution: max ≤80 lines per `<agent>.md`.
- Active Claims at empty state (no inherited claims).
- Research-corpus pages (`wiki/memory-protocol-*-2026-05-16.md`) untouched
  (spec § Success Criteria row 13).

## Operational runbook for 05B

When the wiki migration is ready to land:

```sh
# 1. Run with --apply against the live wiki.
node scripts/spec-1060-migrate-wiki.mjs --apply --wiki-root /path/to/wiki

# 2. Commit the wiki diff in the wiki repo.
cd /path/to/wiki
git add -A
git commit -m "migrate: retroactive protocol compliance per spec 1060"

# 3. Push the wiki repo via fit-wiki push (or git push directly).
bunx fit-wiki push

# 4. Open a follow-up monorepo PR that:
#    - Removes the FIT_WIKI_AUDIT_GRACE_UNTIL export from check-quality.yml
#    - Deletes scripts/spec-1060-migrate-wiki.mjs
#    - Adds audit-baseline-post-1060.json (post-migration audit snapshot)
```

The audit gate will pass strictly against the migrated wiki — that is the
evidence that 05B succeeded.
