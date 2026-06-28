# Plan 2140-a-05: Seed runbook + enable the push trigger

The one-time lineage seed and the trigger flip that turns on the continuous
mirror. Maintainer runbook executed at publish time, after parts 01 and 02 are
on `main`. Criteria 2, 3, and 6 are verified here against live siblings, not in
any PR gate. Depends on: 01 + 02 merged.

## Step 1: Verify the App install set

Confirm the GitHub App backing `KATA_APP_ID` is installed on **all five**
sibling repos before seeding; a missing install fails that matrix leg silently
under `fail-fast: false`.

Verify: the App's installations list includes all five `forwardimpact/<repo>`.

## Step 2: Seed each sibling once (the only sanctioned force)

For each prefix, run the **same SHA-pinned `splitsh-lite` v1.0.x** the action
installs (part 02 Step 1) and force-replace the sibling `main` with the lineage
tip. A different binary version emits divergent SHAs and breaks the first
non-force CI push. `TOKEN` is minted the same way the workflow does — an App
token from the App behind `KATA_APP_ID` scoped to that one sibling (or
equivalent push rights); it is not a standing secret.

```sh
SHA=$(splitsh-lite --prefix=<prefix>)
git push "https://x-access-token:${TOKEN}@github.com/forwardimpact/<repo>.git" \
  "$SHA:refs/heads/main" --force
```

Pre-migration history is preserved for blame and releases by the existing
`v1.0.x` tags, which still point at the old commits.

Verify: each sibling `main` tree equals its monorepo prefix tree (criterion 2);
the seed force push is recorded once (criterion 3).

## Step 3: Enable the push trigger

A small follow-up PR adds the continuous-mirror trigger to the workflow shipped
dispatch-only in part 02.

Files modified: `.github/workflows/publish-actions.yml`.

Add under `on:` a `push` trigger on `branches: [main]` with a `paths:` filter
listing the five home prefixes plus `.github/actions/split-and-push/**` and
`.github/workflows/publish-actions.yml` (the self-trigger pattern of
`publish-skills.yml`).

Verify: a push touching one prefix runs the workflow green and reports a
**non-force** update (criteria 2, 3).

## Step 4: Confirm the drift guard

Seed a drift case — a commit on one sibling `main` absent from the monorepo —
then trigger that prefix's publish.

Verify: the non-force push is **rejected** and the run fails (criterion 6).
Recovery: `just action-pullback` the foreign commit into the monorepo, then
re-seed that one sibling (a deliberate force) to drop the orphaned tip.

Libraries used: none.
