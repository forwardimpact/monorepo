import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

import protoLoader from "@grpc/proto-loader";
import mustache from "mustache";

import { CodegenBase } from "@forwardimpact/libcodegen";
import {
  registerAssets,
  resetEmbeddedAssets,
  withEmbeddedAssets,
} from "@forwardimpact/libcli";
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

// `registerAssets` writes a module-global registry shared across the whole
// `bun test` process; any earlier test file (e.g. libcli's embed.test.js) that
// registers a mount leaves `embeddedAssetsActive()` true. Reset before each
// test so loadTemplate's on-disk branch is exercised from a clean,
// unregistered state regardless of file ordering — the source-branch assertions
// no longer depend on running before the embedded block.
beforeEach(() => {
  resetEmbeddedAssets();
});

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

// The `beforeEach` reset leaves an empty registry; registering a mount here
// flips the global flag so loadTemplate takes the embedded branch (embeddedDir
// + overlay). The reset confines that flag to this test, so ordering against
// the source-branch block above no longer matters.
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
