import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";
import { WikiPushFailure, PUSH_REASONS } from "../src/wiki-sync.js";
import { HEALTHY_PUSH, WIKI, make } from "./wiki-sync-harness.js";

describe("WikiSync commit-and-push conflict-marker publish guards", () => {
  const MARKER_ADDED = [
    "<<<<<<< HEAD",
    "ours",
    "=======",
    "x",
    ">>>>>>> y",
  ].join("\n");

  // A wiki that already carries the metrics-CSV union declaration, so
  // `commitAndPush`'s ensure-before-gate is a no-op and the bare push commits
  // its own dirty set pathspec-scoped (1850 D3/KD6), never the whole tree.
  const provisionedFs = () =>
    createMockFs({
      [`${WIKI}/.gitattributes`]: "metrics/**/*.csv merge=union\n",
    });

  test("C7: refuses mid-merge before staging or committing", async () => {
    const { wikiSync, methods } = make({
      responses: { isMidMerge: true },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, { pushed: false, reason: "mid-merge" });
    const m = methods();
    assert.deepEqual(m, ["isMidMerge"]);
    assert.ok(!m.includes("commitAll"));
    assert.ok(!m.includes("push"));
  });

  test("C8: a no-intent rebase conflict fails loud (the ours-strategy fallback is removed)", async () => {
    // The silent -X ours clobber on the no-reapply path is removed
    // (the merge-discipline fail-loud floor). A whole-tree rebase conflict now throws
    // `conflict` and never discards the remote side.
    const { wikiSync, methods } = make({
      responses: {
        ...HEALTHY_PUSH,
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 1, stderr: "CONFLICT" },
      },
    });
    await assert.rejects(
      () => wikiSync.commitAndPush("wiki: update"),
      (err) =>
        err instanceof WikiPushFailure && err.reason === PUSH_REASONS.CONFLICT,
    );
    const m = methods();
    assert.ok(m.includes("rebaseAbort"), "the rebase is aborted");
    assert.ok(!m.includes("mergeOursStrategy"), "the clobber fallback is gone");
    assert.ok(!m.includes("pushPorcelain"));
  });

  test("C9: refuses to push commits introducing a conflict block; commits stay local", async () => {
    const { wikiSync, methods } = make({
      fsSync: provisionedFs(),
      responses: {
        ...HEALTHY_PUSH,
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
        introducedByFile: new Map([["staff-engineer.md", MARKER_ADDED]]),
      },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, {
      pushed: false,
      reason: "would-publish-markers",
    });
    const m = methods();
    assert.ok(m.includes("commitPaths"), "the commit is kept local");
    assert.ok(
      !m.includes("commitAll"),
      "the whole-tree sweep is gone (1850 D3)",
    );
    assert.ok(!m.includes("push"));
  });

  test("C9: dual-lineage — each push attempt is refused independently (stateless)", async () => {
    const lane = (added) =>
      make({
        responses: {
          ...HEALTHY_PUSH,
          isMidMerge: false,
          status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
          rebase: { exitCode: 0, stderr: "" },
          revListCount: 1,
          introducedByFile: new Map([["staff-engineer.md", added]]),
        },
      });
    const a = lane(MARKER_ADDED);
    const b = lane(MARKER_ADDED);
    const ra = await a.wikiSync.commitAndPush("wiki: lane a");
    const rb = await b.wikiSync.commitAndPush("wiki: lane b");
    assert.equal(ra.reason, "would-publish-markers");
    assert.equal(rb.reason, "would-publish-markers");
  });

  test("C9: an unrelated writer with a clean added side still pushes", async () => {
    const { wikiSync } = make({
      responses: {
        ...HEALTHY_PUSH,
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
        // Pre-existing origin corruption is on the base side, never the added
        // side, so introducedByFile is clean for this writer.
        introducedByFile: new Map([["staff-engineer.md", "added clean line"]]),
      },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, {
      landed: true,
      reason: "landed",
      detections: [],
    });
  });

  test("C9: STATUS.md markers fire on the push path (not fence-exempt)", async () => {
    const statusAdded = [
      "```",
      "<<<<<<< HEAD",
      "=======",
      ">>>>>>> y",
      "```",
    ].join("\n");
    const { wikiSync } = make({
      responses: {
        ...HEALTHY_PUSH,
        isMidMerge: false,
        status: { stdout: " M STATUS.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
        introducedByFile: new Map([["STATUS.md", statusAdded]]),
      },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, {
      pushed: false,
      reason: "would-publish-markers",
    });
  });

  test("C10: clean tree with clean introduced diff syncs exactly as today", async () => {
    const { wikiSync, methods } = make({
      responses: {
        ...HEALTHY_PUSH,
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
        introducedByFile: new Map([["MEMORY.md", "ordinary added prose"]]),
      },
    });
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, {
      landed: true,
      reason: "landed",
      detections: [],
    });
    assert.ok(methods().includes("pushPorcelain"));
  });

  test("C11: introduced scan resolves shallow without deepening; a throw refuses", async () => {
    const ok = make({
      responses: {
        ...HEALTHY_PUSH,
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
        introducedByFile: new Map([["MEMORY.md", "added line"]]),
      },
    });
    const okResult = await ok.wikiSync.commitAndPush("wiki: update");
    assert.equal(okResult.landed, true);
    // No clone/deepen on the normal path — the diff decides from in-clone state.
    assert.ok(!ok.methods().includes("clone"));

    const thrown = make({
      responses: {
        ...HEALTHY_PUSH,
        isMidMerge: false,
        status: { stdout: " M MEMORY.md", stderr: "", exitCode: 0 },
        rebase: { exitCode: 0, stderr: "" },
        revListCount: 1,
      },
    });
    thrown.git.introducedByFile = async () => {
      throw new Error("fatal: bad revision 'origin/master..HEAD'");
    };
    const thrownResult = await thrown.wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(thrownResult, {
      pushed: false,
      reason: "introduced-scan-failed",
    });
    assert.notEqual(thrownResult.pushed, true);
  });
});
