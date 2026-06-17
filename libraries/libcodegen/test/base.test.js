import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

import protoLoader from "@grpc/proto-loader";
import mustache from "mustache";

import { CodegenBase } from "@forwardimpact/libcodegen";
import { registerAssets, withEmbeddedAssets } from "@forwardimpact/libcli";
import { createTestRuntime } from "@forwardimpact/libmock";

const projectRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../..",
);

function discoverProtoDirs() {
  const dirs = [];
  const scopeDir = path.join(projectRoot, "node_modules", "@forwardimpact");
  if (fs.existsSync(scopeDir)) {
    for (const name of fs.readdirSync(scopeDir)) {
      const protoDir = path.join(scopeDir, name, "proto");
      if (fs.existsSync(protoDir) && fs.statSync(protoDir).isDirectory()) {
        dirs.push(fs.realpathSync(protoDir));
      }
    }
  }
  const own = path.join(projectRoot, "proto");
  if (fs.existsSync(own)) dirs.push(own);
  return dirs;
}

function createBase(injectedFs = fs) {
  return new CodegenBase(
    discoverProtoDirs(),
    projectRoot,
    path,
    mustache,
    protoLoader,
    injectedFs,
    createTestRuntime(),
  );
}

// Declared FIRST: `registerAssets` (called in the embedded block below) writes a
// process-global registry that flips `embeddedAssetsActive()` true for the rest
// of the file, so loadTemplate's on-disk branch must be exercised before any
// registration. node:test runs top-level describe/test in declaration order.
describe("CodegenBase.loadTemplate (source branch)", () => {
  test("returns each of the five rendered template kinds", () => {
    const base = createBase();
    for (const kind of [
      "service",
      "client",
      "definition",
      "services-exports",
      "definitions-exports",
    ]) {
      const tpl = base.loadTemplate(kind);
      assert.ok(
        typeof tpl === "string" && tpl.length > 0,
        `expected non-empty template for ${kind}`,
      );
    }
  });

  test("throws Missing <kind>.js.mustache for an unknown kind", () => {
    const base = createBase();
    assert.throws(
      () => base.loadTemplate("does-not-exist"),
      /Missing does-not-exist\.js\.mustache template/,
    );
  });
});

// Declared LAST: registering a mount flips the global flag, so loadTemplate
// takes the embedded branch (embeddedDir + overlay) for the rest of the process.
describe("CodegenBase.loadTemplate (embedded branch)", () => {
  test("resolves templates from the registered mount via the overlay fs", () => {
    registerAssets("libcodegen/templates", {
      "service.js.mustache": "EMBEDDED",
    });
    const embeddedFs = withEmbeddedAssets(createTestRuntime()).fsSync;
    const base = createBase(embeddedFs);
    assert.strictEqual(base.loadTemplate("service"), "EMBEDDED");
  });
});
