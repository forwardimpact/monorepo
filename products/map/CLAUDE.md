# Map

For general product conventions see [products/CLAUDE.md](../CLAUDE.md).

## Substrate

`fit-map substrate stage` runs these phases in order (each failure is
prefixed `[substrate stage: <phase>]` on the original error, so the
stack survives):

    init → copy-activity → copy-pathway → stack → url-discovery →
    migrate → seed → provision → roster-standard → smoke

**Activity and pathway are a matched pair.** The roster under
`data/activity` carries level ids defined by `data/pathway`, so both
copy phases ship from the same data root (`findDataDir`). `copy-pathway`
replaces the staged pathway wholesale — init has already materialised
the starter standard there, and a merge copy would blend starter files
into the source standard. When no source pathway exists, the starter
copy stays as the fallback.

The invariant "every seeded level exists in the installed standard" is
owned by seeding, not staging: `assertSeededLevelsCovered`
(`src/lib/roster-levels.js`) runs inside `activity seed` (any seeding
path fails fast) and again as the `roster-standard` stage phase (proves
the staged copy end-to-end). Stage is only one of three substrate entry
points — `substrate stage` (CI/interview), `activity start` + `activity
seed` (dev flow), `activity migrate` (migrations only).

Injectable phase collaborators on `runStageCommand` all have real
defaults; when touching them, keep a test that runs the defaults
(`test/activity/substrate-stage.integration.test.js` "default
dependencies") — fully-stubbed deps objects cannot catch default-wiring
regressions.
