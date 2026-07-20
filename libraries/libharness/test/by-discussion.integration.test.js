import { test, describe } from "node:test";
import assert from "node:assert";
import nodeFsSync from "node:fs";
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findTracesByDiscussion } from "../src/commands/by-discussion.js";

function writeTrace(dir, name, firstEvent, mtimeSec) {
  const path = join(dir, name);
  writeFileSync(
    path,
    `${JSON.stringify(firstEvent)}\n{"source":"agent","seq":1}\n`,
  );
  if (mtimeSec !== undefined) {
    utimesSync(path, mtimeSec, mtimeSec);
  }
  return path;
}

describe("gemba-trace by-discussion", () => {
  test("lists matching traces ordered by file mtime ascending", () => {
    const dir = mkdtempSync(join(tmpdir(), "by-discussion-"));
    try {
      const newer = writeTrace(
        dir,
        "newer.ndjson",
        {
          source: "orchestrator",
          seq: 0,
          event: { type: "meta", discussion_id: "GD_x" },
        },
        2_000_000_000,
      );
      const older = writeTrace(
        dir,
        "older.ndjson",
        {
          source: "orchestrator",
          seq: 0,
          event: { type: "meta", discussion_id: "GD_x" },
        },
        1_000_000_000,
      );
      writeTrace(
        dir,
        "other.ndjson",
        {
          source: "orchestrator",
          seq: 0,
          event: { type: "meta", discussion_id: "GD_other" },
        },
        1_500_000_000,
      );

      const matches = findTracesByDiscussion(dir, "GD_x", nodeFsSync);

      assert.deepStrictEqual(
        matches.map((m) => m.path),
        [older, newer],
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns an empty list when no trace matches", () => {
    const dir = mkdtempSync(join(tmpdir(), "by-discussion-"));
    try {
      writeTrace(dir, "a.ndjson", {
        source: "orchestrator",
        seq: 0,
        event: { type: "meta", discussion_id: "GD_other" },
      });
      assert.deepStrictEqual(
        findTracesByDiscussion(dir, "GD_x", nodeFsSync),
        [],
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("skips traces without a meta header and traces with malformed first lines", () => {
    const dir = mkdtempSync(join(tmpdir(), "by-discussion-"));
    try {
      writeFileSync(
        join(dir, "no-meta.ndjson"),
        `${JSON.stringify({ source: "agent", seq: 0 })}\n`,
      );
      writeFileSync(join(dir, "bad.ndjson"), "not json at all\n");
      writeTrace(dir, "good.ndjson", {
        source: "orchestrator",
        seq: 0,
        event: { type: "meta", discussion_id: "GD_x" },
      });

      const matches = findTracesByDiscussion(dir, "GD_x", nodeFsSync);
      assert.strictEqual(matches.length, 1);
      assert.ok(matches[0].path.endsWith("good.ndjson"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns an empty list when the directory does not exist", () => {
    assert.deepStrictEqual(
      findTracesByDiscussion("/nonexistent-path-zzz", "GD_x", nodeFsSync),
      [],
    );
  });
});
