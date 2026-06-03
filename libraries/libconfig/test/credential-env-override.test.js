import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createProductConfig } from "../src/index.js";
import { createMockFs, createTestRuntime } from "@forwardimpact/libmock";

const CWD = "/project";

// In-memory fs (holding the .env the config loader reads) with a
// test-controlled proc.
const runtimeWith = (proc, files) =>
  createTestRuntime({ fs: createMockFs(files), proc });

// Mocked storage that always returns no config file (no findUpward walk).
function mockStorageFn() {
  return {
    get: async () => null,
    put: async () => {},
    delete: async () => {},
    path: () => "/dev/null/config",
  };
}

function envFiles(envContent) {
  return envContent === null ? {} : { [`${CWD}/.env`]: envContent };
}

function proc(env) {
  return { ...process, cwd: () => CWD, env };
}

describe("PRODUCT_LANDMARK_TOKEN credential override", () => {
  it("loads token from .env when no shell value is set", async () => {
    const config = await createProductConfig(
      "landmark",
      { token: undefined },
      runtimeWith(
        proc({ PATH: process.env.PATH }),
        envFiles("PRODUCT_LANDMARK_TOKEN=test-jwt-value\n"),
      ),
      mockStorageFn,
    );
    assert.equal(config.token, "test-jwt-value");
  });

  it("shell env wins over .env", async () => {
    const config = await createProductConfig(
      "landmark",
      { token: undefined },
      runtimeWith(
        proc({ PATH: process.env.PATH, PRODUCT_LANDMARK_TOKEN: "shell-jwt" }),
        envFiles("PRODUCT_LANDMARK_TOKEN=env-value\n"),
      ),
      mockStorageFn,
    );
    assert.equal(config.token, "shell-jwt");
  });

  it("empty-string shell value falls through to .env", async () => {
    const config = await createProductConfig(
      "landmark",
      { token: undefined },
      runtimeWith(
        proc({ PATH: process.env.PATH, PRODUCT_LANDMARK_TOKEN: "" }),
        envFiles("PRODUCT_LANDMARK_TOKEN=env-value\n"),
      ),
      mockStorageFn,
    );
    // .env wins, not ""
    assert.equal(config.token, "env-value");
  });
});
