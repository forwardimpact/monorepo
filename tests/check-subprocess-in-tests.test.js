import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { spawnsProjectBin } from "../scripts/check-subprocess-in-tests.mjs";

const spawns = (src) => spawnsProjectBin(src, "fixture.test.js");

describe("check-subprocess-in-tests detector", () => {
  test("flags spawning node", () => {
    assert.ok(spawns(`spawnSync("node", [binPath, "claim"]);`));
    assert.ok(spawns(`execFileSync("node", ["bin/fit-wiki.js"]);`));
  });

  test("flags spawning a project bin path", () => {
    assert.ok(spawns(`execFileSync("./bin/fit-map.js", ["--help"]);`));
    assert.ok(spawns(`spawn("/abs/path/bin/fit-x.js", []);`));
  });

  test("flags member-call spawn (cp.spawnSync)", () => {
    assert.ok(spawns(`cp.spawnSync("node", [bin]);`));
  });

  test("does not flag spawning unrelated binaries", () => {
    assert.equal(spawns(`spawnSync("git", ["status"]);`), false);
    assert.equal(spawns(`execFileSync("ls", ["-la"]);`), false);
  });
});
