/**
 * Unit tests for `fit-landmark login` — covers both flows by injecting
 * a fake Supabase client and (for the browser flow) a fake localhost
 * listener so the test never touches a real network.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { Readable } from "node:stream";

import { runLoginCommand } from "../../src/commands/login.js";
import { readCredentials } from "../../src/lib/credentials.js";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

const runtime = createDefaultRuntime();

function makeIo({ otp } = {}) {
  const chunks = [];
  return {
    io: {
      stdin: otp ? makeStdinFor(otp) : null,
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

function makeStdinFor(line) {
  // node:readline/promises reads until EOL. A Readable that emits the line
  // and then closes is enough — readline's question() resolves on first
  // line break or end-of-stream.
  return Readable.from([`${line}\n`]);
}

function makeSupabaseStub({ session, onOtp, onVerify, onExchange } = {}) {
  return {
    auth: {
      async signInWithOtp(opts) {
        if (onOtp) onOtp(opts);
        return { data: {}, error: null };
      },
      async verifyOtp(opts) {
        if (onVerify) onVerify(opts);
        return {
          data: { session, user: { email: opts.email } },
          error: null,
        };
      },
      async exchangeCodeForSession(code) {
        if (onExchange) onExchange(code);
        return {
          data: {
            session,
            user: { email: session?.email ?? "captured@example.com" },
          },
          error: null,
        };
      },
    },
  };
}

const okSession = {
  access_token: "ACCESS",
  refresh_token: "REFRESH",
  expires_in: 3600,
  email: "alice@example.com",
};

function makeConfig({ url = "http://supabase.local", anonKey = "anon" } = {}) {
  return {
    supabaseUrl: () => {
      if (!url) throw new Error("SUPABASE_URL not found in environment");
      return url;
    },
    supabaseAnonKey: () => {
      if (!anonKey)
        throw new Error("SUPABASE_ANON_KEY not found in environment");
      return anonKey;
    },
  };
}

describe("runLoginCommand — OTP flow", () => {
  let tempDir;
  let env;
  let config;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "landmark-login-"));
    env = {
      LANDMARK_CREDENTIALS_FILE: path.join(tempDir, "credentials.json"),
    };
    config = makeConfig();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("verifies the OTP, persists the session, and prints the email", async () => {
    let otpArgs, verifyArgs;
    const stub = makeSupabaseStub({
      session: okSession,
      onOtp: (a) => (otpArgs = a),
      onVerify: (a) => (verifyArgs = a),
    });
    const { io, text } = makeIo({ otp: "123456" });
    const result = await runLoginCommand({
      runtime,
      options: { email: "alice@example.com", otp: true },
      io,
      config,
      env,
      createClient: () => stub,
    });
    assert.equal(otpArgs.email, "alice@example.com");
    assert.equal(verifyArgs.email, "alice@example.com");
    assert.equal(verifyArgs.token, "123456");
    assert.equal(verifyArgs.type, "email");

    const persisted = await readCredentials(runtime, env);
    assert.equal(persisted.access_token, "ACCESS");
    assert.equal(persisted.refresh_token, "REFRESH");
    assert.equal(persisted.email, "alice@example.com");
    assert.ok(persisted.expires_at > Date.now());
    assert.match(text(), /Logged in as alice@example\.com/);
    assert.equal(result.meta.ok, true);
  });

  test("rejects a non-6-digit code", async () => {
    const stub = makeSupabaseStub({ session: okSession });
    const { io } = makeIo({ otp: "abc" });
    await assert.rejects(
      () =>
        runLoginCommand({
          runtime,
          options: { email: "alice@example.com", otp: true },
          io,
          config,
          env,
          createClient: () => stub,
        }),
      /code must be 6 digits/,
    );
  });
});

describe("runLoginCommand — browser flow", () => {
  let tempDir;
  let env;
  let config;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "landmark-login-"));
    env = {
      LANDMARK_CREDENTIALS_FILE: path.join(tempDir, "credentials.json"),
    };
    config = makeConfig();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("captures ?code at the listener and exchanges it for a session", async () => {
    let otpArgs, exchanged;
    const stub = makeSupabaseStub({
      session: okSession,
      onOtp: (a) => (otpArgs = a),
      onExchange: (c) => (exchanged = c),
    });

    const listener = () =>
      Promise.resolve({
        port: 54321,
        codePromise: Promise.resolve("the-code"),
        close: () => {},
      });

    const { io, text } = makeIo();
    const result = await runLoginCommand({
      runtime,
      options: { email: "alice@example.com" },
      io,
      config,
      env,
      createClient: () => stub,
      openListener: listener,
    });

    assert.equal(otpArgs.options.emailRedirectTo, "http://127.0.0.1:54321/cb");
    assert.equal(exchanged, "the-code");
    const persisted = await readCredentials(runtime, env);
    assert.equal(persisted.access_token, "ACCESS");
    assert.match(text(), /Logged in as alice@example\.com/);
    assert.equal(result.summary.email, "alice@example.com");
  });

  test("rejects when SUPABASE_URL is missing", async () => {
    await assert.rejects(
      () =>
        runLoginCommand({
          runtime,
          options: { email: "alice@example.com" },
          io: makeIo().io,
          config: makeConfig({ url: null }),
          env: { LANDMARK_CREDENTIALS_FILE: env.LANDMARK_CREDENTIALS_FILE },
          createClient: () => makeSupabaseStub({}),
        }),
      /SUPABASE_URL and SUPABASE_ANON_KEY/,
    );
  });
});
