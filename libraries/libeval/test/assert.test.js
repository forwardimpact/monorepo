import { describe, test } from "node:test";
import assert from "node:assert";

import { createMockFs } from "@forwardimpact/libmock";

import { evaluateAssertion } from "../src/commands/assert.js";

// A single in-memory fs accumulates every seeded input file; `evaluateAssertion`
// reads inputs via this sync surface (`existsSync` / `readFileSync`). Each
// helper writes to a fresh path so seeds never collide across cases.
const fs = createMockFs();
let seq = 0;

function seed(name, content) {
  const file = `/assert/${seq++}/${name}`;
  fs.writeFileSync(file, content);
  return file;
}

function tmpFile(content) {
  return seed("input.txt", content);
}

function tmpJson(data) {
  return seed("input.json", JSON.stringify(data));
}

function tmpNdjson(lines) {
  return seed(
    "input.ndjson",
    lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
  );
}

describe("fit-trace assert", () => {
  describe("--exists", () => {
    test("pass when file exists", () => {
      const file = tmpFile("hello");
      const result = evaluateAssertion(
        { exists: true },
        ["file-check", file],
        fs,
      );
      assert.deepStrictEqual(result, { test: "file-check", pass: true });
    });

    test("fail when file missing", () => {
      const result = evaluateAssertion(
        { exists: true },
        ["file-check", "/tmp/no-such-file-ever-" + Date.now()],
        fs,
      );
      assert.strictEqual(result.test, "file-check");
      assert.strictEqual(result.pass, false);
      assert.ok(result.message.includes("not found"));
    });

    test("--not inverts: fail when file exists", () => {
      const file = tmpFile("hello");
      const result = evaluateAssertion(
        { exists: true, not: true },
        ["should-be-gone", file],
        fs,
      );
      assert.strictEqual(result.pass, false);
    });

    test("--not inverts: pass when file missing", () => {
      const result = evaluateAssertion(
        { exists: true, not: true },
        ["should-be-gone", "/tmp/no-such-file-ever-" + Date.now()],
        fs,
      );
      assert.strictEqual(result.pass, true);
      assert.strictEqual(result.message, undefined);
    });
  });

  describe("--grep", () => {
    test("pass when pattern matches", () => {
      const file = tmpFile("## Problem\nSome description");
      const result = evaluateAssertion(
        { grep: "^## Problem" },
        ["has-problem", file],
        fs,
      );
      assert.deepStrictEqual(result, { test: "has-problem", pass: true });
    });

    test("fail when pattern does not match", () => {
      const file = tmpFile("## Introduction\nSome text");
      const result = evaluateAssertion(
        { grep: "^## Problem" },
        ["has-problem", file],
        fs,
      );
      assert.strictEqual(result.pass, false);
      assert.ok(result.message.includes("not found"));
    });

    test("case insensitive", () => {
      const file = tmpFile("## problem\nlowercase heading");
      const result = evaluateAssertion(
        { grep: "^## Problem" },
        ["has-problem", file],
        fs,
      );
      assert.strictEqual(result.pass, true);
    });

    test("extended regex with alternation", () => {
      const file = tmpFile("## Non-Goals\nStuff to skip");
      const result = evaluateAssertion(
        { grep: "^##+ (In )?Scope|^##+ Non.?Goals" },
        ["has-scope", file],
        fs,
      );
      assert.strictEqual(result.pass, true);
    });

    test("--not inverts: pass when pattern absent", () => {
      const file = tmpFile("clean content");
      const result = evaluateAssertion(
        { grep: "src/index\\.ts:[0-9]+", not: true },
        ["no-leak", file],
        fs,
      );
      assert.strictEqual(result.pass, true);
    });

    test("--not inverts: fail when pattern present", () => {
      const file = tmpFile("see src/index.ts:42 for details");
      const result = evaluateAssertion(
        { grep: "src/index\\.ts:[0-9]+", not: true },
        ["no-leak", file],
        fs,
      );
      assert.strictEqual(result.pass, false);
    });

    test("custom --message on failure", () => {
      const file = tmpFile("no heading here");
      const result = evaluateAssertion(
        { grep: "^## Problem", message: "missing problem heading" },
        ["has-problem", file],
        fs,
      );
      assert.strictEqual(result.message, "missing problem heading");
    });
  });

  describe("--query", () => {
    test("pass on truthy JMESPath result", () => {
      const file = tmpJson({ name: "spec", valid: true });
      const result = evaluateAssertion(
        { query: "name" },
        ["has-name", file],
        fs,
      );
      assert.deepStrictEqual(result, { test: "has-name", pass: true });
    });

    test("fail on null result", () => {
      const file = tmpJson({ name: "spec" });
      const result = evaluateAssertion(
        { query: "missing" },
        ["has-missing", file],
        fs,
      );
      assert.strictEqual(result.pass, false);
    });

    test("fail on empty array result", () => {
      const file = tmpJson({ items: [] });
      const result = evaluateAssertion(
        { query: "items" },
        ["has-items", file],
        fs,
      );
      assert.strictEqual(result.pass, false);
    });

    test("fail on false result", () => {
      const file = tmpJson({ enabled: false });
      const result = evaluateAssertion(
        { query: "enabled" },
        ["is-enabled", file],
        fs,
      );
      assert.strictEqual(result.pass, false);
    });

    test("works with NDJSON input", () => {
      const file = tmpNdjson([
        { type: "system", subtype: "init" },
        { type: "assistant", tool: "Edit" },
      ]);
      const result = evaluateAssertion(
        { query: "[?tool=='Edit']" },
        ["used-edit", file],
        fs,
      );
      assert.strictEqual(result.pass, true);
    });

    test("NDJSON no match returns fail", () => {
      const file = tmpNdjson([
        { type: "system", subtype: "init" },
        { type: "assistant", tool: "Read" },
      ]);
      const result = evaluateAssertion(
        { query: "[?tool=='Edit']" },
        ["used-edit", file],
        fs,
      );
      assert.strictEqual(result.pass, false);
    });

    test("--not inverts query result", () => {
      const file = tmpJson({ name: "spec" });
      const result = evaluateAssertion(
        { query: "name", not: true },
        ["no-name", file],
        fs,
      );
      assert.strictEqual(result.pass, false);
    });
  });

  describe("--cites-job", () => {
    test("pass when spec contains the citation", () => {
      const jobFile = tmpFile(
        '<job user="Platform Builders" goal="Prove Agent Changes">',
      );
      const spec = tmpFile("## JTBD\nPlatform Builders: Prove Agent Changes\n");
      const result = evaluateAssertion(
        { "cites-job": jobFile },
        ["cites-jtbd", spec],
        fs,
      );
      assert.deepStrictEqual(result, { test: "cites-jtbd", pass: true });
    });

    test("fail when spec does not contain the citation", () => {
      const jobFile = tmpFile(
        '<job user="Platform Builders" goal="Prove Agent Changes">',
      );
      const spec = tmpFile("## Problem\nNo JTBD cited here.\n");
      const result = evaluateAssertion(
        { "cites-job": jobFile },
        ["cites-jtbd", spec],
        fs,
      );
      assert.strictEqual(result.pass, false);
      assert.ok(result.message.includes("Prove Agent Changes"));
    });

    test("fail when no <job> tag in excerpt", () => {
      const jobFile = tmpFile("no tags here");
      const spec = tmpFile("## Problem\nSome content.\n");
      const result = evaluateAssertion(
        { "cites-job": jobFile },
        ["cites-jtbd", spec],
        fs,
      );
      assert.strictEqual(result.pass, false);
      assert.ok(result.message.includes("no <job> tag"));
    });
  });

  describe("validation", () => {
    test("throws when no mode specified", () => {
      assert.throws(
        () => evaluateAssertion({}, ["test-name", "/tmp/file"], fs),
        /specify one of/,
      );
    });

    test("throws when multiple modes specified", () => {
      assert.throws(
        () =>
          evaluateAssertion(
            { grep: "pattern", exists: true },
            ["test-name", "/tmp/file"],
            fs,
          ),
        /specify only one/,
      );
    });

    test("throws when test name missing", () => {
      assert.throws(
        () => evaluateAssertion({ exists: true }, [], fs),
        /missing test name/,
      );
    });

    test("throws when file missing for --grep", () => {
      assert.throws(
        () => evaluateAssertion({ grep: "pattern" }, ["test-name"], fs),
        /missing file/,
      );
    });

    test("throws when file missing for --query", () => {
      assert.throws(
        () => evaluateAssertion({ query: "name" }, ["test-name"], fs),
        /missing file/,
      );
    });
  });

  describe("output shape", () => {
    test("no message field when passing", () => {
      const file = tmpFile("## Problem");
      const result = evaluateAssertion(
        { grep: "^## Problem" },
        ["has-problem", file],
        fs,
      );
      assert.strictEqual(result.pass, true);
      assert.strictEqual("message" in result, false);
    });

    test("message field present when failing", () => {
      const file = tmpFile("no heading");
      const result = evaluateAssertion(
        { grep: "^## Problem" },
        ["has-problem", file],
        fs,
      );
      assert.strictEqual(result.pass, false);
      assert.strictEqual(typeof result.message, "string");
    });
  });
});
