# design-a(1180): Starter drivers canonical to GetDX + health view empty-vs-no-match split

Architectural sketch for [spec(1180)](spec.md). Reconciles the starter
`drivers.yaml` opinion with the runtime `ALL_DRIVERS` taxonomy
(`libraries/libsyntheticgen/src/engine/activity.js:13-30`) and adds an
observable distinction on the health view between the two failure modes that
today render as `Drivers (0)`.

Spec covers two changes that share one architectural commitment ("the starter
encodes GetDX as the canonical DX vendor, and every join surface must read
coherently under that opinion") and split on package boundary
(`products/map/starter/` vs. `products/landmark/src/`). One design, one
plan: `kata-plan` owns PR-shape and ordering decisions.

## Components

| ID | Artifact | Role |
| --- | --- | --- |
| C1 | `products/map/starter/drivers.yaml` | Replace 3-entry list with 16 GetDX-id entries mirroring `ALL_DRIVERS`. |
| C2 | `products/map/starter/README.md` (new) | Names GetDX as the canonical DX vendor this starter encodes; points readers at the runtime source of truth. |
| C3 | Equality test under `products/map/test/getdx-driver-ids.test.js` (new) | Loads starter `drivers.yaml` and the exported `ALL_DRIVERS`; asserts set equality. Anchors criterion 1. |
| C4 | Export rename in `libraries/libsyntheticgen/src/engine/activity.js:13` | Promote `const ALL_DRIVERS` to `export const ALL_DRIVERS` so C3 can import it. Pure visibility change. |
| C5 | `products/landmark/src/commands/health.js` join-state detection | New `view.driverJoin` diagnostic produced in `runHealthCommand` (alongside `buildDriverRows`) capturing the three join outcomes. |
| C6 | `products/landmark/src/formatters/health.js` formatter dispatch | Text and markdown renderers — default *and* verbose mode — branch on `view.driverJoin.state` for non-matched copy. JSON renderer carries the diagnostic verbatim. |

## Data flow

```mermaid
flowchart LR
  subgraph starter[products/map/starter/]
    DY[drivers.yaml — 16 ids]
    RM[README.md — GetDX canonical]
  end
  AC[libsyntheticgen ALL_DRIVERS\nrun-time score emit + build-time taxonomy] -->|equality test C3| DY
  DY -->|fit-map init cp(starterDir, dataDir)| DP[data/pathway/drivers.yaml]
  RM -->|same cp call| DR[data/pathway/README.md]
  DP -->|loaded as mapData.drivers| HC[runHealthCommand C5]
  AC -->|fit-terrain seeds scores| SC[snapshot scoreRows]
  SC --> HC
  HC -->|view.drivers + view.driverJoin| FM[health formatter C6]
  FM --> OUT[stdout — 3 distinguishable forms across text / md / verbose / json]
```

## Source of truth for the 16 driver ids

`ALL_DRIVERS` stays canonical because it is already the **runtime emit site**
for every `scoreRow.item_id` (`activity.js:242, 260`). Starter `drivers.yaml`
mirrors it; the C3 equality test loads both at build time and asserts set
equality, so drift surfaces in CI rather than at user-install time. The
test lives under `products/map/test/` (the product owns the starter); the
existing `bun test` task picks it up. C4 promotes the constant from
module-local to `export const` — a one-line visibility change with no
behavioural risk.

**Rejected: generate `drivers.yaml` from `ALL_DRIVERS` at install time.** A
generator inside `fit-map init` breaks the "what ships in the repo is what
the user gets" contract — readers cannot inspect the resolved list by
opening the starter directory.

**Rejected: invert and derive `ALL_DRIVERS` from YAML.** Forces the synthetic
engine to read filesystem state at runtime for what is a build-time taxonomy
question; couples the engine package to map's starter layout.

**Rejected: place the equality test under `libraries/libsyntheticgen/test/`.**
That test would reach into `products/map/starter/`, inverting the
libraries→products dependency direction encoded in
[`libraries/CLAUDE.md`](../../libraries/CLAUDE.md). `libsyntheticgen` has no
declared dependency on `@forwardimpact/map` and adding one would
strengthen the wrong-direction edge.

## Where GetDX is declared canonical

A new `products/map/starter/README.md` carries the vendor declaration. Picked
over a top-of-file `drivers.yaml` comment because a `README.md` is what a
reader of a directory expects and the starter directory has no README today —
adding one creates a documented home for future starter-shape notes.

`fit-map init` copies the entire starter tree via `cp` (`init.js:46-50`), so
the README lands in user installs as `data/pathway/README.md`. This is
intentional: a downstream consumer who edits their checked-in copy still
sees the vendor declaration without leaving the directory. The file is
markdown, not YAML, so `fit-map validate` and `drivers.schema.json` ignore
it (criterion 6 untouched).

**Rejected: top-of-file YAML comment in `drivers.yaml`.** Survives but is
invisible until the reader opens that specific file — loses the "without
leaving the directory" spirit when the reader is browsing.

**Rejected: a sibling `VENDOR.md`.** Non-conventional filename; readers do
not look for these.

## Reference arrays on the 16 new drivers

Every new driver entry ships with `contributingSkills` and
`contributingBehaviours` **omitted**. Omitted (not present) and `[]` both
validate under `drivers.schema.json` and produce no `INVALID_REFERENCE`
errors in `products/map/src/validation/driver.js:33-61`; omitted reads
more cleanly in YAML.

**Consequence (criterion 4 still holds, but is in tension):** With empty
arrays, `attachComments` (`health.js:237-244`) emits zero comments per
driver and `gatherSkillEvidence` (`health.js:191-213`) emits zero evidence
rows. In the MATCHED state, the per-driver verbose section (`renderTextDriver`
at `formatters/health.js:153-166`, `renderMdDriver` at `:194-210`) would
render `Contributing skills:` and `Evidence:` with empty values for all 16
drivers — a cosmetic regression over today, where the 3 starter drivers
populate those fields (even though today the rows themselves get dropped at
the join, so users never see them).

This is the spec's "content authoring is out of scope" call expressed in
code. The formatter trims empty `Contributing skills:` / `Evidence:` lines
under C6 so the artifact reads cleanly under the new starter; a follow-on
spec authors per-driver skill/behaviour mappings when the content is ready.

**Rejected: encode obvious id-equality matches (e.g. driver
`incident_response` → skill `incident_response`).** One match would invite
ad-hoc content drift on the other 15 — an asymmetry the design will not
bake in.

## Health view join states

Three observable join states surface on stdout (criterion 4). Detection
lives at the `runHealthCommand` level — not inside `buildDriverRows` —
because both inputs (`mapData.drivers`, `scores`) and the empty-snapshot
short-circuit (`resolveLatestSnapshot` at `health.js:131-138`) sit in that
scope, so the state is computed once and the existing `meta.emptyState`
machinery still owns the "no snapshot data at all" case unchanged.

State signal:

```
view.driverJoin = {
  state: "NO_DRIVERS" | "NO_MATCH" | "MATCHED",
  yamlIds:    number,  // mapData.drivers.length
  scoreIds:   number,  // distinct count of scoreRow.item_id
  matched:    number,  // size of intersection
}
```

| State | Trigger | Stdout shape (text default; markdown mirrors; verbose extends) |
| --- | --- | --- |
| `NO_DRIVERS` | `mapData.drivers` empty or absent. `scoreIds` may be 0 or positive — emitted before scores are inspected. | Header `Drivers (no drivers configured)` + line: "`data/pathway/drivers.yaml` is empty. Run `npx fit-map init` to seed the 16-driver starter, then re-run." |
| `NO_MATCH` | `mapData.drivers` non-empty AND `scoreIds > 0` AND `matched == 0`. The `scoreIds > 0` clause distinguishes this from "no team-scoped score rows" (which falls through to existing `view.drivers == []` rendering or `meta.emptyState`). | Header `Drivers (no matches)` + line: "Snapshot has *N* driver ids, your `data/pathway/drivers.yaml` declares *M*; none overlap. Edit `data/pathway/drivers.yaml` to align with the GetDX taxonomy (`fit-map init` resets it)." |
| `MATCHED` | `mapData.drivers` non-empty AND `matched > 0`. | Existing `Drivers (N)` table (default) and per-driver verbose blocks — byte-identical to today for the cells that have data; `Contributing skills:` / `Evidence:` lines suppressed when empty per the reference-array decision above. |

JSON output (`toJson` in `formatters/health.js`) carries `view.driverJoin`
in the existing view spread; consumers branch on `state` field.

`meta.warnings.push("Unknown item_id …")` (`health.js:157-159`) is the
health command's own stderr warning — separate from `snapshot.js:128-140`
which the spec out-of-scopes. It stays unchanged: after C1 lands, no
warnings fire on the clean-install path (criterion 3); on a downstream
consumer's mismatched-yaml flow, the new stdout copy is the primary signal
and the warnings remain as detail.

**Rejected: route `NO_DRIVERS`/`NO_MATCH` through `meta.emptyState`.** The
empty-state formatter at `formatters/index.js:55-67` short-circuits the whole
view to a single line, losing team label, snapshot date, and the warnings
block — context the user still needs.

**Rejected: extend the per-id "Unknown item_id" warning into the primary
signal.** Warnings go to stderr; criterion 4 demands stdout-side
distinguishing copy.

## Out-of-design (handled at plan / implementation)

- Exact literal strings for the `NO_DRIVERS` and `NO_MATCH` lines (the table
  values above are illustrative — final wording is plan/UX).
- Per-driver description copy on the 16 new entries.
- Test fixture updates for the new view shape.
- Whether C1+C2+C3+C4 (starter) and C5+C6 (landmark) ship in one PR or two —
  `kata-plan` decides. Ordering note for the planner: landing C5+C6 first
  improves the diagnostic for existing-install consumers (who carry the old
  3-id `drivers.yaml`); landing C1+C2+C3+C4 first improves fresh-install
  consumers. Both paths satisfy spec idempotency (criterion 5).

— Staff Engineer 🛠️
