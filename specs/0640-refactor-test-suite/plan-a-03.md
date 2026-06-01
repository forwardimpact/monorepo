# Plan 0640-a Part 03 — split files over 400 LOC + shape policy

Implements spec § C (large files) and design Decision 5 / Component "Test-file
shape policy". Independently executable; no dependency on other parts.

Libraries used: none (test-file restructuring only).

## Split rule (applies to every file step)

Split **by behaviour family** along existing top-level `describe` boundaries —
each new file owns one cohesive family and stays ≤400 LOC. Name siblings
`<original>-<family>.test.js` (e.g. `trace-collector-tojson.test.js`). Lift
setup shared across the new siblings into a `test/helpers.js` or the relevant
libmock fixture rather than copy-pasting. Do not change assertions, rename
`src`, or alter coverage — this is a maintainability move with **no wall-time
target** (Decision 7). Files whose only over-ceiling cause is a single
indivisible behaviour (no clean family seam) go on the allow-list (Step 3)
instead of being force-split.

## Step 1 — Split the named priority cluster

- Created/modified: split siblings under `libraries/libeval/test/` and
  `libraries/libcli/test/`.

| File (LOC) | Split along |
| --- | --- |
| `libeval/test/tee-writer.test.js` (559) | single `TeeWriter` describe — split by method/behaviour group inside it (e.g. write/flush vs error/teardown) |
| `libeval/test/trace-collector.test.js` (518) | the four inner describes: `addLine`, `toJSON`, `toText`, `createTraceCollector` |
| `libeval/test/redaction-pipeline.test.js` (506) | the six per-criterion describes (sentinel sweep / patterns / opt-out / toText fidelity / Supervisor / Facilitator) |
| `libcli/test/cli.test.js` (539) | `parse`-family vs help-family vs error-family describes |

Verify: `bun test libraries/libeval libraries/libcli`; each new file ≤400 LOC.

## Step 2 — Split the remaining over-ceiling files

Apply the split rule to the rest of the > 400 LOC set (model-types excluded —
Part 04 owns it). Audit each for a clean behaviour-family seam; allow-list any
without one (Step 3).

- Created/modified: split siblings for —

`libraries/libsecret/test/libsecret.test.js` (630),
`libraries/libeval/test/{orchestration-toolkit,facilitator,redaction,agent-runner,trace-query}.test.js`,
`libraries/libutil/test/finder.test.js` (481),
`libraries/libdoc/test/{libdoc-builder,libdoc-llms}.test.js`,
`libraries/libbridge/test/{resume-scheduler,dispatcher,callback-handler}.test.js`,
`libraries/libindex/test/base-filters.test.js` (454),
`services/msbridge/test/msbridge.test.js` (436),
`libraries/libterrain/test/{datasets,pipeline}.test.js`,
`libraries/libconfig/test/libconfig-getters.test.js` (433),
`libraries/libsyntheticgen/test/parser.test.js` (425),
`libraries/libwiki/test/audit-engine.test.js` (421),
`tests/{model-matching-core,model-validation-data}.test.js`,
`libraries/libtelemetry/test/visualizer-edge-cases.test.js` (415),
`libraries/libsyntheticrender/test/{validate,fhir-microdata}.test.js`.

Note: `products/pathway/test/build-packs.integration.test.js` (560) is an
integration file — apply the same family split or allow-list it; the ceiling
applies to all `*.test.js`.

Verify: `bun test` for each touched library/product/service directory; each new
file ≤400 LOC.

## Step 3 — Record the shape policy and allow-list

Add one CONTRIBUTING line stating the ceiling and the allow-list, and enumerate
the deliberately-larger files.

- Modified: `CONTRIBUTING.md`

Add under the READ-DO "Simple over easy" area (judgement-shaped, **no lint** per
Decision 5): a single line — "Target ≤400 LOC per `*.test.js`, split by
behaviour family; files that are one cohesive behaviour may exceed it — keep the
exception list here." — followed by the bulleted allow-list of files retained
over 400 LOC with a half-line reason each.

Verify: a size scan (`find … -name '*.test.js' | xargs wc -l | awk '$1>400'`)
returns only the files named in the CONTRIBUTING allow-list. Confirms SC5.

## Step 4 — Part verification

Run `bun run check` and `bun test` across every touched directory. Confirms SC5
and that splits preserved `0 fail` (SC6 contribution).
