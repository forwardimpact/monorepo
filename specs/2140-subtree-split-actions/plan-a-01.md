# Plan 2140-a-01: Relocate the five action sources + quality-suite exclusions

Populates the five homes from the
[shared reference](plan-a.md#shared-reference-prefix--sibling--home--consumed-as)
and keeps the full quality suite green over the relocated trees (criteria 1, 8).

## Step 1: Vendor each sibling's `main` root tree into its home

Clone each sibling at `main` and copy its whole working tree (everything except
`.git/`) into the mapped home, preserving the byte form so the home equals the
sibling root.

Files created (one home per sibling, full contents); the home directory is named
for the **renamed** sibling (part 06):

- `libraries/libharness/actions/harness/`
- `libraries/libharness/actions/benchmark/`
- `libraries/libwiki/actions/wiki/`
- `products/kata/actions/kata-agent/`
- `.github/actions/bootstrap/`

For each `{repo, home}` pair (clone resolves whether or not the rename has
landed — GitHub redirects the old name):

```sh
git clone --depth 1 https://github.com/forwardimpact/<repo>.git /tmp/<repo>
rm -rf /tmp/<repo>/.git
mkdir -p <home> && cp -R /tmp/<repo>/. <home>/
```

The five live sibling trees today carry only `README.md`, `LICENSE`,
`action.yml`, the `benchmark` reusable workflow, the `bootstrap` sub-actions,
and `kata-agent/post-run/*.mjs` — **no** `package.json` and **no** `*.test.js`.
Confirm this when vendoring; the exclusion set in Step 2 is sized to exactly
these contents.

Verify: `test -f` on each home's `action.yml`;
`test -f libraries/libharness/actions/benchmark/.github/workflows/benchmark.yml`;
the `bootstrap` home contains its sub-action directories.

## Step 2: Exclude the homes from monorepo authored-source tooling

The homes are byte-faithful projections, so the monorepo's authored-source
linters must not rewrite or fail over them. Add each home to the ignore set of
every tool that sweeps it.

Files modified:

| File | Change |
| --- | --- |
| `biome.json` | Add `"!libraries/libharness/actions/**"`, `"!libraries/libwiki/actions/**"`, `"!products/kata/actions/**"`, `"!.github/actions/bootstrap/**"` to `files.includes` (covers `kata-agent/post-run/*.mjs`, the only vendored JS) |
| `eslint.config.js` | Add the same four globs to the `ignores` array — eslint's `products/**/*.mjs` glob would otherwise lint `kata-agent/post-run/*.mjs` |
| `.rumdl.toml` | Add the same four paths to `global.exclude` (the vendored `README.md`s) |
| `package.json` (`test` script) | Defensive only — no sibling ships a `*.test.js` today. Scope the exclusion to the homes the `find` roots actually reach: `-not -path './libraries/libharness/actions/*' -not -path './libraries/libwiki/actions/*' -not -path './products/kata/actions/*'` (`.github/actions/bootstrap` is not under any `find` root) |

Verify: `rg -n 'actions/' biome.json eslint.config.js .rumdl.toml` shows the
four homes — a presence check only; Step 3 is the actual proof the globs take
effect.

## Step 3: Run the full suite over the relocated trees

Run the repository check and test commands — this is where the exclusions are
proven, not asserted. The relocated trees carry no `package.json` (verified in
Step 1), so `scripts/check-metadata.mjs` and the `audit` action have nothing to
rewrite or scan over them; if a future sibling adds a root `package.json`,
handle it via `check-metadata.mjs`'s `SKIP_DIRS` (it has no path-ignore), not a
glob.

Verify: repository check, test, format, and invariant commands are all green
(criterion 8); `test ! -f .gitmodules` (criterion 4, no gitlink introduced).

Libraries used: none.
