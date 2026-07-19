# Plan 2250-a Part 4: Post-merge release and repin chain

Makes the renamed surfaces real for CI and external consumers. Runs
immediately after the Parts 1–3 PR merges to `main`; executor
`release-engineer`, following `kata-release-cut` for every cut. Until this
part completes, CI installs old-name binaries against new-name instructions —
the window is expected to break scheduled agent runs (plan-a.md § Risks), so
execute same-day.

## Step 4.1 — npm release cuts, in dependency order

| Order | Tag | What ships | Bump rationale |
| --- | --- | --- | --- |
| 1 | `libharness@v3.0.0` | library without bins; new command-module exports | breaking: `bin` field and `./bin/*` exports removed |
| 2 | `libxmr@v3.0.0` | same shape | breaking: `bin` removed |
| 3 | `libwiki@v0.3.0` | same shape; dep ranges → `libharness ^3.0.0` **and** `libxmr ^3.0.0` | 0.x minor signals the break |
| 4 | `gemba@v0.1.0` | `@forwardimpact/gemba` + the five `gemba-*` launchers (publish-npm stamps and publishes launchers whose single dependency is the tagged package); dep ranges → the versions above | first release |
| 5 | `gear@v0.2.0` | npm: slimmed meta-package (three runtime deps gone). Same tag also fires `publish-binaries.yml`: gemba-named binaries from `cli-manifest.json`, cask + Linux formula regenerated (gemba `binary` stanzas), `fit-install.sh` staged on the release stamped with `FIT_GEAR_RELEASE=gear@v0.2.0` | 0.x minor signals the dependency break |

`kata-release-cut` owns final version arithmetic; the table records the
expected magnitudes and the ordering constraint (gemba's deps must exist on
the registry before its smoke install; gear's binary build compiles the
product bins, which resolve only after the merge).

**Verify:** `npm view @forwardimpact/gemba version` = 0.1.0;
`npm view gemba-wiki version` = 0.1.0 (stamped); the `gear@v0.2.0` release
lists `gemba-*-bun-linux-x64` assets and a stamped `fit-install.sh`; the
homebrew-tap commit renders `gemba-*` binary stanzas.

## Step 4.2 — Bootstrap pin bump (one small PR)

**Modified:** `products/gemba/actions/bootstrap/fit-install.sh` —
`FIT_GEAR_RELEASE` default → `gear@v0.2.0`.

Merge; `publish-actions.yml` splits the new source to the sibling `bootstrap`
repo; tag the sibling release (next `v1.0.x`) per the standing sibling-tag
process.

**Verify:** the new bootstrap tag's `fit-install.sh` installs `gemba-wiki` on
a scratch runner.

## Step 4.3 — Repin and flip `clis:` (one PR)

**Modified:** `.github/workflows/*.yml`.

- Every `uses: forwardimpact/bootstrap@<SHA>` → the Step 4.2 tag's SHA.
- `uses: forwardimpact/harness@<SHA>` (`kata-dispatch.yml`,
  `eval-guide.yml`), `forwardimpact/wiki@<SHA>` (same files),
  `forwardimpact/benchmark@<SHA>` (`eval-wiki.yml`) and the reusable
  `forwardimpact/benchmark/.github/workflows/benchmark.yml@<SHA>`
  (`eval-kata.yml`, `eval-coaligned.yml`) → the post-merge sibling SHAs
  carrying the renamed steps (tag them per the standing process if untagged).
- Every `clis:` value: `fit-wiki fit-harness fit-trace` and variants → gemba
  names (inventory: `rg -n 'clis:' .github/workflows`), **together with** the
  bare-PATH run-step invocations held since Part 1: `fit-trace cost` and
  `fit-harness callback` in `kata-dispatch.yml`, `fit-wiki curate` in
  `curate-wiki.yml`.
- `publish-skills.yml` fit leg `prefix: fit` → `fit gemba` — editing the
  workflow also re-fires the pack publish, now running the multi-prefix
  `fit-pack` from the repinned bootstrap, which restores the runtime skills
  and the `gemba` product skill to the published fit-skills pack.

Every pinned SHA must resolve on its sibling repo (citation integrity).

**Verify:** full CI green on the repin PR — this is the first run that
installs and invokes the gemba binaries end to end; the plan-a-01 `rg` gate's
allowed remainder shrinks to only the `benchmarks/fit-wiki` path reference in
`eval-wiki.yml`; the published fit-skills pack lists the `gemba` and
`gemba-*` skills.

## Step 4.4 — Deprecate the superseded launchers

`npm deprecate` `fit-harness`, `fit-trace`, `fit-benchmark`, `fit-wiki`,
`fit-xmr` (each: "renamed to gemba-<cli>; install gemba-<cli> instead"), per
the standing release process. Do not unpublish.

**Verify:** `npm view fit-wiki` shows the deprecation notice.

## Step 4.5 — Follow-up issues

File two issues, each linking spec 2250 and this plan:

1. **Kata repoint** (Kata lane, `agent:staff-engineer`): repoint
   `products/kata/actions/{kata-agent,kata-interview}` to the gemba CLI names
   and the new bootstrap tag when Kata next advances its pins — excluded from
   spec 2250 by SC13; today's SHA-pinned chain (old bootstrap → old gear
   release → old binary names) stays self-consistent until then.
2. **Distribution and docs placement**: (a) the gemba CLIs ship inside the
   `gear` binary bundle and `fit-gear` cask — one product's command family
   distributed under another's name; (b) the six CLIs' usage guides remain
   under `websites/fit/docs/libraries/` while documenting product commands.
   Both are out of spec 2250's boundary; the issue records them so neither is
   resolved silently.

**Verify:** both issues exist with the links above.
