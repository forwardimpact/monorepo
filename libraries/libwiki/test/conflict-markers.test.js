import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { scanConflictMarkers } from "../src/conflict-markers.js";

const kinds = (hits) => hits.map((h) => h.kind);

describe("scanConflictMarkers", () => {
  test("fires on a complete branch-merge conflict block", () => {
    const text = [
      "intro",
      "<<<<<<< HEAD",
      "ours",
      "=======",
      "theirs",
      ">>>>>>> origin/master",
      "outro",
    ].join("\n");
    assert.deepEqual(kinds(scanConflictMarkers(text)), [
      "open",
      "separator",
      "close",
    ]);
  });

  test("fires on the stash-pop label forms", () => {
    const text = [
      "<<<<<<< Updated upstream",
      "a",
      "=======",
      "b",
      ">>>>>>> Stashed changes",
    ].join("\n");
    assert.deepEqual(kinds(scanConflictMarkers(text)), [
      "open",
      "separator",
      "close",
    ]);
  });

  test("open marker fires alone (seal-severed first half)", () => {
    const text = ["before", "<<<<<<< HEAD", "ours-content"].join("\n");
    const hits = scanConflictMarkers(text);
    assert.deepEqual(kinds(hits), ["open"]);
    assert.equal(hits[0].lineNo, 2);
  });

  test("close marker fires alone; lone separator above it does NOT", () => {
    // Seal-severed second half: separator + close, no open above. The
    // separator is block-conditioned (openDepth 0) so only the close fires.
    const text = ["theirs-content", "=======", ">>>>>>> origin/master"].join(
      "\n",
    );
    const hits = scanConflictMarkers(text);
    assert.deepEqual(kinds(hits), ["close"]);
    assert.equal(hits[0].lineNo, 3);
  });

  test("lone separator (setext underline) does not fire", () => {
    const text = ["Heading", "=======", "body"].join("\n");
    assert.deepEqual(scanConflictMarkers(text), []);
  });

  test("longer marker runs do not match", () => {
    const text = ["<<<<<<<<", "========", ">>>>>>>>"].join("\n");
    assert.deepEqual(scanConflictMarkers(text), []);
  });

  test("fenceExempt suppresses markers inside a fenced code block", () => {
    const text = [
      "prose",
      "```",
      "<<<<<<< HEAD",
      "=======",
      ">>>>>>> x",
      "```",
      "more prose",
    ].join("\n");
    assert.deepEqual(scanConflictMarkers(text, { fenceExempt: true }), []);
  });

  test("fenceExempt:false fires inside a fence (data surface)", () => {
    const text = ["```", "<<<<<<< HEAD", "=======", ">>>>>>> x", "```"].join(
      "\n",
    );
    assert.deepEqual(kinds(scanConflictMarkers(text, { fenceExempt: false })), [
      "open",
      "separator",
      "close",
    ]);
  });

  test("marker quoted mid-line in a backtick span does not anchor", () => {
    const text = "a `>>>>>>> sha` and `<<<<<<< HEAD` quoted inline";
    assert.deepEqual(scanConflictMarkers(text), []);
  });

  test("separator inside an open block but tilde-fenced is still suppressed when prose", () => {
    const text = ["~~~", "<<<<<<< a", "=======", ">>>>>>> b", "~~~"].join("\n");
    assert.deepEqual(scanConflictMarkers(text, { fenceExempt: true }), []);
  });
});
