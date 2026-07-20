# Plan 2260-a Part 4: Release train — sibling ops, cuts, repin, cutover

Executor `release-engineer`, following `kata-release-cut` for every cut.
Step 4.0 runs **before** the Parts 1–3 PR merges; everything else runs
immediately after, same-day (plan-a.md § Risks: the window between merge
and Step 4.3 breaks `jidoka`-invoking CI jobs on PATH lookup). Assumes spec
2250's train is complete — the installer and pins being flipped are the
post-2250 ones.

## Step 4.0 — Sibling repository operations (pre-merge)

Pre-flight: confirm spec 2250's train actually completed — its repin PR
merged and the workflows' `clis:` values install `gemba-*` names (at plan
time they still read `fit-wiki`/`fit-harness fit-trace fit-wiki`, i.e. the
2250 train was pending). Do not start this train on a pre-repin tree.

In the authenticated `gh` environment:

1. Rename the GitHub repository `forwardimpact/coaligned-skills` →
   `forwardimpact/jidoka-skills` (GitHub's redirect keeps the old name
   serving; retained `v0.1.x` tags stay — the product version seeds above
   them). Update the repo description to the Jidoka framing.
2. Create `forwardimpact/jidoka` (empty, default branch `main`) for the
   action subtree split, description matching the action README.

Only then merge the monorepo PR — the merge push fires `publish-skills.yml`
and `publish-actions.yml` against these names.

**Verify:** both repos resolve; after the merge, the `jidoka-skills` pack
publish (tag `v0.2.0`) and the `jidoka` action split both run green.

## Step 4.1 — npm release cuts, in dependency order

| Order | Tag                  | What ships                                                                                                                                                            | Bump rationale                                                       |
| ----- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1     | `libinvariant@v0.2.0` | `@forwardimpact/libinvariant` — first cut under the new name; no `bin`, no branded discovery default                                                                  | 0.x minor over `libcoaligned` 0.1.18 signals the breaking rename     |
| 2     | `jidoka@v0.2.0`       | `@forwardimpact/jidoka` — bin + deps only; no launcher accompanies it (`publish-npm.yml` stamps launchers only for computed public CLIs, and `jidoka` is not one) | first release; matches the pack seed above the sibling's tag floor |
| 3     | `gear@v0.x`           | npm meta-package, plus the same tag fires `publish-binaries.yml`: `jidoka`-named binaries from `cli-manifest.json`, cask/formula regenerated, `fit-install.sh` staged stamped with the new `FIT_GEAR_RELEASE` | 0.x minor — binary set renamed                                      |

`kata-release-cut` owns final version arithmetic; the table records expected
magnitudes and the ordering constraint (jidoka's dependency must exist on
the registry before its smoke install; the gear binary build compiles the
product bin, which resolves only after the merge).

**Verify:** `npm view @forwardimpact/libinvariant version` and
`npm view @forwardimpact/jidoka version` both `0.2.0`; the gear release
lists `jidoka-bun-linux-x64` (and sibling targets) assets with `.sha256`
sidecars (spec SC16).

## Step 4.2 — Bootstrap pin bump (one small PR)

**Modified:** `products/gemba/actions/bootstrap/fit-install.sh` —
`FIT_GEAR_RELEASE` default → the Step 4.1 gear tag.

Merge; `publish-actions.yml` splits to the sibling `bootstrap` repo; tag the
sibling release (next `v1.0.x`) per the standing sibling-tag process.

**Verify:** the new bootstrap tag's `fit-install.sh` installs `jidoka` on a
scratch runner (`jidoka --version` reports 0.2.0).

## Step 4.3 — Repin PR (one PR)

**Modified:** `.github/workflows/*.yml` — every
`uses: forwardimpact/bootstrap@<SHA>` → the Step 4.2 tag's SHA. No `clis:`
value names the old binary (Part 1 inventory), so no invocation flips ride
along. Every pinned SHA must resolve on its sibling (citation integrity).

**Verify:** full CI green on the repin PR — the first run that installs and
invokes `jidoka` end to end (`check-context.yml`'s three jobs through the
relocated action). Re-run the plan-a-03 Step 3.6 gate; the remainder set is
unchanged (migration note + pack intro only).

## Step 4.4 — Deprecate the superseded npm names

Per the standing release process, never unpublishing (spec § Excluded):

```sh
npm deprecate coaligned "renamed: the Jidoka CLI ships as @forwardimpact/jidoka (npx @forwardimpact/jidoka)"
npm deprecate @forwardimpact/libcoaligned "renamed to @forwardimpact/libinvariant"
```

**Verify:** `npm view coaligned` and `npm view @forwardimpact/libcoaligned`
show the notices.

## Step 4.5 — Website cutover

The merge push already built and published `websites/jidoka/` via
`website-jidoka.yaml`. Hand the repository owner the deferred items (spec
§ Deferred decisions): provision `www.jidoka.team` DNS + Pages custom
domain, and settle the `www.coaligned.team` disposition. The train is
complete when the new domain serves the reframed site; the old-domain call
stays the owner's.

**Verify:** `https://www.jidoka.team/` serves the Jidoka page (after owner
DNS action); no repo change made for the old domain.

## Step 4.6 — Follow-up scope note

Locate the open follow-up issue spec 2250's Part 4 filed for distribution
and docs placement (gemba CLIs shipping in the `gear` bundle/cask) and
comment to add the `jidoka` binary to its scope — the same
one-product's-CLI-in-another's-vehicle condition, per spec § Excluded. File
nothing new.

**Verify:** the issue carries the comment linking spec 2260 and this plan.
