import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  IdentityUnresolvedError,
  resolveIdentity,
} from "../../src/lib/identity.js";
import {
  writeCredentials,
  readCredentials,
} from "../../src/lib/credentials.js";
import { signTestToken } from "./sign-test-token.js";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

const runtime = createDefaultRuntime();
const SECRET = "test-secret-do-not-reuse";

function makeConfig({ url, anonKey, jwtSecret, token } = {}) {
  return {
    token,
    supabaseUrl: () => {
      if (!url) throw new Error("SUPABASE_URL not found in environment");
      return url;
    },
    supabaseAnonKey: () => {
      if (!anonKey)
        throw new Error("SUPABASE_ANON_KEY not found in environment");
      return anonKey;
    },
    supabaseJwtSecret: () => {
      if (!jwtSecret)
        throw new Error("SUPABASE_JWT_SECRET not found in environment");
      return jwtSecret;
    },
  };
}

describe("resolveIdentity — env-only path", () => {
  it("rejects when neither config.token nor a session is set", async () => {
    const env = { LANDMARK_CREDENTIALS_FILE: "/nonexistent/file" };
    await assert.rejects(
      () => resolveIdentity({ runtime, config: makeConfig(), env }),
      IdentityUnresolvedError,
    );
    await assert.rejects(
      () => resolveIdentity({ runtime, config: makeConfig(), env }),
      /run `fit-landmark login`/,
    );
  });

  it("throws on a non-JWT shape", async () => {
    await assert.rejects(
      () =>
        resolveIdentity({
          runtime,
          config: makeConfig({ token: "not.a.jwt.really" }),
        }),
      /not a JWT/,
    );
  });

  it("throws on a header that does not announce HS256 + JWT", async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        email: "alice@example.com",
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    ).toString("base64url");
    const sig = "a".repeat(43);
    const bad = `${header}.${payload}.${sig}`;
    await assert.rejects(
      () =>
        resolveIdentity({
          runtime,
          config: makeConfig({ token: bad }),
        }),
      /header rejected/,
    );
  });

  it("throws on malformed JSON payload", async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from("not-json").toString("base64url");
    const bad = `${header}.${payload}.aaaa`;
    await assert.rejects(
      () =>
        resolveIdentity({
          runtime,
          config: makeConfig({ token: bad }),
        }),
      /payload is not valid JSON/,
    );
  });

  it("throws when email claim is missing", async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        role: "authenticated",
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    ).toString("base64url");
    const sig = createHmac("sha256", SECRET)
      .update(`${header}.${payload}`)
      .digest("base64url");
    const noEmail = `${header}.${payload}.${sig}`;
    await assert.rejects(
      () =>
        resolveIdentity({
          runtime,
          config: makeConfig({ jwtSecret: SECRET, token: noEmail }),
        }),
      /missing string email claim/,
    );
  });

  it("throws when email claim is not a string", async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        email: 12345,
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    ).toString("base64url");
    const bad = `${header}.${payload}.aaaa`;
    await assert.rejects(
      () =>
        resolveIdentity({
          runtime,
          config: makeConfig({ token: bad }),
        }),
      /missing string email claim/,
    );
  });

  it("throws when exp claim is not a number", async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ email: "a@b", exp: "soon" }),
    ).toString("base64url");
    const bad = `${header}.${payload}.aaaa`;
    await assert.rejects(
      () =>
        resolveIdentity({
          runtime,
          config: makeConfig({ token: bad }),
        }),
      /expired/,
    );
  });

  it("throws on expired token", async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        email: "alice@example.com",
        exp: Math.floor(Date.now() / 1000) - 60,
      }),
    ).toString("base64url");
    const sig = createHmac("sha256", SECRET)
      .update(`${header}.${payload}`)
      .digest("base64url");
    const expired = `${header}.${payload}.${sig}`;
    await assert.rejects(
      () =>
        resolveIdentity({
          runtime,
          config: makeConfig({ jwtSecret: SECRET, token: expired }),
        }),
      /expired/,
    );
  });

  it("throws on a forged signature when the secret is present", async () => {
    const token = signTestToken({ email: "alice@example.com", secret: SECRET });
    const [h, p] = token.split(".");
    const bad = `${h}.${p}.${"a".repeat(43)}`;
    await assert.rejects(
      () =>
        resolveIdentity({
          runtime,
          config: makeConfig({ jwtSecret: SECRET, token: bad }),
        }),
      /signature does not verify/,
    );
  });

  it("returns { email, jwt } on a happy path with the secret present", async () => {
    const token = signTestToken({ email: "alice@example.com", secret: SECRET });
    const out = await resolveIdentity({
      runtime,
      config: makeConfig({ jwtSecret: SECRET, token }),
    });
    assert.equal(out.email, "alice@example.com");
    assert.equal(out.jwt, token);
  });

  it("trusts the JWT shape when the secret is absent (production path)", async () => {
    const token = signTestToken({ email: "bob@example.com", secret: SECRET });
    const out = await resolveIdentity({
      runtime,
      config: makeConfig({ token }),
    });
    assert.equal(out.email, "bob@example.com");
  });
});

describe("resolveIdentity — credentials-store fallback", () => {
  let tempDir;
  let credsFile;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "landmark-identity-"));
    credsFile = path.join(tempDir, "credentials.json");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("reads a valid (unexpired) session from the store", async () => {
    const env = { LANDMARK_CREDENTIALS_FILE: credsFile };
    await writeCredentials(
      runtime,
      {
        access_token: "access-from-store",
        refresh_token: "r",
        expires_at: Date.now() + 3600_000,
        email: "carol@example.com",
      },
      env,
    );
    const out = await resolveIdentity({ runtime, config: makeConfig(), env });
    assert.equal(out.email, "carol@example.com");
    assert.equal(out.jwt, "access-from-store");
  });

  it("config.token takes precedence over the store", async () => {
    const env = { LANDMARK_CREDENTIALS_FILE: credsFile };
    await writeCredentials(
      runtime,
      {
        access_token: "from-store",
        refresh_token: "r",
        expires_at: Date.now() + 3600_000,
        email: "carol@example.com",
      },
      env,
    );
    const token = signTestToken({ email: "dave@example.com", secret: SECRET });
    const out = await resolveIdentity({
      runtime,
      config: makeConfig({ jwtSecret: SECRET, token }),
      env,
    });
    assert.equal(out.email, "dave@example.com");
    assert.equal(out.jwt, token);
  });

  it("refreshes when expires_at is past and persists new tokens", async () => {
    const env = { LANDMARK_CREDENTIALS_FILE: credsFile };
    await writeCredentials(
      runtime,
      {
        access_token: "stale",
        refresh_token: "old-refresh",
        expires_at: Date.now() - 60_000,
        email: "eve@example.com",
      },
      env,
    );

    let refreshArgs;
    const createClient = (url, key) => {
      assert.equal(url, "http://supabase.local");
      assert.equal(key, "anon");
      return {
        auth: {
          async refreshSession({ refresh_token }) {
            refreshArgs = refresh_token;
            return {
              data: {
                session: {
                  access_token: "new-access",
                  refresh_token: "new-refresh",
                  expires_in: 3600,
                },
                user: { email: "eve@example.com" },
              },
              error: null,
            };
          },
        },
      };
    };

    const out = await resolveIdentity({
      runtime,
      config: makeConfig({ url: "http://supabase.local", anonKey: "anon" }),
      env,
      createClient,
    });
    assert.equal(refreshArgs, "old-refresh");
    assert.equal(out.email, "eve@example.com");
    assert.equal(out.jwt, "new-access");

    const persisted = await readCredentials(runtime, env);
    assert.equal(persisted.access_token, "new-access");
    assert.equal(persisted.refresh_token, "new-refresh");
    assert.ok(persisted.expires_at > Date.now());
  });

  it("clears the store and throws when refresh fails", async () => {
    const env = { LANDMARK_CREDENTIALS_FILE: credsFile };
    await writeCredentials(
      runtime,
      {
        access_token: "stale",
        refresh_token: "dead",
        expires_at: Date.now() - 60_000,
        email: "frank@example.com",
      },
      env,
    );

    const createClient = () => ({
      auth: {
        async refreshSession() {
          return { data: null, error: { message: "refresh failed" } };
        },
      },
    });

    await assert.rejects(
      () =>
        resolveIdentity({
          runtime,
          config: makeConfig({ url: "http://supabase.local", anonKey: "anon" }),
          env,
          createClient,
        }),
      /refresh failed.*run `fit-landmark login`/s,
    );
    assert.equal(await readCredentials(runtime, env), null);
  });

  it("rejects when refresh is needed but SUPABASE_URL is missing", async () => {
    const env = { LANDMARK_CREDENTIALS_FILE: credsFile };
    await writeCredentials(
      runtime,
      {
        access_token: "stale",
        refresh_token: "r",
        expires_at: Date.now() - 60_000,
        email: "x@y",
      },
      env,
    );
    await assert.rejects(
      () => resolveIdentity({ runtime, config: makeConfig(), env }),
      /SUPABASE_URL/,
    );
  });
});
