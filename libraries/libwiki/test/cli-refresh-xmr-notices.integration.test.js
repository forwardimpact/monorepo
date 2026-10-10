import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { scanMarkers } from "../src/marker-scanner.js";
import {
  chartTextFor,
  makeMetricsCSV,
  twoSliceCSV,
  createRefreshProject,
  runRefresh,
} from "./helpers.js";

// Split from cli-refresh.integration.test.js (test-file-shape): this file
// owns the XmR notice family. A refresh that completes writes every xmr
// block, as a chart or as a notice that names its cause, and the marker's
// `event_type=` token picks the slice.
const FIXED_NOW = Date.UTC(2026, 4, 15);
const FIFTEEN = Array(15).fill(10);

// A single-slice file and a two-slice file that shares its first slice.
const SINGLE = makeMetricsCSV("healthy", FIFTEEN, "nightly-review");
const MIXED = twoSliceCSV("healthy", "other");

async function refresh(cwd, storyboardPath) {
  const { harness, result } = await runRefresh(cwd, {
    storyboardPath,
    now: FIXED_NOW,
    options: { format: "json" },
  });
  return { result, stdout: harness.stdout };
}

// The body between each block's markers, keyed by metric, through the
// production scanner.
function blockBodies(text) {
  const lines = text.split("\n");
  const bodies = {};
  for (const b of scanMarkers(text)) {
    bodies[b.metric] = lines.slice(b.openLine + 1, b.closeLine).join("\n");
  }
  return bodies;
}

function seedProject(files) {
  const dir = createRefreshProject();
  const csvDir = join(dir, "wiki", "metrics", "probe");
  mkdirSync(csvDir, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(csvDir, name), text);
  }
  return dir;
}

const marker = (metric, csv, tokens = "") =>
  `<!-- xmr:${metric}:wiki/metrics/probe/${csv}${tokens} Do not edit. -->`;

const block = (metric, csv, tokens) => [
  marker(metric, csv, tokens),
  "old",
  "<!-- /xmr -->",
];

describe("gemba-wiki refresh — every XmR failure is a notice in the block", () => {
  test("a board with one marker of each kind writes every block", async () => {
    const dir = seedProject({
      "single.csv": SINGLE,
      "mixed.csv": MIXED,
      "empty.csv": makeMetricsCSV("blank", [1, 2, 3], ""),
    });
    const storyboard = join(dir, "storyboard.md");
    writeFileSync(
      storyboard,
      [
        ...block("healthy", "single.csv"),
        ...block("other", "mixed.csv", " event_type=weekly-audit"),
        ...block("ambiguous", "mixed.csv"),
        ...block("absent", "single.csv"),
        ...block("missing", "nope.csv"),
        ...block("blank", "empty.csv"),
        ...block("unknown", "single.csv", " slice=x"),
        ...block("unusable", "single.csv", " prior=20260604"),
        "trailing prose",
      ].join("\n"),
    );

    const { result, stdout } = await refresh(dir, "storyboard.md");
    assert.equal(result.ok, true);
    assert.equal(JSON.parse(stdout).spliced, true);

    const after = readFileSync(storyboard, "utf-8");
    assert.ok(!after.includes("\nold\n"), "every block body is written");
    assert.ok(after.includes("trailing prose"));
    const bodies = blockBodies(after);

    // No slice over a single-slice file renders the chart.
    assert.ok(bodies.healthy.includes("**Signals:**"));
    assert.ok(
      bodies.healthy.includes(
        chartTextFor(SINGLE, "nightly-review", "healthy"),
      ),
    );
    // The marker's slice over a two-slice file renders that slice.
    assert.ok(
      bodies.other.includes(chartTextFor(MIXED, "weekly-audit", "other")),
    );
    // Each failure names its cause.
    assert.match(
      bodies.ambiguous,
      /several event_type values: nightly-review \(15 rows\), weekly-audit \(15 rows\)/,
    );
    assert.match(
      bodies.absent,
      /No rows for metric `absent` in slice `nightly-review`/,
    );
    assert.match(bodies.absent, /Values present: nightly-review \(15 rows\)/);
    assert.match(
      bodies.missing,
      /Could not read `wiki\/metrics\/probe\/nope\.csv`/,
    );
    assert.match(bodies.blank, /every row has an empty event_type \(3 rows\)/);
    assert.match(bodies.unknown, /Unknown marker token `slice=x`/);
    assert.match(
      bodies.unknown,
      /Known tokens: `event_type=<slice>`, `prior=<YYYY-MM-DD>`/,
    );
    assert.match(bodies.unusable, /Unusable value for `prior=20260604`/);
  });

  test("a token-less marker over a two-slice file names the values and the token", async () => {
    const dir = seedProject({ "mixed.csv": MIXED });
    const storyboard = join(dir, "storyboard.md");
    writeFileSync(storyboard, block("healthy", "mixed.csv").join("\n"));
    await refresh(dir, "storyboard.md");
    const body = blockBodies(readFileSync(storyboard, "utf-8")).healthy;
    assert.match(
      body,
      /several event_type values: nightly-review \(15 rows\), weekly-audit \(15 rows\)/,
    );
    assert.match(body, /Set `event_type=<slice>` on the marker/);
  });
});
