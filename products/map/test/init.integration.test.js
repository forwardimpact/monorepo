/**
 * Tests for `fit-map init`. They cover the bootstrap writer adoption. They
 * also cover the idempotency requirement that lets `substrate stage`
 * re-stage a workspace that a direct `fit-map init` call produced.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import { runInit } from "../src/commands/init.js";
import { createProductConfig } from "@forwardimpact/libconfig";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

// This is an integration test. runInit performs real fs copies into a
// tmpdir. So it threads a real createDefaultRuntime() with a quiet proc
// surface (no terminal noise). It does not patch the global
// process.stdout/stderr.
let baseDir;
let prevCwd;

/** Real fs/clock/finder runtime with a silenced proc. */
function quietRuntime() {
  const base = createDefaultRuntime();
  return {
    ...base,
    proc: {
      ...base.proc,
      stdout: { write: () => true },
      stderr: { write: () => true },
    },
  };
}

beforeEach(async () => {
  baseDir = await fs.mkdtemp(path.join(tmpdir(), "fit-map-init-"));
  prevCwd = process.cwd();
});

afterEach(async () => {
  process.chdir(prevCwd);
  try {
    await fs.rm(baseDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe("fit-map init", () => {
  test("fresh tmpdir → produces data/pathway/ (non-empty) and config/config.json = {}", async () => {
    await runInit(baseDir, quietRuntime());
    const pathwayEntries = await fs.readdir(
      path.join(baseDir, "data", "pathway"),
    );
    assert.ok(pathwayEntries.length > 0, "data/pathway/ should be non-empty");
    const config = JSON.parse(
      await fs.readFile(path.join(baseDir, "config", "config.json"), "utf8"),
    );
    assert.deepEqual(config, {});
  });

  test("re-run against the same dir is byte-stable (no `./data/pathway/ already exists` error)", async () => {
    await runInit(baseDir, quietRuntime());
    const configBefore = await fs.readFile(
      path.join(baseDir, "config", "config.json"),
    );
    await runInit(baseDir, quietRuntime());
    const configAfter = await fs.readFile(
      path.join(baseDir, "config", "config.json"),
    );
    assert.equal(configBefore.equals(configAfter), true);
  });

  test("anchor: after runInit at <outer>/inner, createProductConfig from <outer>/inner/sub resolves the local config/", async () => {
    // Plant a decoy ancestor config so a broken anchor would land on it.
    const decoyDir = path.join(baseDir, "config");
    await fs.mkdir(decoyDir, { recursive: true });
    await fs.writeFile(
      path.join(decoyDir, "config.json"),
      JSON.stringify({ marker: "decoy" }) + "\n",
    );

    const inner = path.join(baseDir, "inner");
    const sub = path.join(inner, "sub");
    await fs.mkdir(sub, { recursive: true });

    await runInit(inner, quietRuntime());

    process.chdir(sub);
    const config = await createProductConfig("map");
    // Assert against libconfig's resolved anchor. The rootDir that Config
    // exposes is the parent of the resolved `config/` directory. After
    // runInit(inner), the upward walk from `sub` must land on
    // `inner/config/`, so rootDir resolves to `inner`. Call realpath on
    // both sides to normalise on platforms that symlink tmpdir.
    assert.equal(await fs.realpath(config.rootDir), await fs.realpath(inner));
  });

  test("anchor control: without runInit, createProductConfig resolves the ancestor decoy", async () => {
    // Without bootstrap, the upward walk from `sub` skips the empty
    // `inner` and lands on the planted `<baseDir>/config/`. This test
    // asserts on the resolved anchor. That proves the resolver walked
    // upward. It does not only prove that the decoy file still exists
    // on disk.
    const decoyDir = path.join(baseDir, "config");
    await fs.mkdir(decoyDir, { recursive: true });
    await fs.writeFile(
      path.join(decoyDir, "config.json"),
      JSON.stringify({ marker: "decoy" }) + "\n",
    );
    const inner = path.join(baseDir, "inner");
    const sub = path.join(inner, "sub");
    await fs.mkdir(sub, { recursive: true });

    process.chdir(sub);
    const config = await createProductConfig("map");
    assert.equal(await fs.realpath(config.rootDir), await fs.realpath(baseDir));
    // And no local config exists at <inner>/config/.
    await assert.rejects(() => fs.stat(path.join(inner, "config")), {
      code: "ENOENT",
    });
  });
});
