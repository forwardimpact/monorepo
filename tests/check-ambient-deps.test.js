import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  smellsInSource,
  offendersAgainstDeny,
} from "../scripts/check-ambient-deps.mjs";

const at = (src) => smellsInSource(src, "fixture.js");

describe("check-ambient-deps detector", () => {
  test("flags fs and child_process imports", () => {
    assert.ok(at(`import fs from "node:fs";`).has("import:fs"));
    assert.ok(at(`import { readFile } from "fs/promises";`).has("import:fs"));
    assert.ok(
      at(`import { spawnSync } from "node:child_process";`).has(
        "import:child_process",
      ),
    );
  });

  test("flags clock smells", () => {
    assert.ok(at(`const t = Date.now();`).has("date-now"));
    assert.ok(at(`const d = new Date();`).has("new-date"));
    assert.ok(at(`setTimeout(() => {}, 5);`).has("set-timeout"));
  });

  test("flags process smells", () => {
    assert.ok(at(`process.exit(1);`).has("process-exit"));
    assert.ok(at(`const c = process.cwd();`).has("process-cwd"));
    assert.ok(at(`const e = process.env.FOO;`).has("process-global"));
    assert.ok(at(`process.stdout.write("x");`).has("process-io"));
  });

  test("flags destructuring both fs and fsSync (design Decision 7)", () => {
    assert.ok(
      at(`function f({ fs, fsSync }) { return fs; }`).has("fs-and-fssync"),
    );
  });

  test("clean runtime-destructuring source yields no smells", () => {
    const src = `export const make = (runtime) => runtime.clock.now() + runtime.fs;`;
    assert.equal(at(src).size, 0);
  });
});

describe("offendersAgainstDeny (per-smell granularity)", () => {
  const deny = { "a.js": ["import:fs"] };

  test("a fully grandfathered file is not flagged", () => {
    const out = offendersAgainstDeny(
      [{ file: "a.js", smells: ["import:fs"] }],
      deny,
    );
    assert.equal(out.length, 0);
  });

  test("a grandfathered file that accrues a new smell is flagged", () => {
    const out = offendersAgainstDeny(
      [{ file: "a.js", smells: ["import:fs", "date-now"] }],
      deny,
    );
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].smells, ["date-now"]);
    assert.equal(out[0].grandfathered, true);
  });

  test("a non-grandfathered file is flagged for all its smells", () => {
    const out = offendersAgainstDeny(
      [{ file: "b.js", smells: ["process-exit"] }],
      deny,
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].grandfathered, false);
  });

  test("fs-and-fssync fails even for a grandfathered file", () => {
    const out = offendersAgainstDeny(
      [{ file: "a.js", smells: ["import:fs", "fs-and-fssync"] }],
      { "a.js": ["import:fs", "fs-and-fssync"] },
    );
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].smells, ["fs-and-fssync"]);
  });
});
