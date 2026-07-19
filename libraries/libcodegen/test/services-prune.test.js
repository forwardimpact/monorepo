/**
 * runExports prunes generated/services dirs whose proto no longer
 * exists — the generated tree is machine-owned, so a proto rename is
 * fixed by re-running codegen alone instead of leaving the old dir to
 * poison exports.js.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import protoLoader from "@grpc/proto-loader";
import mustache from "mustache";

import { CodegenBase, CodegenServices } from "@forwardimpact/libcodegen";
import { createTestRuntime } from "@forwardimpact/libmock";

describe("CodegenServices.runExports pruning", () => {
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

      assert.ok(!fs.existsSync(staleDir), "stale dir should be removed");
      assert.ok(fs.existsSync(demoDir), "proto-backed dir should survive");
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
