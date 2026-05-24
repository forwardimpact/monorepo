import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));

test("proto files are present on disk", () => {
  for (const name of ["tool.proto", "common.proto", "resource.proto"]) {
    const protoPath = join(packageDir, "proto", name);
    assert.equal(existsSync(protoPath), true, `${name} should exist`);
  }
});

test("package exports an empty namespace", async () => {
  const ns = await import("@forwardimpact/libproto");
  assert.equal(Object.keys(ns).length, 0);
});
