import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createProductConfig } from "../src/index.js";

// Mocked storage that always returns no config file (no findUpward walk).
function mockStorageFn() {
  return {
    get: async () => null,
    put: async () => {},
    delete: async () => {},
    path: () => "/dev/null/config",
  };
}

async function setup(envContent) {
  const tmpdir = await mkdtemp(path.join(os.tmpdir(), "credenv-"));
  if (envContent !== null) {
    await writeFile(path.join(tmpdir, ".env"), envContent, { mode: 0o600 });
  }
  return tmpdir;
}

describe("PRODUCT_LANDMARK_TOKEN credential override", () => {
  it("loads token from .env when no shell value is set", async () => {
    const tmpdir = await setup("PRODUCT_LANDMARK_TOKEN=test-jwt-value\n");
    const config = await createProductConfig(
      "landmark",
      { token: undefined },
      { ...process, cwd: () => tmpdir, env: { PATH: process.env.PATH } },
      mockStorageFn,
    );
    assert.equal(config.token, "test-jwt-value");
    await rm(tmpdir, { recursive: true });
  });

  it("shell env wins over .env", async () => {
    const tmpdir = await setup("PRODUCT_LANDMARK_TOKEN=env-value\n");
    const config = await createProductConfig(
      "landmark",
      { token: undefined },
      {
        ...process,
        cwd: () => tmpdir,
        env: { PATH: process.env.PATH, PRODUCT_LANDMARK_TOKEN: "shell-jwt" },
      },
      mockStorageFn,
    );
    assert.equal(config.token, "shell-jwt");
    await rm(tmpdir, { recursive: true });
  });

  it("empty-string shell value falls through to .env", async () => {
    const tmpdir = await setup("PRODUCT_LANDMARK_TOKEN=env-value\n");
    const config = await createProductConfig(
      "landmark",
      { token: undefined },
      {
        ...process,
        cwd: () => tmpdir,
        env: { PATH: process.env.PATH, PRODUCT_LANDMARK_TOKEN: "" },
      },
      mockStorageFn,
    );
    // .env wins, not ""
    assert.equal(config.token, "env-value");
    await rm(tmpdir, { recursive: true });
  });
});
