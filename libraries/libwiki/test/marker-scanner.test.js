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
    assert.equal(pairs[0].priorReadAnchor, null);
    assert.equal(pairs[0].openLine, 1);
    assert.equal(pairs[0].closeLine, 3);
  });

  test("parses a prior= anchor token alongside csvPath and trailing notice", () => {
    const text = [
      "<!-- xmr:summary_corrections:wiki/metrics/kata-doc/2026.csv prior=2026-06-04 Do not edit. Auto-generated. -->",
      "**Signals:** —",
      "<!-- /xmr -->",
    ].join("\n");

    const pairs = scanMarkers(text);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].metric, "summary_corrections");
    assert.equal(pairs[0].csvPath, "wiki/metrics/kata-doc/2026.csv");
    assert.equal(pairs[0].priorReadAnchor, "2026-06-04");
  });

  // The marker token grammar: `key=value` words right after the
  // CSV path, in any order. The first word without `=` starts the notice.
  describe("xmr marker tokens", () => {
    const scanOne = (open) =>
      scanMarkers([open, "body", "<!-- /xmr -->"].join("\n"))[0];

    test("event_type=x parses onto the block", () => {
      const pair = scanOne("<!-- xmr:m:a.csv event_type=nightly-review -->");
      assert.equal(pair.eventType, "nightly-review");
      assert.equal(pair.priorReadAnchor, null);
      assert.deepEqual(pair.tokenErrors, []);
    });

    test("a block without tokens carries null fields and no errors", () => {
      const pair = scanOne("<!-- xmr:m:a.csv -->");
      assert.equal(pair.eventType, null);
      assert.equal(pair.priorReadAnchor, null);
      assert.deepEqual(pair.tokenErrors, []);
    });

    test("prior= and event_type= parse in either order", () => {
      for (const run of [
        "prior=2026-06-04 event_type=x",
        "event_type=x prior=2026-06-04",
      ]) {
        const pair = scanOne(`<!-- xmr:m:a.csv ${run} Do not edit. -->`);
        assert.equal(pair.eventType, "x");
        assert.equal(pair.priorReadAnchor, "2026-06-04");
        assert.deepEqual(pair.tokenErrors, []);
      }
    });

    test("an unknown key lands in tokenErrors as unknown", () => {
      const pair = scanOne("<!-- xmr:m:a.csv slice=x -->");
      assert.deepEqual(pair.tokenErrors, [
        { key: "slice", value: "x", reason: "unknown" },
      ]);
      assert.equal(pair.eventType, null);
    });

    test("an unusable prior and a bare event_type= are unusable", () => {
      const pair = scanOne("<!-- xmr:m:a.csv prior=20260604 event_type= -->");
      assert.deepEqual(pair.tokenErrors, [
        { key: "prior", value: "20260604", reason: "unusable" },
        { key: "event_type", value: "", reason: "unusable" },
      ]);
      assert.equal(pair.priorReadAnchor, null);
      assert.equal(pair.eventType, null);
    });

    test("a second event_type= is repeated and the first wins", () => {
      const pair = scanOne("<!-- xmr:m:a.csv event_type=a event_type=b -->");
      assert.equal(pair.eventType, "a");
      assert.deepEqual(pair.tokenErrors, [
        { key: "event_type", value: "b", reason: "repeated" },
      ]);
    });

    test("a prototype name is an unknown key, not a hit", () => {
      const pair = scanOne("<!-- xmr:m:a.csv constructor=x -->");
      assert.deepEqual(pair.tokenErrors, [
        { key: "constructor", value: "x", reason: "unknown" },
      ]);
    });

    test("a k=v word after free text is not a token", () => {
      const pair = scanOne("<!-- xmr:m:a.csv Do not edit event_type=x -->");
      assert.equal(pair.eventType, null);
      assert.deepEqual(pair.tokenErrors, []);
    });

    test("a token run followed by the notice text keeps the notice", () => {
      const pair = scanOne(
        "<!-- xmr:m:wiki/metrics/x/2026.csv event_type=x Do not edit. Auto-generated. -->",
      );
      assert.equal(pair.csvPath, "wiki/metrics/x/2026.csv");
      assert.equal(pair.eventType, "x");
    });

    // The one shape the grammar cannot notice: a `>` inside a value ends the
    // comment early, so the line is not an open marker at all. The scanner
    // reports no block, and the audit's balance rule reports the unpaired
    // close.
    test("a > inside a value is not an open marker", () => {
      const pairs = scanMarkers(
        ["<!-- xmr:m:a.csv event_type=a>b -->", "body", "<!-- /xmr -->"].join(
          "\n",
        ),
      );
      assert.deepEqual(pairs, []);
    });
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

  test("does not recognize a malformed close marker", () => {
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

  test("ignores a close without an open", () => {
    const text = ["<!-- /xmr -->", "stray close"].join("\n");

    const pairs = scanMarkers(text);
    assert.equal(pairs.length, 0);
  });

  test("tolerates inline notice text after the tag (xmr)", () => {
    const text = [
      "<!-- xmr:findings_count:wiki/metrics/kata-spec/2026.csv Do not edit. Generated from gemba-wiki refresh. -->",
      "**Latest:** 3 · **Status:** predictable",
      "<!-- /xmr Do not edit. Generated from gemba-wiki refresh. -->",
    ].join("\n");

    const pairs = scanMarkers(text);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].metric, "findings_count");
    assert.equal(pairs[0].csvPath, "wiki/metrics/kata-spec/2026.csv");
  });

  test("tolerates inline notice text after the tag (issue-list)", () => {
    const text = [
      "<!-- obstacles:open Do not edit. Generated from gemba-wiki refresh. -->",
      "- **Obs #1 — example**",
      "<!-- /obstacles Do not edit. Generated from gemba-wiki refresh. -->",
    ].join("\n");

    const pairs = scanMarkers(text);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].topic, "obstacles");
    assert.equal(pairs[0].state, "open");
  });

  test("tolerates inline notice combined with closed:30d window suffix", () => {
    const text = [
      "<!-- experiments:closed:30d Do not edit. Generated from gemba-wiki refresh. -->",
      "- **Exp #2 — older entry**",
      "<!-- /experiments -->",
    ].join("\n");

    const pairs = scanMarkers(text);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].topic, "experiments");
    assert.equal(pairs[0].state, "closed");
    assert.equal(pairs[0].window, "30d");
  });

  test("recognizes a paired agent-experiments block", () => {
    const text = [
      "<!-- agent-experiments Do not edit. Auto-generated. -->",
      "<!-- last-successful-sync: 2026-06-17 -->",
      "- #1694 [staff-engineer] Exp Staff (by dickolsson)",
      "<!-- /agent-experiments -->",
    ].join("\n");

    const pairs = scanMarkers(text);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].kind, "agent-experiments");
    assert.equal(pairs[0].openLine, 0);
    assert.equal(pairs[0].closeLine, 3);
  });

  test("warns on a dangling agent-experiments open marker", () => {
    const warnings = [];
    const text = ["<!-- agent-experiments -->", "- #1 [pm] x (by a)"].join(
      "\n",
    );
    const pairs = scanMarkers(text, { warn: (m) => warnings.push(m) });
    assert.equal(pairs.length, 0);
    assert.ok(warnings.some((w) => w.includes("agent-experiments")));
  });
});
