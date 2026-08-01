/**
 * runExports prunes generated/services dirs whose proto no longer
 * exists. The generated tree is machine-owned. So codegen alone fixes a
 * proto rename when you run it again. Without the prune, the old dir
 * stays and poisons exports.js.
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import protoLoader from "@grpc/proto-loader";
import mustache from "mustache";

import { CodegenBase, CodegenServices } from "@forwardimpact/libcodegen";
import { resetEmbeddedAssets } from "@forwardimpact/libcli";
import { createTestRuntime } from "@forwardimpact/libmock";

describe("CodegenServices.runExports prunes stale dirs", () => {
  // Earlier test files in the same bun process may leave the module-global
  // embedded-assets registry active (see base.test.js). loadTemplate must
  // resolve the on-disk templates here.
  beforeEach(() => {
    resetEmbeddedAssets();
  });

  test("removes stale service dirs and keeps proto-backed ones", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codegen-prune-"));
    const protoDir = path.join(tmp, "proto");
    fs.mkdirSync(protoDir, { recursive: true });
    fs.writeFileSync(path.join(protoDir, "demo.proto"), 'syntax = "proto3";\n');

    const generated = path.join(tmp, "generated");
    const demoDir = path.join(generated, "services", "demo");
    const staleDir = path.join(generated, "services", "stale");
    fs.mkdirSync(demoDir, { recursive: true });
    fs.mkdirSync(staleDir, { recursive: true });
    fs.writeFileSync(
      path.join(demoDir, "service.js"),
      "export class DemoBase {}\n",
    );
    fs.writeFileSync(
      path.join(staleDir, "service.js"),
      "export class StaleBase {}\n",
    );
    fs.writeFileSync(
      path.join(staleDir, "client.js"),
      "export class StaleClient {}\n",
    );

    const base = new CodegenBase(
      [protoDir],
      tmp,
      path,
      mustache,
      protoLoader,
      fs,
      createTestRuntime(),
    );
    const services = new CodegenServices(base);

    try {
      await services.runExports(generated);

      assert.ok(!fs.existsSync(staleDir), "the stale dir should not survive");
      assert.ok(fs.existsSync(demoDir), "the proto-backed dir should survive");
      const exportsSource = fs.readFileSync(
        path.join(generated, "services", "exports.js"),
        "utf-8",
      );
      assert.ok(exportsSource.includes("DemoBase"));
      assert.ok(!exportsSource.includes("Stale"));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
