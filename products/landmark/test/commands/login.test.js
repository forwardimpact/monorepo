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

import { runLoginCommand } from "../../src/commands/login.js";
import { readCredentials } from "../../src/lib/credentials.js";

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
  const { Readable } = require("node:stream");
  const stream = Readable.from([`${line}\n`]);
  return stream;
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

describe("runLoginCommand — OTP flow", () => {
  let tempDir;
  let env;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "landmark-login-"));
    env = {
      LANDMARK_CREDENTIALS_FILE: path.join(tempDir, "credentials.json"),
      MAP_SUPABASE_URL: "http://supabase.local",
      MAP_SUPABASE_ANON_KEY: "anon",
    };
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
      options: { email: "alice@example.com", otp: true },
      io,
      env,
      createClient: () => stub,
    });
    assert.equal(otpArgs.email, "alice@example.com");
    assert.equal(verifyArgs.email, "alice@example.com");
    assert.equal(verifyArgs.token, "123456");
    assert.equal(verifyArgs.type, "email");

    const persisted = await readCredentials(env);
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
          options: { email: "alice@example.com", otp: true },
          io,
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

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "landmark-login-"));
    env = {
      LANDMARK_CREDENTIALS_FILE: path.join(tempDir, "credentials.json"),
      MAP_SUPABASE_URL: "http://supabase.local",
      MAP_SUPABASE_ANON_KEY: "anon",
    };
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
      options: { email: "alice@example.com" },
      io,
      env,
      createClient: () => stub,
      openListener: listener,
    });

    assert.equal(otpArgs.options.emailRedirectTo, "http://127.0.0.1:54321/cb");
    assert.equal(exchanged, "the-code");
    const persisted = await readCredentials(env);
    assert.equal(persisted.access_token, "ACCESS");
    assert.match(text(), /Logged in as alice@example\.com/);
    assert.equal(result.summary.email, "alice@example.com");
  });

  test("rejects when MAP_SUPABASE_URL is missing", async () => {
    await assert.rejects(
      () =>
        runLoginCommand({
          options: { email: "alice@example.com" },
          io: makeIo().io,
          env: { LANDMARK_CREDENTIALS_FILE: env.LANDMARK_CREDENTIALS_FILE },
          createClient: () => makeSupabaseStub({}),
        }),
      /MAP_SUPABASE_URL and MAP_SUPABASE_ANON_KEY/,
    );
  });
});
