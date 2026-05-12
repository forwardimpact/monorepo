# Plan 930 — Pathway `--list` Id-Only Normalisation

References: [`spec.md`](./spec.md), [`design-a.md`](./design-a.md).

## Approach

Six entity command modules currently pass a `formatListItem` config into
`createEntityCommand`; the design removes those opt-ins so the factory's
default (`item.id + "\n"`) is the only path. The plan is therefore a deletion
in `products/pathway/src/commands/` (six functions + six factory references),
a copy edit in five `formatSummary` bullets, a rendered-output realignment in
two guides, and a regression test that asserts the id-only shape via captured
stdout from each entity command's runner. No new modules, no factory-contract
change, no library upgrades.

Libraries used: none.

## Steps

### Step 1 — Remove `formatListItem` opt-ins from six entity command modules

**Intent:** Each entity command stops passing `formatListItem` to the factory.
The factory default (`handleList` writing `item.id + "\n"`) becomes the only
reachable path for `--list`.

**Modified:** `products/pathway/src/commands/level.js`,
`products/pathway/src/commands/discipline.js`,
`products/pathway/src/commands/track.js`,
`products/pathway/src/commands/behaviour.js`,
`products/pathway/src/commands/driver.js`,
`products/pathway/src/commands/skill.js`.

**Change per file:**

| File | Delete the `formatListItem` function definition at | Delete the `formatListItem,` line in `createEntityCommand({…})` at |
|---|---|---|
| `level.js` | L29–L31 | L92 |
| `discipline.js` | L27–L33 | L87 |
| `track.js` | L29–L31 | L95 |
| `behaviour.js` | L27–L29 | L81 |
| `driver.js` | L28–L30 | L111 |
| `skill.js` | L108–L110 | L125 |

`skill.js` keeps everything else (the `--agent` branch in `runSkillCommand`,
the `baseSkillCommand` composition, all imports). After the change,
`baseSkillCommand` is invoked with a config object that omits `formatListItem`
exactly like the other five.

**Verification:** `rg -n 'formatListItem' products/pathway/src/commands/`
returns only `command-factory.js` matches (the factory parameter, the
`handleList` parameter, the JSDoc line, and the optional default reference).
No entity command file matches.

### Step 2 — Align summary-hint copy in five `formatSummary` functions

**Intent:** The bullet printed under each entity's default summary advertises
"IDs" only, matching the new `--list` shape.

**Modified:** `level.js`, `discipline.js`, `track.js`, `behaviour.js`,
`driver.js`. (`skill.js` already prints "for IDs" at L54 — leave untouched.)

**Change per file:**

| File | Line | Before | After |
|---|---|---|---|
| `level.js` | 68 | `"Run 'npx fit-pathway level --list' for IDs and titles"` | `"Run 'npx fit-pathway level --list' for IDs"` |
| `discipline.js` | 56 | `"Run 'npx fit-pathway discipline --list' for IDs and names"` | `"Run 'npx fit-pathway discipline --list' for IDs"` |
| `track.js` | 62 | `"Run 'npx fit-pathway track --list' for IDs and names"` | `"Run 'npx fit-pathway track --list' for IDs"` |
| `behaviour.js` | 54 | `"Run 'npx fit-pathway behaviour --list' for IDs and names"` | `"Run 'npx fit-pathway behaviour --list' for IDs"` |
| `driver.js` | 60 | `"Run 'npx fit-pathway driver --list' for IDs and names"` | `"Run 'npx fit-pathway driver --list' for IDs"` |

**Verification:** `rg -n "for IDs and (titles|names)" products/pathway/src/`
returns zero matches.

### Step 3 — Realign rendered output blocks in two guides

**Intent:** The two guides that show rendered multi-column `--list` output now
show one id per line. Synthetic example IDs are preserved (the guide already
declares "your organization's values will differ"); only the row shape changes.

**Modified:**
`websites/fit/docs/products/career-paths/index.md`,
`websites/fit/docs/products/authoring-standards/define-role/index.md`.

**Career Paths guide changes:**

| Lines | Action |
|---|---|
| 34–40 (discipline output block) | Replace 5 multi-column rows with 5 id-only lines: `clinical_informatics`, `data_engineering`, `engineering_management`, `quality_engineering`, `software_engineering` |
| 42–43 (prose under the block) | Rewrite to: "Each line is a discipline ID. Note the one that matches your current role; you will use it in later commands." (Drops the now-stale "first column / last column" reference; preserves the "match your current role" hook.) |
| 51–58 (level output block) | Replace 6 multi-column rows with 6 id-only lines: `J040`, `J060`, `J070`, `J080`, `J090`, `J100` |
| 60–61 (prose under the block) | Rewrite to: "Each line is a level code. Find the one that matches your current role." (Drops "professional / management title" since `--list` no longer shows them; preserves the "find the row" instruction.) |
| 69–74 (track output block) | Replace 4 multi-column rows with 4 id-only lines: `ml_ops`, `platform`, `security`, `sre` |

**Define Role guide changes:**

| Lines | Action |
|---|---|
| 32–36 (discipline output block) | Replace 3 multi-column rows with 3 id-only lines: `software_engineering`, `data_engineering`, `engineering_management` |
| 46–49 (track output block) | Replace 2 multi-column rows with 2 id-only lines: `platform`, `sre` |

**Verification:** Visual inspection of each rendered `text` code block after a `--list` invocation in both files — every block holds one id per line, no header, no commas. (`rg -n ','` over the file is too broad — prose around the blocks legitimately contains commas; scope the check to the fenced blocks themselves.)

### Step 4 — Add a regression test for the `--list` shape

**Intent:** Capture the spec's first verifiable success criterion ("exactly one
id per line, with no commas, no header, and no trailing whitespace") as a
node:test that runs in CI. Tests each of the six entity command runners
against a fixture data set; asserts shape per entity.

**Created:** `products/pathway/test/list-output.test.js`.

**Test shape:**

```js
import { test, describe } from "node:test";
import assert from "node:assert";

import { runLevelCommand } from "../src/commands/level.js";
import { runDisciplineCommand } from "../src/commands/discipline.js";
import { runTrackCommand } from "../src/commands/track.js";
import { runBehaviourCommand } from "../src/commands/behaviour.js";
import { runDriverCommand } from "../src/commands/driver.js";
import { runSkillCommand } from "../src/commands/skill.js";

function captureStdout(fn) {
  const original = process.stdout.write.bind(process.stdout);
  const chunks = [];
  process.stdout.write = (chunk) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    return true;
  };
  return Promise.resolve(fn()).finally(() => {
    process.stdout.write = original;
  }).then(() => chunks.join(""));
}

const fixture = {
  levels: [{ id: "J040" }, { id: "J060" }],
  disciplines: [{ id: "software_engineering" }, { id: "data_engineering" }],
  // track.js configures `sortItems: sortTracksByName`, which sorts before the
  // --list short-circuit and reads `.name.localeCompare` — so `name` is
  // required on each track fixture entry even though `--list` does not print it.
  tracks: [
    { id: "platform", name: "Platform Engineering" },
    { id: "sre", name: "Site Reliability Engineering" },
  ],
  behaviours: [{ id: "collaboration" }, { id: "ownership" }],
  drivers: [{ id: "shipping_velocity" }],
  skills: [{ id: "testing", capability: "delivery" }],
  capabilities: [{ id: "delivery" }],
  standard: null,
};

describe("entity --list outputs id-only", () => {
  for (const [name, runner, plural] of [
    ["level", runLevelCommand, "levels"],
    ["discipline", runDisciplineCommand, "disciplines"],
    ["track", runTrackCommand, "tracks"],
    ["behaviour", runBehaviourCommand, "behaviours"],
    ["driver", runDriverCommand, "drivers"],
    ["skill", runSkillCommand, "skills"],
  ]) {
    test(`${name} --list emits one id per line, no commas, no header`, async () => {
      const out = await captureStdout(() =>
        runner({ data: fixture, args: [], options: { list: true } }),
      );
      assert.ok(!out.includes(","), "no commas");
      const lines = out.split("\n").filter((l) => l.length > 0);
      // Stronger than shape-only: pin output to fixture content and order,
      // catching ordering and content regressions in one assertion.
      const expected = fixture[plural].map((i) => i.id);
      // tracks are sorted by name; sort the expected list the same way for
      // tracks only. Everything else preserves insertion order.
      if (plural === "tracks") {
        expected.sort((a, b) => {
          const aName = fixture.tracks.find((t) => t.id === a).name;
          const bName = fixture.tracks.find((t) => t.id === b).name;
          return aName.localeCompare(bName);
        });
      }
      assert.deepStrictEqual(lines, expected);
      for (const line of lines) {
        assert.strictEqual(line, line.trim(), "no trailing whitespace");
      }
    });
  }
});
```

**Verification:** `bun test products/pathway/test/list-output.test.js` passes;
removing any of Step 1's deletions causes at least one test to fail with a
comma-present assertion.

### Step 5 — End-to-end check against the success criteria

**Intent:** Confirm every command in the spec's success-criteria table behaves
as specified before opening the implementation PR.

**Modified:** none (verification only).

**Commands to run (against the starter data, from repo root):**

```sh
DATA=--data=products/map/starter
for e in level discipline track behaviour driver skill; do
  echo "=== $e ==="
  node products/pathway/bin/fit-pathway.js "$e" --list $DATA
  node products/pathway/bin/fit-pathway.js "$e" --list $DATA | grep -c ','
done
# Default (non-list) invocation still renders the multi-column table:
node products/pathway/bin/fit-pathway.js level $DATA
# Release-notes equivalent for spec § criterion "CHANGELOG entry":
git log --oneline origin/main..HEAD | head -1   # implementation commit
gh pr view --json title --jq .title              # implementation PR title
```

**Pass condition:** every `grep -c ','` prints `0`; every block lists one id
per line; the default invocation still renders the multi-column table; the
printed summary-hint bullet says "for IDs"; the implementation PR title begins
with `feat(pathway)!:` so the breaking-change marker flows into the next
`pathway@v0.x.y` GitHub Release notes (the design-decided substitute for a
per-product CHANGELOG.md, satisfying [`spec.md` § verifiable success criteria](./spec.md#verifiable-success-criteria) row 6).

Note on the data flag: the CLI walks upward looking for `data/pathway/` and
the monorepo root has no such directory, so `--data=products/map/starter` is
mandatory for the dev-mode invocations above. End users running
`npx fit-pathway` against their own installation never need the flag.

## Execution

Single engineering agent, sequential. Steps 1, 2, 4 can land in one commit
(code + hint copy + regression test) since they are interlocking; Step 3
(docs) in a second commit for review clarity; Step 5 is the pre-push verify.
Plan does not require `technical-writer` routing — the doc changes are
mechanical realignment of fenced `text` blocks, not narrative.

PR title must use the breaking-change Conventional-Commit marker per
[`design-a.md` § Key Decisions](./design-a.md#key-decisions):
`feat(pathway)!: emit ids only from --list across entity commands (#930)`.
The `!` flows into the next `pathway@v0.x.y` release notes.

## Risks

| Risk | Why it's hidden from the plan body | Mitigation |
|---|---|---|
| Synthetic guide example IDs no longer match the starter | The guide's "your organization's values will differ" disclaimer makes the IDs illustrative, not literal — but a reviewer might flag the guide as "out of date with starter" expecting starter IDs (`software_engineering` only, `J040`/`J060` only). The plan preserves the synthetic illustration shape on purpose; this is the same convention the file uses today. | Note in the implementation PR body that the example IDs are illustrative per existing guide convention; do not replace with starter IDs. |
| `discipline.js` uses `isProfessional` + `validTracks` in both `formatListItem` (deleted) and `formatSummary` (kept) | Step 1 deletes the `formatListItem` body that reads these fields; a grep-and-prune cleanup pass could mis-read the surviving `formatSummary` references as unused. | Delete only the named `formatListItem` function and its factory reference; leave the `formatSummary` block at L42–L46 untouched. `bun run check` after Step 1 confirms no unused-import warning surfaces. |
| `process.stdout.write` monkey-patch in Step 4's test bleeds across tests if the runner throws before the `finally` runs | The `finally` clause restores the original; tests run serially under `node:test` by default; the risk surfaces only if a future contributor parallelises this file. | Keep the patch tight inside one async function; future parallel runner change is out of scope. |
