import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("../bin/fit-codegen.js", import.meta.url));

// The publish smoke gate executes the bin with --help from a clean temp
// install — no project root, no proto directories. Flag handling must
// therefore complete before any filesystem discovery runs.
describe("fit-codegen bin in a bare directory", () => {
  let bareDir;

  before(() => {
    bareDir = fs.mkdtempSync(path.join(os.tmpdir(), "fit-codegen-bare-"));
  });

  after(() => {
    fs.rmSync(bareDir, { recursive: true, force: true });
  });

  function run(args) {
    return spawnSync("node", [bin, ...args], {
      cwd: bareDir,
      encoding: "utf8",
    });
  }

  test("--help exits 0 and prints usage", () => {
    const result = run(["--help"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage: fit-codegen/);
  });

  test("--version exits 0 and prints the version", () => {
    const result = run(["--version"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^\d+\.\d+\.\d+/);
  });

  test("no flags exits 2 with the usage error", () => {
    const result = run([]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /no generation flags specified/);
  });
});
