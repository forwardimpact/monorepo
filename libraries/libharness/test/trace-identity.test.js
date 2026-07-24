import { describe, test } from "node:test";
import assert from "node:assert";

import {
  isValidTaskId,
  buildCaseId,
  rawTraceFilename,
  laneFilename,
  parseIdentity,
  participantInNames,
  nameMatchesKey,
} from "../src/trace-identity.js";

describe("trace-identity", () => {
  describe("isValidTaskId", () => {
    test("accepts hyphenated single-segment ids", () => {
      assert.ok(isValidTaskId("a-b"));
      assert.ok(isValidTaskId("fix-flaky-test"));
      assert.ok(isValidTaskId("task1"));
    });

    test("rejects ids containing the -- delimiter", () => {
      assert.strictEqual(isValidTaskId("a--b"), false);
    });

    test("rejects ids with a leading or trailing hyphen", () => {
      assert.strictEqual(isValidTaskId("-a"), false);
      assert.strictEqual(isValidTaskId("a-"), false);
    });

    test("rejects empty and non-string ids", () => {
      assert.strictEqual(isValidTaskId(""), false);
      assert.strictEqual(isValidTaskId(undefined), false);
      assert.strictEqual(isValidTaskId(42), false);
    });
  });

  describe("buildCaseId", () => {
    test("builds <taskId>-r<runIndex>", () => {
      assert.strictEqual(buildCaseId("fix-bug", 0), "fix-bug-r0");
      assert.strictEqual(buildCaseId("task", 12), "task-r12");
    });

    test("throws on an invalid task id", () => {
      assert.throws(() => buildCaseId("a--b", 0), /invalid task id/);
      assert.throws(() => buildCaseId("-a", 0), /invalid task id/);
      assert.throws(() => buildCaseId("a-", 0), /invalid task id/);
    });

    test("throws on a non-integer or negative run index", () => {
      assert.throws(() => buildCaseId("task", -1), /invalid run index/);
      assert.throws(() => buildCaseId("task", 1.5), /invalid run index/);
      assert.throws(() => buildCaseId("task", "0"), /invalid run index/);
    });
  });

  describe("build → parse round-trip (spec criterion 4)", () => {
    // Two tasks × two run indexes: every emitted lane filename parses back to
    // its own (case, participant), and every case id is distinct across the
    // grid — shards partition this same grid, so shard-uniqueness follows.
    const TASKS = ["fix-bug", "add-feature"];
    const RUN_INDEXES = [0, 1];

    test("case ids are unique across the grid", () => {
      const ids = new Set();
      for (const task of TASKS) {
        for (const idx of RUN_INDEXES) {
          ids.add(buildCaseId(task, idx));
        }
      }
      assert.strictEqual(ids.size, TASKS.length * RUN_INDEXES.length);
    });

    test("lane filenames round-trip through parseIdentity", () => {
      for (const task of TASKS) {
        for (const idx of RUN_INDEXES) {
          const caseId = buildCaseId(task, idx);
          for (const [participant, role] of [
            ["agent", "agent"],
            ["supervisor", "supervisor"],
            ["judge", "judge"],
          ]) {
            const name = laneFilename(caseId, participant, role);
            assert.deepStrictEqual(parseIdentity(name), {
              caseName: caseId,
              participant,
            });
          }
        }
      }
    });

    test("raw filename parses through the basename fallback", () => {
      const name = rawTraceFilename(buildCaseId("fix-bug", 3));
      assert.strictEqual(name, "trace--fix-bug-r3.raw.ndjson");
      assert.deepStrictEqual(parseIdentity(name), {
        caseName: "trace--fix-bug-r3.raw",
        participant: null,
      });
    });
  });

  describe("filename builders", () => {
    test("rawTraceFilename follows the convention", () => {
      assert.strictEqual(rawTraceFilename("t-r0"), "trace--t-r0.raw.ndjson");
    });

    test("laneFilename follows the convention", () => {
      assert.strictEqual(
        laneFilename("t-r0", "judge", "judge"),
        "trace--t-r0--judge.judge.ndjson",
      );
      assert.strictEqual(
        laneFilename("default", "staff-engineer", "agent"),
        "trace--default--staff-engineer.agent.ndjson",
      );
    });
  });

  describe("parseIdentity", () => {
    test("parses the split convention", () => {
      assert.deepStrictEqual(
        parseIdentity("/x/trace--my-case--staff-engineer.agent.ndjson"),
        { caseName: "my-case", participant: "staff-engineer" },
      );
    });

    test("falls back to extension-stripped basename", () => {
      assert.deepStrictEqual(parseIdentity("/x/structured.ndjson"), {
        caseName: "structured",
        participant: null,
      });
    });
  });

  describe("participantInNames", () => {
    test("matrix artifact name matches the whole participant", () => {
      assert.ok(
        participantInNames(["trace--release-engineer"], "release-engineer"),
      );
    });

    test("dispatch member filename matches the participant segment", () => {
      assert.ok(
        participantInNames(
          ["trace--default--release-engineer.agent.ndjson"],
          "release-engineer",
        ),
      );
    });

    test("does not match a participant that is only a prefix", () => {
      assert.strictEqual(
        participantInNames(["trace--release-engineer"], "release"),
        false,
      );
      assert.strictEqual(
        participantInNames(
          ["trace--default--release-engineer.agent.ndjson"],
          "release",
        ),
        false,
      );
    });

    test("ignores non-trace names", () => {
      assert.strictEqual(
        participantInNames(["logs", "report.json"], "release-engineer"),
        false,
      );
    });
  });

  describe("nameMatchesKey", () => {
    const LANE = "trace--fix-bug-r0--agent.agent.ndjson";

    test("matches the exact basename", () => {
      assert.ok(nameMatchesKey(LANE, LANE));
    });

    test("matches the case segment", () => {
      assert.ok(nameMatchesKey(LANE, "fix-bug-r0"));
    });

    test("matches the participant segment", () => {
      assert.ok(nameMatchesKey(LANE, "agent"));
      assert.ok(
        nameMatchesKey(
          "trace--default--release-engineer.agent.ndjson",
          "release-engineer",
        ),
      );
    });

    test("matches a bare artifact name as a participant key", () => {
      assert.ok(nameMatchesKey("trace--staff-engineer", "staff-engineer"));
    });

    test("does not match unrelated keys or segment prefixes", () => {
      assert.strictEqual(nameMatchesKey(LANE, "fix-bug"), false);
      assert.strictEqual(nameMatchesKey(LANE, "supervisor"), false);
      assert.strictEqual(nameMatchesKey("results.jsonl", "agent"), false);
    });
  });
});
