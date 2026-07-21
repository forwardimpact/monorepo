import { test, describe } from "node:test";
import assert from "node:assert";
import { readdir } from "node:fs/promises";

import {
  checkInvariants,
  findInvariantsRoot,
  runRuleModules,
} from "../src/index.js";
import { createTestRuntime } from "@forwardimpact/libmock";

describe("runRuleModules", () => {
  test("applies a module's rules over its built subjects with ctx", async () => {
    const mod = {
      name: "demo",
      build: async () => ({
        subjects: {
          thing: [
            { path: "/repo/a.txt", count: 3 },
            { path: "/repo/b.txt", count: 1 },
          ],
        },
        ctx: { max: 2 },
      }),
      rules: [
        {
          id: "demo.count",
          scope: "thing",
          severity: "fail",
          check: (s, c) => (s.count > c.max ? { count: s.count } : null),
          message: (s, r) => `count ${r.count} too high`,
          hint: "lower the count",
        },
      ],
    };
    const findings = await runRuleModules([mod], {
      root: "/repo",
      runtime: createTestRuntime(),
      dir: "/repo/rules/invariants",
    });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].id, "demo.count");
    assert.equal(findings[0].level, "fail");
    assert.equal(findings[0].path, "/repo/a.txt");
    assert.match(findings[0].message, /count 3/);
    assert.equal(findings[0].hint, "lower the count");
  });
});

describe("checkInvariants", () => {
  test("loads *.rules.mjs modules from disk and runs them", async () => {
    const runtime = createTestRuntime({ fs: { readdir } });
    const findings = await checkInvariants({
      root: import.meta.dirname,
      rulesDir: "fixtures/invariants",
      runtime,
    });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].id, "demo.count");
    assert.equal(findings[0].path, "/repo/a.txt");
  });

  test("rejects when the rules dir is missing", async () => {
    const runtime = createTestRuntime({
      fs: {
        readdir: async () => {
          throw new Error("ENOENT");
        },
      },
    });
    await assert.rejects(
      checkInvariants({
        root: "/nowhere",
        rulesDir: "rules/invariants",
        runtime,
      }),
      /rules directory not found/,
    );
  });
});

describe("findInvariantsRoot", () => {
  test("prefers the passed rules dir over the nearest package.json", () => {
    const runtime = createTestRuntime({
      proc: { cwd: () => "/repo/libraries/libfoo/src" },
      finder: {
        findUpward: (start, rel) =>
          rel === "rules/invariants" ? "/repo/rules/invariants" : null,
        findProjectRoot: () => "/repo/libraries/libfoo",
      },
    });
    assert.equal(findInvariantsRoot(runtime, "rules/invariants"), "/repo");
  });

  test("falls back to the nearest project root", () => {
    const runtime = createTestRuntime({
      proc: { cwd: () => "/somewhere/else" },
      finder: {
        findUpward: () => null,
        findProjectRoot: () => "/somewhere/else",
      },
    });
    assert.equal(
      findInvariantsRoot(runtime, "rules/invariants"),
      "/somewhere/else",
    );
  });
});
