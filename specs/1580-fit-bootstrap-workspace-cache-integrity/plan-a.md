# Plan 1580-a — `fit-bootstrap` environment cache integrity

## Approach

Execute the [design](design-a.md) across two repos via the propagation
route [`.github/CLAUDE.md` § Editing a published action](../../.github/CLAUDE.md)
mandates. Step 1 lands the `restore-keys` deletion and README note on the
sibling `forwardimpact/fit-bootstrap` behind an append-only patch tag.
Step 2 advances the monorepo's 28 SHA pins to the resulting commit via the
Dependabot SHA-bump PR the `github-actions` ecosystem opens on its weekly
sweep. The steps are strictly sequential — the bump PR cannot pin a commit
that does not yet exist. Sibling content, the exact-key contract rationale,
and the six `hashFiles` globs live in the [spec](spec.md) and
[design](design-a.md); this plan references them and does not restate them.

Libraries used: none.

## Execution

| Step | Agent | Repo | Depends on |
|---|---|---|---|
| 1 — sibling contract change | a writer with `forwardimpact/fit-bootstrap` push rights (see Access gate) | `forwardimpact/fit-bootstrap` | spec 1310's `fit-bootstrap` SHA pin on monorepo `main` — verified at all 28 references `@22e7a8a053c22cf56d6f4efb95fcf0b3d42267c8 # v1` |
| 2 — monorepo SHA advance | Dependabot bump PR, merged via branch protection | `forwardimpact/monorepo` | Step 1's patch tag + commit SHA |

**Access gate (read before Step 1).** The `kata-agent-team` App
installation covers this monorepo only; sibling writes fail 401/403 by
design (`.github/CLAUDE.md` § Editing a published action). An agent
running under that installation **cannot execute Step 1 directly** — its
sole action is to file a `forwardimpact/fit-bootstrap` Issue carrying the
Step 1 diff and link it from PR #1461, then stop. A human or a writer
holding sibling push rights performs the clone-edit-tag below.

## Step 1 — Remove `restore-keys` on the sibling action

Intent: make the environment cache restore exact-key-or-nothing per the
design's restore-path state machine.

Repo: `forwardimpact/fit-bootstrap`. Clone first — the file is not in this
worktree, so confirm its current shape before editing:

```sh
gh repo clone forwardimpact/fit-bootstrap tmp/fit-bootstrap
# inspect tmp/fit-bootstrap/action.yml — the step `id: env-cache`
# (named "Restore environment cache"); note the live env-vN- prefix
# (the interim env-v3- bump may already have landed — leave it as-is)
```

- Modified: `action.yml` — under the step `id: env-cache`, delete the
  `restore-keys` key and its value; touch nothing else (the `key`,
  `path`, and `uses:` pin stay byte-for-byte). The `key` input's
  `hashFiles(...)` argument set is unchanged (the six globs the spec's
  criterion 2 enumerates).
- Modified: `README.md` — name the environment cache **exact-key-restore-only**
  (no prefix fallback) and link the spec for rationale:
  `https://github.com/forwardimpact/monorepo/blob/main/specs/1580-fit-bootstrap-workspace-cache-integrity/spec.md`.

Land via append-only patch tag (never `git tag -f v1`):

```sh
cd tmp/fit-bootstrap
git add action.yml README.md && git commit -m "fix: drop env-cache restore-keys fallback (monorepo spec 1580)"
gh api repos/forwardimpact/fit-bootstrap/tags --jq '.[].name'   # find next unused v1.0.<N>
git tag v1.0.<N>
git push origin main && git push origin v1.0.<N>
git rev-parse HEAD   # record this SHA for Step 2
```

Verification (run against the cloned `tmp/fit-bootstrap` at the
contract-change commit): `rg "restore-keys" action.yml` returns nothing;
the `key:` line's `hashFiles(...)` set is unchanged; `rg -i "exact-key"
README.md` and `rg "specs/1580" README.md` both match.

## Step 2 — Advance the monorepo SHA pins

Intent: make monorepo CI consume the contract change.

Route: `.github/dependabot.yml`'s `github-actions` ecosystem opens a
SHA-bump PR on its weekly sweep once the Step 1 patch tag exists; merge it
through branch protection. No hand-authored pin edit is needed — that is
the route `.github/CLAUDE.md` mandates and spec 1310 established. (If the
sweep cadence is too slow for the milestone, a writer may open the
equivalent bump PR manually; the diff is identical to what Dependabot
produces.)

Modified by the bump PR (28 `uses:` references across 19 files under
`.github/workflows/`), each `forwardimpact/fit-bootstrap@22e7a8a0… # v1`
→ `@<STEP-1-SHA> # v1`:

| File | Refs | File | Refs |
|---|---|---|---|
| `check-quality.yml` | 4 | `check-context.yml` | 4 |
| `check-data.yml` | 2 | `check-test.yml` | 2 |
| `check-security.yml` | 2 | `build-binaries.yml` | 1 |
| `eval-guide.yml` | 1 | `eval-kata.yml` | 1 |
| `eval-wiki.yml` | 1 | `kata-dispatch.yml` | 1 |
| `kata-interview.yml` | 1 | `outpost-determinism-probe.yml` | 1 |
| `publish-brew.yml` | 1 | `publish-macos.yml` | 1 |
| `publish-npm.yml` | 1 | `website-coaligned.yaml` | 1 |
| `website-fit.yaml` | 1 | `website-kata.yaml` | 1 |
| `website-monorepo.yaml` | 1 | | |

The trailing `# v1` marker is retained (spec 1310's immutable-hash +
canonical-marker shape). No step is added or removed.

Verification: the aggregate `rg -c "fit-bootstrap@<STEP-1-SHA>"
.github/workflows/ | awk -F: '{s+=$2} END {print s}'` totals exactly 28
across 19 files, and the per-file counts match the table above (e.g. `rg
-c "fit-bootstrap@<STEP-1-SHA>" .github/workflows/check-quality.yml` = 4);
`rg "fit-bootstrap@22e7a8a0" .github/workflows/` returns nothing (no old
pin survives); `git diff` shows `scripts/bootstrap.sh` unchanged and no
file outside the 19 workflows and this spec tree touched.

## Risks

- **Sibling access is the hard gate.** Step 1 cannot run under the
  `kata-agent-team` installation (401/403 by design). The Access gate
  above is the executor's only in-installation action: file the Issue and
  stop. Step 2 is a no-op until Step 1's SHA exists — there is no monorepo
  diff to author before then.
- **Interim prefix bump races Step 1.** The release engineer's `env-v3-`
  prefix bump may land on the sibling between the Step 1 clone and commit.
  Detect it by re-pulling `tmp/fit-bootstrap` before pushing; the
  `restore-keys` deletion is orthogonal to the prefix value, so reconcile
  by rebasing onto the bumped `key:` line — no content conflict.

— Staff Engineer 🛠️
