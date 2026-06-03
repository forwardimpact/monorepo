import { test, describe } from "node:test";
import assert from "node:assert";

import { createConfig } from "../src/index.js";
import { createMockStorage, spy } from "@forwardimpact/libmock";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

// Wrap a test proc as a runtime bag (real fs + test-controlled proc).
const rt = (proc) => ({ ...createDefaultRuntime(), proc });

describe("libconfig - Config getters (supabase + microsoft secrets)", () => {
  const mockStorageFn = () =>
    createMockStorage({
      get: spy(() => Promise.resolve("")),
    });

  test("supabaseUrl() returns env value with trailing slashes stripped", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: { SUPABASE_URL: "http://127.0.0.1:54321/" },
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      rt(mockProcess),
      mockStorageFn,
    );
    assert.strictEqual(config.supabaseUrl(), "http://127.0.0.1:54321");
  });

  test("supabaseUrl() throws when unset", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: {},
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      rt(mockProcess),
      mockStorageFn,
    );
    assert.throws(() => config.supabaseUrl(), {
      message: "SUPABASE_URL not found in environment",
    });
  });

  test("supabaseAnonKey() returns env value", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: { SUPABASE_ANON_KEY: "anon-key-value" },
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      rt(mockProcess),
      mockStorageFn,
    );
    assert.strictEqual(config.supabaseAnonKey(), "anon-key-value");
  });

  test("supabaseAnonKey() throws when unset", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: {},
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      rt(mockProcess),
      mockStorageFn,
    );
    assert.throws(() => config.supabaseAnonKey(), {
      message: "SUPABASE_ANON_KEY not found in environment",
    });
  });

  test("supabaseServiceRoleKey() returns env value", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: { SUPABASE_SERVICE_ROLE_KEY: "service-role-key-value" },
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      rt(mockProcess),
      mockStorageFn,
    );
    assert.strictEqual(
      config.supabaseServiceRoleKey(),
      "service-role-key-value",
    );
  });

  test("supabaseServiceRoleKey() throws when unset", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: {},
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      rt(mockProcess),
      mockStorageFn,
    );
    assert.throws(() => config.supabaseServiceRoleKey(), {
      message: "SUPABASE_SERVICE_ROLE_KEY not found in environment",
    });
  });

  test("supabaseJwtSecret() returns env value", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: { JWT_SECRET: "jwt-secret-value" },
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      rt(mockProcess),
      mockStorageFn,
    );
    assert.strictEqual(config.supabaseJwtSecret(), "jwt-secret-value");
  });

  test("supabaseJwtSecret() throws when unset", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: {},
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      rt(mockProcess),
      mockStorageFn,
    );
    assert.throws(() => config.supabaseJwtSecret(), {
      message: "JWT_SECRET not found in environment",
    });
  });

  test("msAppPassword() returns env value", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: { MICROSOFT_APP_PASSWORD: "test-client-secret" },
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      rt(mockProcess),
      mockStorageFn,
    );
    assert.strictEqual(config.msAppPassword(), "test-client-secret");
  });

  test("msAppPassword() throws when unset", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: {},
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      rt(mockProcess),
      mockStorageFn,
    );
    assert.throws(() => config.msAppPassword(), {
      message: "MICROSOFT_APP_PASSWORD not found in environment",
    });
  });

  test("msAppId() returns env value", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: { MICROSOFT_APP_ID: "test-app-id" },
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      rt(mockProcess),
      mockStorageFn,
    );
    assert.strictEqual(config.msAppId(), "test-app-id");
  });

  test("msAppId() throws when unset", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: {},
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      rt(mockProcess),
      mockStorageFn,
    );
    assert.throws(() => config.msAppId(), {
      message: "MICROSOFT_APP_ID not found in environment",
    });
  });

  test("msAppTenantId() returns env value", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: { MICROSOFT_APP_TENANT_ID: "test-tenant-id" },
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      rt(mockProcess),
      mockStorageFn,
    );
    assert.strictEqual(config.msAppTenantId(), "test-tenant-id");
  });

  test("msAppTenantId() throws when unset", async () => {
    const mockProcess = {
      cwd: spy(() => "/test/dir"),
      env: {},
    };

    const config = await createConfig(
      "test",
      "myservice",
      {},
      rt(mockProcess),
      mockStorageFn,
    );
    assert.throws(() => config.msAppTenantId(), {
      message: "MICROSOFT_APP_TENANT_ID not found in environment",
    });
  });
});
