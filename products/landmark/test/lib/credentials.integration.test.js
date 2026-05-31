import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createTestRuntime, createMockProcess } from "@forwardimpact/libmock";

import {
  credentialsPath,
  readCredentials,
  writeCredentials,
  clearCredentials,
} from "../../src/lib/credentials.js";

const runtime = createDefaultRuntime();

function makeEnv(file) {
  return { LANDMARK_CREDENTIALS_FILE: file };
}

describe("landmark credentials store", () => {
  let tempDir;
  let file;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "landmark-creds-"));
    file = path.join(tempDir, "credentials.json");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("credentialsPath honours LANDMARK_CREDENTIALS_FILE override", () => {
    assert.equal(credentialsPath(runtime, makeEnv(file)), file);
  });

  test("credentialsPath honours XDG_CONFIG_HOME", () => {
    const env = { XDG_CONFIG_HOME: "/tmp/xdg" };
    assert.equal(
      credentialsPath(runtime, env),
      path.join("/tmp/xdg", "landmark", "credentials.json"),
    );
  });

  // Drive the per-platform branches off an injected `proc.platform` rather
  // than the host's real platform, so each branch is exercised deterministically
  // on every CI runner (a host-gated test masks a `proc.platform === undefined`
  // regression — the darwin branch would silently never run on Linux CI).
  test("credentialsPath resolves the darwin-native location", () => {
    const darwin = createTestRuntime({
      proc: createMockProcess({ platform: "darwin" }),
    });
    assert.equal(
      credentialsPath(darwin, {}),
      path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "landmark",
        "credentials.json",
      ),
    );
  });

  test("credentialsPath resolves the win32 APPDATA location", () => {
    const win = createTestRuntime({
      proc: createMockProcess({ platform: "win32" }),
    });
    const appData = path.join("C:\\Users", "x", "AppData", "Roaming");
    assert.equal(
      credentialsPath(win, { APPDATA: appData }),
      path.join(appData, "landmark", "credentials.json"),
    );
  });

  test("credentialsPath falls back to the linux .config location", () => {
    const linux = createTestRuntime({
      proc: createMockProcess({ platform: "linux" }),
    });
    assert.equal(
      credentialsPath(linux, {}),
      path.join(os.homedir(), ".config", "landmark", "credentials.json"),
    );
  });

  test("read returns null when file missing", async () => {
    const result = await readCredentials(runtime, makeEnv(file));
    assert.equal(result, null);
  });

  test("write + read round-trips", async () => {
    const creds = {
      access_token: "a",
      refresh_token: "r",
      expires_at: 1_700_000_000_000,
      email: "alice@example.com",
    };
    await writeCredentials(runtime, creds, makeEnv(file));

    const read = await readCredentials(runtime, makeEnv(file));
    assert.deepEqual(read, creds);
  });

  test("write creates parent directories", async () => {
    const nested = path.join(tempDir, "a", "b", "credentials.json");
    await writeCredentials(
      runtime,
      {
        access_token: "a",
        refresh_token: "r",
        expires_at: 0,
        email: "x@y",
      },
      makeEnv(nested),
    );
    const stat = await fs.stat(nested);
    assert.ok(stat.isFile());
  });

  test("write enforces 0600 mode on POSIX", async () => {
    if (process.platform === "win32") return;
    await writeCredentials(
      runtime,
      {
        access_token: "a",
        refresh_token: "r",
        expires_at: 0,
        email: "x@y",
      },
      makeEnv(file),
    );
    const stat = await fs.stat(file);
    assert.equal(stat.mode & 0o777, 0o600);
  });

  test("write tightens permissions on update", async () => {
    if (process.platform === "win32") return;
    const creds = {
      access_token: "a",
      refresh_token: "r",
      expires_at: 0,
      email: "x@y",
    };
    await writeCredentials(runtime, creds, makeEnv(file));
    await fs.chmod(file, 0o644);
    await writeCredentials(runtime, creds, makeEnv(file));
    const stat = await fs.stat(file);
    assert.equal(stat.mode & 0o777, 0o600);
  });

  test("clear removes the file", async () => {
    await writeCredentials(
      runtime,
      {
        access_token: "a",
        refresh_token: "r",
        expires_at: 0,
        email: "x@y",
      },
      makeEnv(file),
    );
    await clearCredentials(runtime, makeEnv(file));
    assert.equal(await readCredentials(runtime, makeEnv(file)), null);
  });

  test("clear is a no-op when file missing", async () => {
    await assert.doesNotReject(() => clearCredentials(runtime, makeEnv(file)));
  });
});
