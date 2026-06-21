import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  foldAnchors,
  renderLedgerPage,
  renderMemoryRow,
  writeMemoryRowRegion,
  readMemoryRowRegion,
  extractProse,
} from "../src/ledger/projection.js";

function rec(id, kind, ids, event, note = "") {
  return { id, createdAt: "x", anchor: { kind, ids, event, note } };
}

describe("ledger projection", () => {
  test("foldAnchors assigns each label to its first-published anchor", () => {
    const { assignments, conflicts } = foldAnchors([
      rec(100, "occ", ["#97"], "aaa"),
      rec(200, "occ", ["#98"], "bbb"),
    ]);
    assert.equal(assignments.get("#97").anchor.event, "aaa");
    assert.equal(assignments.get("#98").anchor.event, "bbb");
    assert.equal(conflicts.length, 0);
  });

  test("a double-allocation resolves first-published-wins and is reported", () => {
    const { assignments, conflicts } = foldAnchors([
      rec(100, "occ", ["#97"], "first"),
      rec(150, "occ", ["#97"], "second"),
    ]);
    assert.equal(assignments.get("#97").anchor.event, "first");
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].label, "#97");
    assert.equal(conflicts[0].winner.anchor.event, "first");
    assert.deepEqual(
      conflicts[0].losers.map((l) => l.anchor.event),
      ["second"],
    );
  });

  test("rebuild is deterministic and idempotent over a fixed sequence", () => {
    const anchors = [
      rec(100, "occ", ["#97"], "aaa", "run-1"),
      rec(110, "nm", ["NM38"], "bbb"),
      rec(120, "fold", ["n=99"], "ccc"),
      rec(130, "meta", ["M47"], "ddd"),
    ];
    const a = renderLedgerPage(foldAnchors(anchors));
    const b = renderLedgerPage(foldAnchors(anchors));
    assert.equal(a.body, b.body);
    assert.match(a.body, /#97 \(event aaa\) — run-1/);
    assert.match(a.body, /NM38 \(event bbb\)/);
    assert.equal(a.missingProse.length, 0);
  });

  test("anchor-cited prose with a missing anchor is reported, not dropped", () => {
    const fold = foldAnchors([rec(100, "meta", ["M47"], "aaa")]);
    const { body, missingProse } = renderLedgerPage(fold, [
      { anchorId: 100, text: "M47 renumber map: resolve by event SHA." },
      { anchorId: 999, text: "orphaned prose citing a missing anchor." },
    ]);
    assert.match(body, /<!-- anchor:100 -->/);
    assert.match(body, /<!-- anchor:999 -->/);
    assert.deepEqual(missingProse, [999]);
  });

  test("gapped labelMode changes the conflict re-mint guidance", () => {
    const fold = foldAnchors([
      rec(100, "occ", ["#97"], "first"),
      rec(150, "occ", ["#97"], "second"),
    ]);
    const renumber = renderLedgerPage(fold, [], { labelMode: "renumber" });
    const gapped = renderLedgerPage(fold, [], { labelMode: "gapped" });
    assert.match(renumber.body, /re-mint the loser at the next free index/);
    assert.match(gapped.body, /leave the contested index as a gap/);
  });

  test("extractProse round-trips anchor-cited blocks through a render", () => {
    const fold = foldAnchors([rec(100, "meta", ["M47"], "aaa")]);
    const first = renderLedgerPage(fold, [
      { anchorId: 100, text: "M47 renumber map: resolve by event SHA." },
    ]);
    const recovered = extractProse(first.body);
    assert.deepEqual(recovered, [
      { anchorId: 100, text: "M47 renumber map: resolve by event SHA." },
    ]);
    // Re-rendering with the recovered prose is stable (rebuild preserves it).
    const second = renderLedgerPage(fold, recovered);
    assert.equal(first.body, second.body);
  });

  test("MEMORY row reports next-free indices per kind, no page edit needed", () => {
    const fold = foldAnchors([
      rec(100, "occ", ["#96", "#97"], "aaa"),
      rec(110, "nm", ["NM37"], "bbb"),
      rec(120, "fold", ["n=98"], "ccc"),
    ]);
    const row = renderMemoryRow(fold);
    assert.match(row, /next free #98/);
    assert.match(row, /NM38/);
    assert.match(row, /n=99/);
    assert.match(row, /4 ids assigned/);
  });

  test("writeMemoryRowRegion appends a region when absent, preserving narrative", () => {
    const fold = foldAnchors([rec(100, "occ", ["#96"], "aaa")]);
    const narrative =
      "# Memory Index\n\n| Parallel-collision authored narrative |\n";
    const out = writeMemoryRowRegion(narrative, fold);
    assert.match(out, /authored narrative/); // narrative preserved byte-for-byte
    assert.match(out, /<!-- ledger:memory-row -->/);
    assert.match(out, /<!-- \/ledger:memory-row -->/);
    assert.match(out, /next free #97/);
  });

  test("writeMemoryRowRegion replaces only the region interior on rebuild", () => {
    const before = writeMemoryRowRegion(
      "narrative\n",
      foldAnchors([rec(100, "occ", ["#96"], "aaa")]),
    );
    const after = writeMemoryRowRegion(
      before,
      foldAnchors([rec(100, "occ", ["#96", "#97"], "aaa")]),
    );
    // Narrative untouched, exactly one region, counter advanced.
    assert.equal(after.match(/<!-- ledger:memory-row -->/g).length, 1);
    assert.match(after, /^narrative\n/);
    assert.match(after, /next free #98/);
  });

  test("readMemoryRowRegion round-trips the written row, null when absent", () => {
    assert.equal(readMemoryRowRegion("no region here\n"), null);
    const fold = foldAnchors([rec(100, "nm", ["NM37"], "bbb")]);
    const body = writeMemoryRowRegion("x\n", fold);
    assert.equal(
      readMemoryRowRegion(body).trim(),
      renderMemoryRow(fold).trim(),
    );
  });
});
