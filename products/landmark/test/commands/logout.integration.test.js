import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { runLogoutCommand } from "../../src/commands/logout.js";
import {
  writeCredentials,
  readCredentials,
} from "../../src/lib/credentials.js";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

const runtime = createDefaultRuntime();

function makeIo() {
  const chunks = [];
  return {
    io: {
      stdout: {
        write: (s) => {
          chunks.push(s);
          return true;
        },
      },
    },
    text: () => chunks.join(""),
  };
}

describe("runLogoutCommand", () => {
  let tempDir;
  let env;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "landmark-logout-"));
    env = { LANDMARK_CREDENTIALS_FILE: path.join(tempDir, "credentials.json") };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("no-op when no session present", async () => {
    const { io, text } = makeIo();
    const result = await runLogoutCommand({ runtime, io, env });
    assert.match(text(), /Already logged out/);
    assert.equal(result.summary.previousEmail, null);
  });

  test("deletes the credentials file and reports the previous email", async () => {
    await writeCredentials(
      runtime,
      {
        access_token: "a",
        refresh_token: "r",
        expires_at: Date.now() + 3600_000,
        email: "alice@example.com",
      },
      env,
    );
    const { io, text } = makeIo();
    const result = await runLogoutCommand({ runtime, io, env });
    assert.match(text(), /Logged out alice@example\.com/);
    assert.equal(result.summary.previousEmail, "alice@example.com");
    assert.equal(await readCredentials(runtime, env), null);
  });

  test("second logout is a no-op", async () => {
    await writeCredentials(
      runtime,
      {
        access_token: "a",
        refresh_token: "r",
        expires_at: 0,
        email: "x@y",
      },
      env,
    );
    await runLogoutCommand({ runtime, io: makeIo().io, env });
    const { io, text } = makeIo();
    await runLogoutCommand({ runtime, io, env });
    assert.match(text(), /Already logged out/);
  });
});
