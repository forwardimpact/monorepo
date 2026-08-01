# Map

For general product conventions see [products/CLAUDE.md](../CLAUDE.md).

## Substrate

`fit-map substrate stage` runs these phases in order (the command prefixes
each failure with `[substrate stage: <phase>]` on the original error, so
the stack survives):

    init → copy-activity → copy-pathway → stack → url-discovery →
    migrate → seed → provision → roster-standard → smoke

**Activity and pathway are a matched pair.** The roster under `data/activity`
carries level ids that `data/pathway` defines, so both copy phases ship from the
same data root (`findDataDir`). `copy-pathway` replaces the staged pathway
wholesale. The init phase already materialised the starter standard there. A
merge copy would blend starter files into the source standard. When no source
pathway exists, the starter copy stays as the fallback.

The seed path owns the invariant "every seeded level exists in the
installed standard". Stage does not own it. `assertSeededLevelsCovered`
(`src/lib/roster-levels.js`) runs inside `activity seed`, so any seed
path fails fast. It runs again as the `roster-standard` stage phase,
which proves the staged copy end-to-end. Stage is only one of three
substrate entry points: `substrate stage` (CI/interview), `activity
start` + `activity seed` (dev flow), `activity migrate` (migrations
only).

Injectable phase collaborators on `runStageCommand` all have real
defaults. When you touch them, keep a test that runs the defaults
(`test/activity/substrate-stage.integration.test.js` "default
dependencies"). Fully-stubbed deps objects cannot catch default-wiring
regressions.
