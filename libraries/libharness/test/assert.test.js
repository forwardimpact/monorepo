import { describe, test } from "node:test";
import assert from "node:assert";

import { createMockFs } from "@forwardimpact/libmock";

import { evaluateAssertion, runAssertCommand } from "../src/commands/assert.js";

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

describe("grading flags", () => {
  test("--gate adds gate: true to the emitted row", () => {
    const file = tmpFile("hello");
    const result = evaluateAssertion(
      { exists: true, gate: true },
      ["scaffold", file],
      fs,
    );
    assert.deepStrictEqual(result, {
      test: "scaffold",
      pass: true,
      gate: true,
    });
  });

  test("--weight attaches the numeric weight", () => {
    const file = tmpFile("hello");
    const result = evaluateAssertion(
      { exists: true, weight: "2.5" },
      ["content", file],
      fs,
    );
    assert.deepStrictEqual(result, {
      test: "content",
      pass: true,
      weight: 2.5,
    });
  });

  test("--weight 0 emits a diagnostic row", () => {
    const file = tmpFile("hello");
    const result = evaluateAssertion(
      { exists: true, weight: "0" },
      ["detail", file],
      fs,
    );
    assert.deepStrictEqual(result, { test: "detail", pass: true, weight: 0 });
  });

  test("no flags leave the row shape unchanged", () => {
    const file = tmpFile("hello");
    const result = evaluateAssertion({ exists: true }, ["plain", file], fs);
    assert.deepStrictEqual(result, { test: "plain", pass: true });
  });
});

describe("runAssertCommand emit-then-fail", () => {
  function run(options, args) {
    const out = [];
    const ctx = {
      options,
      args,
      deps: {
        runtime: {
          fsSync: fs,
          proc: { stdout: { write: (s) => (out.push(s), true) } },
        },
      },
    };
    return runAssertCommand(ctx).then((envelope) => ({
      envelope,
      row: JSON.parse(out.join("")),
    }));
  }

  const invalidFlagCases = [
    ["--weight -1", { exists: true, weight: "-1" }],
    ["--weight abc", { exists: true, weight: "abc" }],
    ["--weight Infinity", { exists: true, weight: "Infinity" }],
    ["--gate --weight 2", { exists: true, gate: true, weight: "2" }],
    ["--gate --weight 0", { exists: true, gate: true, weight: "0" }],
  ];

  for (const [name, options] of invalidFlagCases) {
    test(`${name} emits a failing row and returns ok: false`, async () => {
      const file = tmpFile("hello");
      const { envelope, row } = await run(options, {
        "test-name": "t",
        file,
      });
      assert.strictEqual(envelope.ok, false);
      assert.strictEqual(row.test, "t");
      assert.strictEqual(row.pass, false);
      assert.match(row.message, /^assert: /);
      assert.ok(!("gate" in row) && !("weight" in row));
    });
  }

  test("--grep against a missing file emits a failing row and returns ok: false", async () => {
    const { envelope, row } = await run(
      { grep: "pattern" },
      { "test-name": "vanished", file: "/assert/never/created.md" },
    );
    assert.strictEqual(envelope.ok, false);
    assert.strictEqual(row.test, "vanished");
    assert.strictEqual(row.pass, false);
    assert.match(row.message, /^assert: /);
  });

  test("a plain assertion failure keeps its grading flags on the row", async () => {
    const { envelope, row } = await run(
      { exists: true, gate: true },
      { "test-name": "gone", file: "/assert/never/there.md" },
    );
    assert.strictEqual(envelope.ok, false);
    assert.deepStrictEqual(row, {
      test: "gone",
      pass: false,
      message: "/assert/never/there.md not found",
      gate: true,
    });
  });
});

describe("emit-then-fail keeps the authored role", () => {
  function run(options, args) {
    const out = [];
    const ctx = {
      options,
      args,
      deps: {
        runtime: {
          fsSync: fs,
          proc: { stdout: { write: (s) => (out.push(s), true) } },
        },
      },
    };
    return runAssertCommand(ctx).then(() => JSON.parse(out.join("")));
  }

  test("an errored --gate evaluation still emits a gate row", async () => {
    const row = await run(
      { grep: "x", gate: true },
      { "test-name": "scaffold", file: "/assert/never/deleted.md" },
    );
    assert.strictEqual(row.pass, false);
    assert.strictEqual(row.gate, true);
    assert.ok(!("weight" in row));
  });

  test("an errored --weight evaluation keeps its weight", async () => {
    const row = await run(
      { grep: "x", weight: "3" },
      { "test-name": "content", file: "/assert/never/deleted.md" },
    );
    assert.strictEqual(row.pass, false);
    assert.strictEqual(row.weight, 3);
  });

  test("a blank --weight is invalid and emits a role-less failing row", async () => {
    const file = tmpFile("hello");
    const row = await run(
      { exists: true, weight: "  " },
      { "test-name": "blank", file },
    );
    assert.strictEqual(row.pass, false);
    assert.match(row.message, /invalid --weight/);
    assert.ok(!("weight" in row));
  });
});
