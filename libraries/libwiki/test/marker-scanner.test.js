import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { scanMarkers } from "../src/marker-scanner.js";

describe("scanMarkers", () => {
  test("returns [] for text with no markers", () => {
    const text = "# Storyboard\n\nSome prose here.\n";
    assert.deepEqual(scanMarkers(text), []);
  });

  test("finds one marker pair", () => {
    const text = [
      "#### findings_count",
      "<!-- xmr:findings_count:wiki/metrics/kata-spec/2026.csv -->",
      "**Latest:** 3 · **Status:** predictable",
      "<!-- /xmr -->",
      "some prose",
    ].join("\n");

    const pairs = scanMarkers(text);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].metric, "findings_count");
    assert.equal(pairs[0].csvPath, "wiki/metrics/kata-spec/2026.csv");
    assert.equal(pairs[0].openLine, 1);
    assert.equal(pairs[0].closeLine, 3);
  });

  test("finds two marker pairs separated by prose", () => {
    const text = [
      "<!-- xmr:alpha:a.csv -->",
      "content a",
      "<!-- /xmr -->",
      "prose between",
      "<!-- xmr:beta:b.csv -->",
      "content b",
      "<!-- /xmr -->",
    ].join("\n");

    const pairs = scanMarkers(text);
    assert.equal(pairs.length, 2);
    assert.equal(pairs[0].metric, "alpha");
    assert.equal(pairs[1].metric, "beta");
  });

  test("skips dangling open marker", () => {
    const text = ["<!-- xmr:orphan:o.csv -->", "never closed"].join("\n");

    const pairs = scanMarkers(text);
    assert.equal(pairs.length, 0);
  });

  test("malformed close marker is not recognized", () => {
    const text = [
      "<!-- xmr:metric:path.csv -->",
      "content",
      "<!-- xmr -->",
    ].join("\n");

    const pairs = scanMarkers(text);
    assert.equal(pairs.length, 0);
  });

  test("second open before close resets to new marker", () => {
    const text = [
      "<!-- xmr:first:a.csv -->",
      "content",
      "<!-- xmr:second:b.csv -->",
      "replaced content",
      "<!-- /xmr -->",
    ].join("\n");

    const pairs = scanMarkers(text);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].metric, "second");
    assert.equal(pairs[0].csvPath, "b.csv");
    assert.equal(pairs[0].openLine, 2);
    assert.equal(pairs[0].closeLine, 4);
  });

  test("close without open is ignored", () => {
    const text = ["<!-- /xmr -->", "stray close"].join("\n");

    const pairs = scanMarkers(text);
    assert.equal(pairs.length, 0);
  });

  test("tolerates inline notice text after the tag (xmr)", () => {
    const text = [
      "<!-- xmr:findings_count:wiki/metrics/kata-spec/2026.csv Do not edit. Generated from fit-wiki refresh. -->",
      "**Latest:** 3 · **Status:** predictable",
      "<!-- /xmr Do not edit. Generated from fit-wiki refresh. -->",
    ].join("\n");

    const pairs = scanMarkers(text);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].metric, "findings_count");
    assert.equal(pairs[0].csvPath, "wiki/metrics/kata-spec/2026.csv");
  });

  test("tolerates inline notice text after the tag (issue-list)", () => {
    const text = [
      "<!-- obstacles:open Do not edit. Generated from fit-wiki refresh. -->",
      "- **Obs #1 — example**",
      "<!-- /obstacles Do not edit. Generated from fit-wiki refresh. -->",
    ].join("\n");

    const pairs = scanMarkers(text);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].topic, "obstacles");
    assert.equal(pairs[0].state, "open");
  });

  test("tolerates inline notice combined with closed:30d window suffix", () => {
    const text = [
      "<!-- experiments:closed:30d Do not edit. Generated from fit-wiki refresh. -->",
      "- **Exp #2 — older entry**",
      "<!-- /experiments -->",
    ].join("\n");

    const pairs = scanMarkers(text);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].topic, "experiments");
    assert.equal(pairs[0].state, "closed");
    assert.equal(pairs[0].window, "30d");
  });
});
