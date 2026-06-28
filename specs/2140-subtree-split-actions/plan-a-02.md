# Plan 2140-a-02: Outbound — `split-and-push` action + `publish-actions.yml`

Adds the deterministic split and the non-force push that makes sibling `main` a
faithful projection and drift self-rejecting (criteria 2, 3, 6). The workflow
lands `workflow_dispatch`-only; part 05 enables the push trigger after the seed.

## Step 1: Add the `split-and-push` composite action

One tested path that installs the pinned `splitsh-lite`, splits one prefix, and
pushes the resulting commit to the sibling `main` with no force.

Files created: `.github/actions/split-and-push/action.yml`.

Inputs: `prefix`, `sibling-repo`, `token`. Steps:

- Install `splitsh-lite` pinned by version + `sha256` (download the
  `splitsh/lite` GitHub release tarball, `sha256sum -c`, move onto PATH), the
  same SHA-pinned pattern as `.github/actions/install-gitleaks`. Pin a
  **v1.0.x** release — prebuilt `lite_linux_amd64.tar.gz` assets exist only on
  `v1.0.0` / `v1.0.1`; `v2.0.0` ships source only. `security-engineer` records
  the v1.0.x version and digest per dependency policy.
- `SHA=$(splitsh-lite --prefix="$PREFIX")` — `splitsh-lite` prints the split tip
  SHA to stdout (no `--quiet` flag exists; its flags are
  `--prefix/--target/--origin/--path/--scratch/--git`). Confirm the exact stdout
  contract against the pinned binary when authoring.
- `git push "https://x-access-token:${TOKEN}@github.com/forwardimpact/${REPO}.git" "$SHA:refs/heads/main"`
  — **no** `+` prefix, **no** `--force`. A non-fast-forward exits non-zero and
  fails the step.

Verify: the action YAML is valid; the push uses exactly the
`"$SHA:refs/heads/main"` refspec form with no `+` and no `--force`
(`rg -n 'refs/heads/main' .github/actions/split-and-push/action.yml` shows the
plain refspec;
`! rg -n -- '--force|\+\s*refs|:\s*\+refs' .github/actions/split-and-push/action.yml`).

## Step 2: Add `publish-actions.yml` (dispatch-only)

Matrix over the five `{prefix, repo}` pairs, mirroring the per-repo App-token
pattern of `publish-skills.yml`.

Files created: `.github/workflows/publish-actions.yml`.

- `on: workflow_dispatch` only — the `push:`/`paths:` trigger is added in part
  05 after the seed, so no CI push fires against pre-migration sibling history.
- `permissions: { contents: read }`; `strategy: { fail-fast: false, matrix: … }`
  with the five pairs from the
  [shared reference](plan-a.md#shared-reference-prefix--sibling--home--consumed-as).
- Per leg, in order:
  1. `actions/create-github-app-token` (SHA-pinned `# v3`) with
     `app-id: ${{ secrets.KATA_APP_ID }}`,
     `private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}`, and
     `repositories: ${{ matrix.repo }}` — the per-repo scoping
     `publish-skills.yml` uses; the default `GITHUB_TOKEN` cannot push
     cross-repo.
  2. `actions/checkout` (SHA-pinned `# v6`) with `fetch-depth: 0` — checks out
     **the monorepo** (the split and the local-action references below resolve
     against this checkout, never a sibling).
  3. `./.github/actions/audit` (secret scanning only, as `publish-skills.yml`
     does).
  4. `./.github/actions/split-and-push` with the leg's `prefix`, `repo`, and the
     step-1 token.

Verify: workflow YAML is valid; the matrix lists all five pairs; `on:` is
`workflow_dispatch` only; the monorepo checkout precedes both local-action
references; no `--force`/`+` refspec anywhere in the workflow.

Libraries used: none.
