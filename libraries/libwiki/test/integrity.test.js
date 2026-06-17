import { test, describe } from "node:test";
import assert from "node:assert";

import { createMockGitClient } from "@forwardimpact/libmock";

import {
  parseDiff,
  findAbsent,
  previousSessionWindow,
  makeDetection,
  renderDetections,
  normLine,
  sweepTier2,
} from "../src/integrity.js";
import { SESSION_GAP_MS } from "../src/constants.js";

describe("parseDiff", () => {
  test("attributes +/- lines to the file from the +++ b/ header", () => {
    const diff = [
      "diff --git a/x.md b/x.md",
      "index 111..222 100644",
      "--- a/x.md",
      "+++ b/x.md",
      "@@ -0,0 +1 @@",
      "+hello",
      "diff --git a/y.md b/y.md",
      "--- a/y.md",
      "+++ b/y.md",
      "@@ -1 +0,0 @@",
      "-bye",
    ].join("\n");
    const recs = parseDiff(diff);
    assert.deepStrictEqual(recs, [
      { home: "x.md", added: ["hello"], removed: [] },
      { home: "y.md", added: [], removed: ["bye"] },
    ]);
  });

  test("keeps /dev/null as the home for pure deletions", () => {
    const diff = ["--- a/z.md", "+++ /dev/null", "@@ -1 +0,0 @@", "-gone"].join(
      "\n",
    );
    assert.deepStrictEqual(parseDiff(diff), [
      { home: "/dev/null", added: [], removed: ["gone"] },
    ]);
  });
});

describe("findAbsent", () => {
  const change = (home, added, removed = []) => ({ home, added, removed });

  test("present line yields no absence (crit 1)", () => {
    const out = findAbsent([change("a.md", ["x"])], "x\n", normLine);
    assert.deepStrictEqual(out, []);
  });

  test("erased line is named absent (crit 2)", () => {
    const out = findAbsent([change("a.md", ["x"])], "other\n", normLine);
    assert.deepStrictEqual(out, [{ contentId: "x", pushHome: "a.md" }]);
  });

  test("rotated line in a different tip file is present (crit 4)", () => {
    const out = findAbsent(
      [change("a-2026-W21.md", ["row"])],
      "# part\nrow\n",
      normLine,
    );
    assert.deepStrictEqual(out, []);
  });

  test("own-deleted line is never reported absent (crit 5)", () => {
    const out = findAbsent(
      [change("a.md", ["x"]), change("a.md", [], ["x"])],
      "nothing\n",
      normLine,
    );
    assert.deepStrictEqual(out, []);
  });

  test("empty changes yield no absence", () => {
    assert.deepStrictEqual(findAbsent([], "anything\n", normLine), []);
  });

  test("blank assertions are ignored", () => {
    assert.deepStrictEqual(
      findAbsent([change("a.md", ["", "  "])], "", normLine),
      [],
    );
  });
});

describe("previousSessionWindow", () => {
  const s = 1; // 1 second
  const min = 60 * s;
  // newest-first commits with epoch-second `when`
  test("empty history is vacuous (crit 7 first clause)", () => {
    assert.deepStrictEqual(previousSessionWindow([], SESSION_GAP_MS), {
      kind: "vacuous",
    });
  });

  test("a single run of N commits is the window (all N)", () => {
    const commits = [
      { sha: "c", when: 1000 + 2 * min },
      { sha: "b", when: 1000 + 1 * min },
      { sha: "a", when: 1000 },
    ];
    const w = previousSessionWindow(commits, SESSION_GAP_MS);
    assert.strictEqual(w.kind, "window");
    assert.deepStrictEqual(
      w.commits.map((c) => c.sha),
      ["c", "b", "a"],
    );
  });

  test("two runs split by a >30m gap return only the newer/tip run", () => {
    const commits = [
      { sha: "new2", when: 100000 + 1 * min },
      { sha: "new1", when: 100000 },
      { sha: "old2", when: 100000 - 40 * min },
      { sha: "old1", when: 100000 - 41 * min },
    ];
    const w = previousSessionWindow(commits, SESSION_GAP_MS);
    assert.strictEqual(w.kind, "window");
    assert.deepStrictEqual(
      w.commits.map((c) => c.sha),
      ["new2", "new1"],
    );
  });

  test("a single lone commit is a one-push window", () => {
    const w = previousSessionWindow([{ sha: "only", when: 5 }], SESSION_GAP_MS);
    assert.strictEqual(w.kind, "window");
    assert.deepStrictEqual(
      w.commits.map((c) => c.sha),
      ["only"],
    );
  });
});

describe("makeDetection / renderDetections", () => {
  test("stamps a wall-clock detectedAt (crit 8)", () => {
    const d = makeDetection({
      tier: 1,
      contentId: "x",
      pushHome: "a.md",
      now: Date.parse("2026-06-17T12:00:00.000Z"),
    });
    assert.strictEqual(d.detectedAt, "2026-06-17T12:00:00.000Z");
    assert.strictEqual(d.exposure, undefined);
  });

  test("labels exposure with the commit-timestamp fallback basis (crit 8)", () => {
    const d = makeDetection({
      tier: 2,
      contentId: "x",
      pushHome: "a.md",
      now: 0,
      exposureSeconds: 42,
    });
    assert.deepStrictEqual(d.exposure, {
      seconds: 42,
      basis: "commit-timestamp",
    });
  });

  test("renders push-time home and content identity (crit 10)", () => {
    const out = renderDetections([
      makeDetection({ tier: 1, contentId: "row", pushHome: "a.md", now: 0 }),
    ]);
    assert.match(out, /a\.md/);
    assert.match(out, /row/);
  });

  test("empty detections render the empty string (crit 12 clean-path silence)", () => {
    assert.strictEqual(renderDetections([]), "");
  });
});

describe("sweepTier2 degenerate / vacuous (mock git)", () => {
  const runtime = {
    fsSync: { readdirSync: () => [], existsSync: () => false },
  };

  test("empty author identity yields a degenerate detection (crit 7)", async () => {
    const gitClient = createMockGitClient({ responses: { configGet: "" } });
    const detections = await sweepTier2({
      runtime,
      gitClient,
      wikiDir: "/w",
      agent: "staff-engineer",
      now: 0,
    });
    assert.equal(detections.length, 1);
    assert.equal(detections[0].tier, 2);
    assert.match(detections[0].contentId, /unresolvable: no author identity/);
  });

  test("empty lane history passes vacuously (crit 7)", async () => {
    const gitClient = createMockGitClient({
      responses: { configGet: "me@x", logByAuthor: [] },
    });
    const detections = await sweepTier2({
      runtime,
      gitClient,
      wikiDir: "/w",
      agent: "staff-engineer",
      now: 0,
    });
    assert.deepEqual(detections, []);
  });

  test("a window commit git cannot diff is a degenerate detection (crit 7)", async () => {
    const gitClient = createMockGitClient({
      responses: {
        configGet: "me@x",
        logByAuthor: [{ sha: "abc", when: 100 }],
        diffRange: null,
      },
    });
    const detections = await sweepTier2({
      runtime,
      gitClient,
      wikiDir: "/w",
      agent: "staff-engineer",
      now: 0,
    });
    assert.equal(detections.length, 1);
    assert.match(detections[0].contentId, /unresolvable content/);
  });
});
