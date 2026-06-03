import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import { bootstrapProject as _bootstrapProject } from "../src/bootstrap.js";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

// bootstrapProject requires an injected runtime; the tests exercise real fs,
// so thread the production runtime through a thin wrapper.
const _runtime = createDefaultRuntime();
const bootstrapProject = (opts = {}) =>
  _bootstrapProject({ ...opts, deps: { runtime: _runtime } });

let testDir;

beforeEach(async () => {
  testDir = await fs.mkdtemp(path.join(tmpdir(), "libconfig-bootstrap-"));
});

afterEach(async () => {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe("bootstrapProject — config writer", () => {
  test("empty fragment + absent config/config.json → writes {} ", async () => {
    await bootstrapProject({ target: testDir });
    const text = await fs.readFile(
      path.join(testDir, "config", "config.json"),
      "utf8",
    );
    assert.equal(JSON.parse(text).constructor, Object);
    assert.deepEqual(JSON.parse(text), {});
  });

  test("two products with disjoint top-level namespaces merge into a single config.json (nested form)", async () => {
    // Production callers ship nested top-level keys (fit-guide ships
    // `init`/`product`/`service`); the spec's first success criterion
    // calls for two callers' contributions to co-exist after sequential
    // bootstrapProject calls against the same target.
    await bootstrapProject({
      target: testDir,
      fragment: { product: { guide: { systemPrompt: "g" } } },
    });
    await bootstrapProject({
      target: testDir,
      fragment: { service: { mcp: { systemPrompt: "m" } } },
    });
    const text = await fs.readFile(
      path.join(testDir, "config", "config.json"),
      "utf8",
    );
    const parsed = JSON.parse(text);
    assert.deepEqual(parsed, {
      product: { guide: { systemPrompt: "g" } },
      service: { mcp: { systemPrompt: "m" } },
    });
  });

  test("two products sharing a top-level key but disjoint nested namespaces merge", async () => {
    // The encoding fit-guide actually uses — both callers contribute
    // under top-level `product`, but with disjoint nested namespaces
    // (`product.guide` vs `product.map`). The merge classifier must
    // deep-merge rather than refusing or silently dropping.
    await bootstrapProject({
      target: testDir,
      fragment: { product: { guide: { systemPrompt: "g" } } },
    });
    await bootstrapProject({
      target: testDir,
      fragment: { product: { map: { systemPrompt: "m" } } },
    });
    const parsed = JSON.parse(
      await fs.readFile(path.join(testDir, "config", "config.json"), "utf8"),
    );
    assert.deepEqual(parsed, {
      product: {
        guide: { systemPrompt: "g" },
        map: { systemPrompt: "m" },
      },
    });
  });

  test("re-invoking with same input is byte-stable", async () => {
    const input = {
      target: testDir,
      fragment: { product: { guide: { systemPrompt: "g" } } },
      env: { SERVICE_SECRET: "abc" },
    };
    await bootstrapProject(input);
    const configBefore = await fs.readFile(
      path.join(testDir, "config", "config.json"),
    );
    const envBefore = await fs.readFile(path.join(testDir, ".env"));
    await bootstrapProject(input);
    const configAfter = await fs.readFile(
      path.join(testDir, "config", "config.json"),
    );
    const envAfter = await fs.readFile(path.join(testDir, ".env"));
    assert.equal(configBefore.equals(configAfter), true);
    assert.equal(envBefore.equals(envAfter), true);
  });

  test("A→B→A→B converges to post-AB byte state (nested form)", async () => {
    const a = { fragment: { product: { guide: { v: 1 } } } };
    const b = { fragment: { service: { mcp: { v: 2 } } } };
    await bootstrapProject({ target: testDir, ...a });
    await bootstrapProject({ target: testDir, ...b });
    const after_ab = await fs.readFile(
      path.join(testDir, "config", "config.json"),
    );
    await bootstrapProject({ target: testDir, ...a });
    await bootstrapProject({ target: testDir, ...b });
    const after_abab = await fs.readFile(
      path.join(testDir, "config", "config.json"),
    );
    assert.equal(after_ab.equals(after_abab), true);
  });

  test("same-key-different-value refuses; config.json byte-unchanged", async () => {
    await bootstrapProject({
      target: testDir,
      fragment: { product: { x: { foo: "a" } } },
    });
    const before = await fs.readFile(
      path.join(testDir, "config", "config.json"),
    );
    await assert.rejects(
      () =>
        bootstrapProject({
          target: testDir,
          fragment: { product: { x: { foo: "b" } } },
        }),
      (err) => {
        assert.ok(err.message.includes("product.x.foo"));
        assert.ok(err.message.includes("overwrites.config"));
        assert.deepEqual(err.cause, {
          kind: "config",
          path: "product.x.foo",
          overwriteSurface: "overwrites.config",
        });
        return true;
      },
    );
    const after = await fs.readFile(
      path.join(testDir, "config", "config.json"),
    );
    assert.equal(before.equals(after), true);
  });

  test("same-key-different-value overwritten when top-level key in overwrites.config", async () => {
    await bootstrapProject({
      target: testDir,
      fragment: { product: { x: { foo: "a" } } },
    });
    await bootstrapProject({
      target: testDir,
      fragment: { product: { x: { foo: "b" } } },
      overwrites: { config: ["product"] },
    });
    const text = await fs.readFile(
      path.join(testDir, "config", "config.json"),
      "utf8",
    );
    assert.deepEqual(JSON.parse(text), { product: { x: { foo: "b" } } });
  });
});

describe("bootstrapProject — env writer", () => {
  test(".env mode is 0o600 after a fresh write", async () => {
    await bootstrapProject({
      target: testDir,
      env: { SERVICE_SECRET: "abc", MCP_TOKEN: "xyz" },
    });
    const envPath = path.join(testDir, ".env");
    const stats = await fs.stat(envPath);
    assert.equal(stats.mode & 0o777, 0o600);
  });

  test(".env mode is re-enforced to 0o600 against a pre-existing 0o644 file", async () => {
    const envPath = path.join(testDir, ".env");
    await fs.writeFile(envPath, "PRE_EXISTING=disjoint\n", { mode: 0o644 });
    await fs.chmod(envPath, 0o644);
    await bootstrapProject({
      target: testDir,
      env: { SERVICE_SECRET: "abc" },
    });
    const stats = await fs.stat(envPath);
    assert.equal(stats.mode & 0o777, 0o600);
    // Pre-existing disjoint entry preserved.
    const text = await fs.readFile(envPath, "utf8");
    assert.ok(text.includes("PRE_EXISTING=disjoint"));
    assert.ok(text.includes("SERVICE_SECRET=abc"));
  });

  test("empty env against existing .env → file byte-unchanged", async () => {
    const envPath = path.join(testDir, ".env");
    await fs.writeFile(envPath, "PRE_EXISTING=disjoint\n", { mode: 0o600 });
    const before = await fs.readFile(envPath);
    await bootstrapProject({ target: testDir, env: {} });
    const after = await fs.readFile(envPath);
    assert.equal(before.equals(after), true);
  });

  test("same-key-different-value .env refuses with bare-key diagnostic", async () => {
    await bootstrapProject({
      target: testDir,
      env: { MCP_TOKEN: "old" },
    });
    await assert.rejects(
      () =>
        bootstrapProject({
          target: testDir,
          env: { MCP_TOKEN: "new" },
        }),
      (err) => {
        assert.ok(err.message.includes("MCP_TOKEN"));
        assert.ok(err.message.includes("overwrites.env"));
        assert.equal(err.cause.kind, "env");
        assert.equal(err.cause.path, "MCP_TOKEN");
        return true;
      },
    );
  });

  test("same-key-different-value .env overwritten when key in overwrites.env", async () => {
    await bootstrapProject({
      target: testDir,
      env: { MCP_TOKEN: "old" },
    });
    await bootstrapProject({
      target: testDir,
      env: { MCP_TOKEN: "new" },
      overwrites: { env: ["MCP_TOKEN"] },
    });
    const text = await fs.readFile(path.join(testDir, ".env"), "utf8");
    assert.ok(text.includes("MCP_TOKEN=new"));
    assert.ok(!text.includes("MCP_TOKEN=old"));
  });

  test("config conflict short-circuits before any .env mutation", async () => {
    await bootstrapProject({
      target: testDir,
      fragment: { product: { x: "a" } },
    });
    const envPath = path.join(testDir, ".env");
    // No .env exists yet.
    await assert.rejects(() =>
      bootstrapProject({
        target: testDir,
        fragment: { product: { x: "b" } },
        env: { SERVICE_SECRET: "abc" },
      }),
    );
    // The .env was never created because we threw on the config conflict
    // before any FS mutation.
    await assert.rejects(() => fs.stat(envPath), { code: "ENOENT" });
  });
});
