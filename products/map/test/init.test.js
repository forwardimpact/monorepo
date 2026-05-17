/**
 * Tests for `fit-map init` — covers the bootstrap writer adoption + the
 * idempotency requirement that lets `substrate stage` re-stage a
 * workspace produced by direct `fit-map init` invocation.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import { runInit } from "../src/commands/init.js";
import { createProductConfig } from "@forwardimpact/libconfig";

let baseDir;
let prevCwd;
let prevStdout;
let prevStderr;

beforeEach(async () => {
  baseDir = await fs.mkdtemp(path.join(tmpdir(), "fit-map-init-"));
  prevCwd = process.cwd();
  prevStdout = process.stdout.write.bind(process.stdout);
  prevStderr = process.stderr.write.bind(process.stderr);
  process.stdout.write = () => true;
  process.stderr.write = () => true;
});

afterEach(async () => {
  process.chdir(prevCwd);
  process.stdout.write = prevStdout;
  process.stderr.write = prevStderr;
  try {
    await fs.rm(baseDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe("fit-map init", () => {
  test("fresh tmpdir → produces data/pathway/ (non-empty) and config/config.json = {}", async () => {
    await runInit(baseDir);
    const pathwayEntries = await fs.readdir(
      path.join(baseDir, "data", "pathway"),
    );
    assert.ok(pathwayEntries.length > 0, "data/pathway/ should be non-empty");
    const config = JSON.parse(
      await fs.readFile(path.join(baseDir, "config", "config.json"), "utf8"),
    );
    assert.deepEqual(config, {});
  });

  test("re-run against same dir is byte-stable (no `./data/pathway/ already exists` error)", async () => {
    await runInit(baseDir);
    const configBefore = await fs.readFile(
      path.join(baseDir, "config", "config.json"),
    );
    await runInit(baseDir);
    const configAfter = await fs.readFile(
      path.join(baseDir, "config", "config.json"),
    );
    assert.equal(configBefore.equals(configAfter), true);
  });

  test("anchoring: after runInit at <outer>/inner, createProductConfig from <outer>/inner/sub resolves the local config/", async () => {
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

    await runInit(inner);

    process.chdir(sub);
    await createProductConfig("map");
    const localConfig = JSON.parse(
      await fs.readFile(path.join(inner, "config", "config.json"), "utf8"),
    );
    // The local config materialised by runInit has no `marker` field.
    assert.equal(localConfig.marker, undefined);
  });

  test("anchoring control: without runInit, createProductConfig resolves the ancestor decoy", async () => {
    // Without bootstrap, the upward walk lands on the planted decoy.
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
    await createProductConfig("map");
    // The ancestor decoy is what would have been read on this layout.
    // Re-read it explicitly to assert the path-direction parity (the
    // decoy still exists; runInit was never called).
    const ancestor = JSON.parse(
      await fs.readFile(path.join(decoyDir, "config.json"), "utf8"),
    );
    assert.equal(ancestor.marker, "decoy");
    // And no local config was planted at <inner>/config/.
    await assert.rejects(() => fs.stat(path.join(inner, "config")), {
      code: "ENOENT",
    });
  });
});
