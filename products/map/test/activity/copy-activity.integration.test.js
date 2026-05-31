/**
 * Tests for the `copyActivity` helper at
 * `products/map/src/lib/copy-activity.js`. Each test uses an isolated
 * temp source and target so it is hermetic against the monorepo's real
 * `data/activity/` tree.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { copyActivity } from "../../src/lib/copy-activity.js";

// Integration test: copyActivity does real fs.cp into a tmpdir, so it threads
// a real createDefaultRuntime().
const runtime = createDefaultRuntime();

describe("copyActivity", () => {
  let source;
  let target;

  beforeEach(async () => {
    source = await fs.mkdtemp(path.join(tmpdir(), "copy-activity-src-"));
    target = await fs.mkdtemp(path.join(tmpdir(), "copy-activity-dst-"));
  });

  afterEach(async () => {
    for (const d of [source, target]) {
      try {
        await fs.rm(d, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  test("copies a nested source tree to <target>/data/activity/", async () => {
    await fs.writeFile(path.join(source, "a.txt"), "alpha");
    await fs.mkdir(path.join(source, "sub"));
    await fs.writeFile(path.join(source, "sub", "b.txt"), "beta");

    await copyActivity({ source, target, runtime });

    const sourcePaths = await listRelative(source);
    const destPaths = await listRelative(path.join(target, "data", "activity"));
    assert.deepEqual(destPaths, sourcePaths);
  });

  test("idempotent re-run resolves without throwing and leaves tree unchanged", async () => {
    await fs.writeFile(path.join(source, "a.txt"), "alpha");
    await fs.mkdir(path.join(source, "sub"));
    await fs.writeFile(path.join(source, "sub", "b.txt"), "beta");

    await copyActivity({ source, target, runtime });
    const firstPaths = await listRelative(
      path.join(target, "data", "activity"),
    );

    await copyActivity({ source, target, runtime });
    const secondPaths = await listRelative(
      path.join(target, "data", "activity"),
    );

    assert.deepEqual(secondPaths, firstPaths);
  });

  test("missing source throws an Error whose message names the absent path", async () => {
    const absent = path.join(source, "does-not-exist");
    await assert.rejects(
      () => copyActivity({ source: absent, target, runtime }),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes(absent),
          `expected error message to include ${absent}, got: ${err.message}`,
        );
        // raw error — no envelope prefix from runPhase
        assert.ok(
          !err.message.startsWith("[substrate stage:"),
          `expected raw error without envelope prefix, got: ${err.message}`,
        );
        return true;
      },
    );
  });
});

async function listRelative(root) {
  const out = [];
  async function walk(dir, rel) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        out.push(r + "/");
        await walk(full, r);
      } else {
        out.push(r);
      }
    }
  }
  await walk(root, "");
  out.sort();
  return out;
}
