import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  credentialsPath,
  readCredentials,
  writeCredentials,
  clearCredentials,
} from "../../src/lib/credentials.js";

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
    assert.equal(credentialsPath(makeEnv(file)), file);
  });

  test("credentialsPath honours XDG_CONFIG_HOME", () => {
    const env = { XDG_CONFIG_HOME: "/tmp/xdg" };
    assert.equal(
      credentialsPath(env),
      path.join("/tmp/xdg", "landmark", "credentials.json"),
    );
  });

  test("credentialsPath falls back to ~/.config/landmark/credentials.json", () => {
    const env = {};
    if (process.platform === "win32") return; // covered by APPDATA branch
    assert.equal(
      credentialsPath(env),
      path.join(os.homedir(), ".config", "landmark", "credentials.json"),
    );
  });

  test("read returns null when file missing", async () => {
    const result = await readCredentials(makeEnv(file));
    assert.equal(result, null);
  });

  test("write + read round-trips", async () => {
    const creds = {
      access_token: "a",
      refresh_token: "r",
      expires_at: 1_700_000_000_000,
      email: "alice@example.com",
    };
    await writeCredentials(creds, makeEnv(file));

    const read = await readCredentials(makeEnv(file));
    assert.deepEqual(read, creds);
  });

  test("write creates parent directories", async () => {
    const nested = path.join(tempDir, "a", "b", "credentials.json");
    await writeCredentials(
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
    await writeCredentials(creds, makeEnv(file));
    await fs.chmod(file, 0o644);
    await writeCredentials(creds, makeEnv(file));
    const stat = await fs.stat(file);
    assert.equal(stat.mode & 0o777, 0o600);
  });

  test("clear removes the file", async () => {
    await writeCredentials(
      {
        access_token: "a",
        refresh_token: "r",
        expires_at: 0,
        email: "x@y",
      },
      makeEnv(file),
    );
    await clearCredentials(makeEnv(file));
    assert.equal(await readCredentials(makeEnv(file)), null);
  });

  test("clear is a no-op when file missing", async () => {
    await assert.doesNotReject(() => clearCredentials(makeEnv(file)));
  });
});
