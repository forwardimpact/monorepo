# Plan 2090-b, Part 03: Re-point the kata-* skills

Replace every in-scope tracker call-site in the kata-* skills and their
references with an operation name plus a link to `work-trackers.md`. Depends on
Part 01. Scope boundary (what counts, and the `kata-setup` exclusion) is in
[plan-b.md](plan-b.md) § Scope boundary. Conventions: [plan-b.md](plan-b.md).

Libraries used: none.

Each step replaces the file's in-scope `gh`/remote-git shapes with operation
names + `../../agents/references/work-trackers.md`, leaving out-of-scope
commands (`gh secret`, `gh run`, `git fetch origin main`, tag/wiki pushes,
commit-SHA verification) untouched. The github realization of each removed shape
must already exist in the matrix github column (Part 01, Step 3); add any
missing shape there.

## Step 1 — `kata-release-merge`

Files: modify `SKILL.md`, `references/templates.md`,
`references/reping-rule.md`, `references/comment-gate.md`,
`references/announcement-backstop.md`.

Change: `gh pr comment/view/merge/checks/close`, `gh issue comment/view`,
`gh api repos/.../pulls` → `comment` / `read` / `merge-change` / `close` /
`list`; `git push --force-with-lease origin <pr-branch>` (rebase) →
`update-change`. Keep `gh api repos/.../actions` and `gh run list` (CI
introspection) and `git fetch origin main`.

Verification: criterion-2 grep over these files returns zero hits.

## Step 2 — `kata-security-update`

Files: modify `SKILL.md` (and `references/metrics.md` via Step 6).

Change: `gh pr create/merge/close/comment`, `gh pr view/diff/list` →
`open-change` / `merge-change` / `close` / `comment` / `read` / `list`;
`git checkout -b … origin/<branch>` + `git push -u origin …` → `open-change`;
route `gh api .../pulls|issues` reads through `list`/`read`. Leave security
advisory / Dependabot-alert `gh api` reads and CI-run reads in place — they are
outside the criterion-2 set.

Verification: criterion-2 grep over `SKILL.md` returns zero hits.

## Step 3 — `kata-product-issue`

Files: modify `SKILL.md`, `references/templates.md`,
`references/trace-discovery.md`.

Change: `gh issue *` → `create-issue` / `comment` / `label` / `close` / `read`;
`git checkout -b <fix|spec>/issue-… && git push -u origin …` → `open-change`.

Verification: criterion-2 grep over these files returns zero hits.

## Step 4 — `kata-implement`, `kata-backlog-synthesis`, `kata-documentation`, `kata-wiki-curate`

Files: modify each skill's `SKILL.md`.

Change: `gh pr/issue *` → the matching operation; `git push -u origin <branch>`
(documentation) → `open-change`. Leave `kata-wiki-curate`'s
`git push origin HEAD:master` (wiki memory) in place per the boundary.

Verification: criterion-2 grep over these files returns hits only for the
retained wiki/tag pushes (out of scope).

## Step 5 — `kata-release-cut`

Files: modify `SKILL.md`, `references/procedure.md`.

Change: keep all release-tag pushes (`git push origin <prefix>@v<version>`, the
`--tags` prohibition), `gh api .../tags`, and `gh release list` — release tags
and releases are not work items. These files carry no in-scope `gh pr/issue`
shape today, so this step is a confirm-and-retain pass; relocate any that a grep
surfaces.

Verification: only release-tag/release pushes and reads remain; no `gh pr/issue`
shape outside the matrix.

## Step 6 — Metric-grade tracker reads

Files: modify the `references/metrics.md` of `kata-spec`, `kata-design`,
`kata-plan`, `kata-implement`, `kata-interview`, `kata-product-issue`,
`kata-security-update`, `kata-release-merge`. These are the eight whose
`metrics.md` carry an in-scope read (`gh pr list`, `gh issue list`, or
`gh api .../{pulls,issues}`). Skip `kata-security-audit` (only `gh alerts`) and
`kata-release-cut` (only `gh run`/tag reads) — confirm per file with the
criterion-2 grep before editing; a file with no in-scope hit needs no change.

Change: `gh pr list`, `gh issue list`, `gh api repos/.../pulls|issues` (metric
queries) → `list` / `read` operations + matrix link; the rich `gh … --json …`
field shapes move to the matrix github column under `list`/`read` (added in
Part 01 Step 3, which is a hard precondition for this step). Keep `gh run list`
and `gh api .../actions` (CI runs, not work items).

Verification: criterion-2 grep over all `metrics.md` returns zero `gh pr`/`gh
issue`/`gh api .../{pulls,issues}` hits.

## Final verification

`bun run check`, `bun run test`, and `bun run check-skill-refs` pass; the
criterion-2 grep (issue/pr/discussion/review/label/change-materialization)
across the kata-* skills and shared references — excluding `kata-setup/` and
`citation-integrity.md` per the boundary — returns hits only inside
`work-trackers.md`.
