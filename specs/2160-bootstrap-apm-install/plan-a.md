# Plan 2160 — Provision declared packs in the bootstrap action

Implements [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

Add the three-step provisioning unit (apm cache, Provision packs, Verify
provisioning) to `.github/actions/bootstrap/action.yml` between `Add deps to
PATH` and `Bootstrap`, each gated on `hashFiles('apm.yml') != ''`. Verify is the
only logic-heavy step, so it lives as a Bun script bundled beside the existing
`fit-install.sh` and is invoked through `$GITHUB_ACTION_PATH`; it parses both
YAML files with the runtime's built-in `Bun.YAML.parse` (no dependency, since
the script runs inside an arbitrary consumer checkout where the monorepo's
`node_modules` is absent) and reconciles the packs declared under `apm.yml`
`dependencies.apm` against the post-install `apm.lock.yaml` and disk.

## Step 1: Add the bundled verify script

Reconcile each declared pack against the lockfile and on-disk deployed files,
exiting nonzero on any gap (SC4).

- Created: `.github/actions/bootstrap/apm-verify.mjs`

Run with Bun from the repo root. This is a Bun `.mjs` (not a `.sh` like the
sibling `fit-install.sh`) because the reconciliation needs a YAML parser, and
`Bun.YAML.parse` is the dependency-free one the runtime already provides — keep
the `.mjs` extension and the `bun <path>` invocation. Read `apm.yml` and
`apm.lock.yaml` from `process.cwd()` via `node:fs`, parse with `Bun.YAML.parse`. Normalize a
`repo_url` by stripping any `#<ref>` suffix, a trailing `.git`, and a leading
`https://<host>/` or `git@<host>:` so the declared `owner/repo#sha` form and the
lockfile's `owner/repo` form compare equal. Then:

- Build the declared set from `apm.yml` `dependencies.apm` (a list of strings),
  normalized. If `apm.yml` has no `dependencies.apm`, there is nothing to verify
  — exit `0`.
- Require `apm.lock.yaml` to exist and parse; index its `dependencies` by
  normalized `repo_url`.
- For each declared pack: it must match exactly one lockfile entry, that entry's
  `deployed_files` must be a non-empty array, and every listed path must exist
  on disk (`fs.existsSync`). Collect every failure.
- On any failure, print one `::error::` line per gap and `process.exit(1)`;
  otherwise print a one-line summary of verified packs and exit `0`.

Anchor iteration on the declared set, not on `deployed_files` present, so a pack
that never resolved (no lockfile entry) is caught rather than passing blind.

Verification: `cd tmp/bionova-apps && apm install && bun
"$PWD/../../.github/actions/bootstrap/apm-verify.mjs"` exits `0` with both packs
listed; deleting one declared pack's deployed file makes it exit `1` naming that
path.

## Step 2: Wire the three gated steps into the action

Insert the provisioning unit so materialized profiles and skills are present
before `scripts/bootstrap.sh` (SC1), gated on a root `apm.yml` (SC2).

- Modified: `.github/actions/bootstrap/action.yml`

Between the `Add deps to PATH` step and the `Bootstrap` step, add:

```yaml
    # When the consuming repo declares packs in a root apm.yml, provision them
    # before scripts/bootstrap.sh so any later agent step finds its profiles and
    # skills on disk. The file is the gate: a repo that commits its trees (the
    # monorepo) or declares no apm.yml takes the no branch and these three steps
    # never run — no bare `apm install` that would auto-create apm.yml.
    - name: Restore apm download cache
      if: hashFiles('apm.yml') != ''
      uses: actions/cache@27d5ce7f107fe9357f9df03efb73ab90386fccae # v5.0.5
      with:
        path: ~/.cache/apm
        key: apm-v1-${{ runner.os }}-${{ hashFiles('apm.lock.yaml') }}

    - name: Provision packs
      if: hashFiles('apm.yml') != ''
      shell: bash
      run: apm install

    - name: Verify provisioning
      if: hashFiles('apm.yml') != ''
      shell: bash
      run: bun "$GITHUB_ACTION_PATH/apm-verify.mjs"
```

Both `run` steps default their working directory to `$GITHUB_WORKSPACE` (the
consumer checkout root), so `apm install` reads the consumer's
`apm.yml`/`apm.lock.yaml` and `apm-verify.mjs`'s `process.cwd()` reads resolve —
do not add a `working-directory:`. `apm install` deploys to the paths the
lockfile records — no `--target`, no post-processing of the deployed tree. The
cache step restores on a key hit and `actions/cache` saves at post only on a key
miss (an unchanged `apm.lock.yaml` hit performs no save — do not add a separate
save step). Provisioning always runs because the deployed trees live in the
uncached workspace, so a warm cache reuses `apm`'s content-addressed checkouts
while a changed lock re-fetches (SC5).

Verification: `bun -e
"Bun.YAML.parse(require('fs').readFileSync('.github/actions/bootstrap/action.yml','utf8'))"`
parses cleanly and the three new steps sit after `Add deps to PATH` and before
`Bootstrap` — that step order is what guarantees SC1 (profiles on disk before
`scripts/bootstrap.sh`). The monorepo declares no root `apm.yml`, so this cannot
run end to end in this repo's own CI; the live SC1 path is exercised by an
`apm.yml`-declaring consumer (the reference consumer at `tmp/bionova-apps`).

## Step 3: Document the gated provisioning

Keep the action's own description and README accurate now that it provisions
packs.

- Modified: `.github/actions/bootstrap/action.yml` (the top-level `description:`)
- Modified: `.github/actions/bootstrap/README.md`

Extend the `description:` to name pack provisioning. In `README.md`, add a short
**Provisioning** section: when the consumer declares a root `apm.yml`, the
action runs `apm install` (pinned by `apm.lock.yaml`) before
`scripts/bootstrap.sh` and fails the run if a declared pack does not resolve;
with no root `apm.yml` it provisions nothing. Note the separate
`apm.lock.yaml`-keyed cache in the Caching section. Do not perpetuate the
README's stale `env-v3` reference — `action.yml` keys the env cache at `env-v4`;
correct it if the edited section repeats the version prefix.

Verification: `README.md` and `action.yml` describe the same gated behavior; no
claim of provisioning for repos without `apm.yml`.

Libraries used: none.

## Risks

- `Bun.YAML.parse` must exist in the pinned Bun (`bun-version: "1.3.11"`). It
  ships in Bun ≥ 1.2; if a future pin regresses below that, the verify step
  throws — the script should fail loudly rather than skip.
- A consumer could declare a pack in `apm.yml` in a form the normalizer does not
  reduce to the lockfile's `repo_url` (e.g. an unusual host or scheme). The
  reference consumer uses `owner/repo#sha`; the normalizer covers `#ref`,
  `.git`, `https://host/`, and `git@host:`. A genuinely novel form would
  false-fail Verify, surfacing as an explicit error rather than a silent pass.

## Execution recommendation

One sequential unit for an engineering agent (`staff-engineer`); Step 1 before
Step 2 (the action references the script), Step 3 after. Step 3's prose may be
handed to `technical-writer`, but it is small enough to keep with the code
change. Not worth decomposing.
