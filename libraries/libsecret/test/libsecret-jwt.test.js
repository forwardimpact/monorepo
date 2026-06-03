import { describe, test } from "node:test";
import assert from "node:assert";
import { createHmac } from "node:crypto";

import { createTestRuntime, createMockClock } from "@forwardimpact/libmock";

import {
  generateJWT,
  mintSupabaseJwt,
  mintSupabaseAnonKey,
  mintSupabaseServiceRoleKey,
} from "../src/index.js";
import { makeRuntime } from "./libsecret-helpers.js";

describe("libsecret — JWT and Supabase minting", () => {
  describe("generateJWT", () => {
    const testSecret = "test-secret-key-12345";

    test("generates valid JWT format", () => {
      const payload = {
        sub: "user-123",
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      const jwt = generateJWT(payload, testSecret);

      const parts = jwt.split(".");
      assert.strictEqual(parts.length, 3);
    });

    test("generates JWT with correct header", () => {
      const payload = { sub: "user-123" };
      const jwt = generateJWT(payload, testSecret);

      const [headerB64] = jwt.split(".");
      const header = JSON.parse(Buffer.from(headerB64, "base64url").toString());

      assert.deepStrictEqual(header, { alg: "HS256", typ: "JWT" });
    });

    test("generates JWT with correct payload", () => {
      const payload = { sub: "user-123", role: "admin" };
      const jwt = generateJWT(payload, testSecret);

      const [, payloadB64] = jwt.split(".");
      const decodedPayload = JSON.parse(
        Buffer.from(payloadB64, "base64url").toString(),
      );

      assert.deepStrictEqual(decodedPayload, payload);
    });

    test("generates JWT with valid signature", () => {
      const payload = { sub: "user-123" };
      const jwt = generateJWT(payload, testSecret);

      const [headerB64, payloadB64, signatureB64] = jwt.split(".");
      const expectedSignature = createHmac("sha256", testSecret)
        .update(`${headerB64}.${payloadB64}`)
        .digest("base64url");

      assert.strictEqual(signatureB64, expectedSignature);
    });

    test("generates different JWTs for different payloads", () => {
      const jwt1 = generateJWT({ sub: "user-1" }, testSecret);
      const jwt2 = generateJWT({ sub: "user-2" }, testSecret);
      assert.notStrictEqual(jwt1, jwt2);
    });

    test("generates different JWTs for different secrets", () => {
      const payload = { sub: "user-123" };
      const jwt1 = generateJWT(payload, "secret-1");
      const jwt2 = generateJWT(payload, "secret-2");
      assert.notStrictEqual(jwt1, jwt2);
    });
  });

  describe("mintSupabaseJwt", () => {
    const secret = "supabase-test-secret";

    test("mints a 3-part JWT with HS256 header and Supabase claims", () => {
      const jwt = mintSupabaseJwt(
        { email: "alice@example.com", secret },
        makeRuntime(),
      );
      const [headerB64, payloadB64, sig] = jwt.split(".");
      assert.ok(sig);

      const header = JSON.parse(Buffer.from(headerB64, "base64url").toString());
      assert.deepStrictEqual(header, { alg: "HS256", typ: "JWT" });

      const payload = JSON.parse(
        Buffer.from(payloadB64, "base64url").toString(),
      );
      assert.strictEqual(payload.email, "alice@example.com");
      assert.strictEqual(payload.role, "authenticated");
      assert.strictEqual(payload.aud, "authenticated");
      assert.strictEqual(payload.iss, "supabase");
      assert.strictEqual(typeof payload.sub, "string");
      assert.strictEqual(typeof payload.iat, "number");
      assert.strictEqual(payload.exp - payload.iat, 3600);
    });

    test("honours ttlSeconds", () => {
      const jwt = mintSupabaseJwt(
        {
          email: "alice@example.com",
          secret,
          ttlSeconds: 60,
        },
        makeRuntime(),
      );
      const payload = JSON.parse(
        Buffer.from(jwt.split(".")[1], "base64url").toString(),
      );
      assert.strictEqual(payload.exp - payload.iat, 60);
    });

    test("merges extra claims", () => {
      const jwt = mintSupabaseJwt(
        {
          email: "alice@example.com",
          secret,
          claims: { custom: "x" },
        },
        makeRuntime(),
      );
      const payload = JSON.parse(
        Buffer.from(jwt.split(".")[1], "base64url").toString(),
      );
      assert.strictEqual(payload.custom, "x");
    });

    test("signature verifies under the same secret", () => {
      const jwt = mintSupabaseJwt(
        { email: "alice@example.com", secret },
        makeRuntime(),
      );
      const [h, p, s] = jwt.split(".");
      const expected = createHmac("sha256", secret)
        .update(`${h}.${p}`)
        .digest("base64url");
      assert.strictEqual(s, expected);
    });

    test("throws when secret missing", () => {
      assert.throws(
        () => mintSupabaseJwt({ email: "x@y", secret: "" }, makeRuntime()),
        /secret required/,
      );
    });

    test("throws when email missing", () => {
      assert.throws(
        () => mintSupabaseJwt({ email: "", secret }, makeRuntime()),
        /email required/,
      );
    });

    test("uses injected clock.now() for iat/exp", () => {
      const fixedMs = 1_700_000_000_000;
      const runtime = createTestRuntime({
        clock: createMockClock({ start: fixedMs }),
      });
      const jwt = mintSupabaseJwt({ email: "a@b.com", secret }, runtime);
      const payload = JSON.parse(
        Buffer.from(jwt.split(".")[1], "base64url").toString(),
      );
      assert.strictEqual(payload.iat, Math.floor(fixedMs / 1000));
    });
  });

  describe("mintSupabaseAnonKey", () => {
    const secret = "supabase-test-secret";
    const TEN_YEARS_SECONDS = 10 * 365 * 24 * 60 * 60;

    test("returns a 3-segment HS256 JWT", () => {
      const jwt = mintSupabaseAnonKey({ secret }, makeRuntime());
      const parts = jwt.split(".");
      assert.strictEqual(parts.length, 3);
      const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
      assert.deepStrictEqual(header, { alg: "HS256", typ: "JWT" });
    });

    test("payload contains role: anon and iss: supabase", () => {
      const jwt = mintSupabaseAnonKey({ secret }, makeRuntime());
      const payload = JSON.parse(
        Buffer.from(jwt.split(".")[1], "base64url").toString(),
      );
      assert.strictEqual(payload.role, "anon");
      assert.strictEqual(payload.iss, "supabase");
      assert.strictEqual(typeof payload.iat, "number");
      assert.strictEqual(typeof payload.exp, "number");
    });

    test("exp - iat equals the 10-year constant", () => {
      const jwt = mintSupabaseAnonKey({ secret }, makeRuntime());
      const payload = JSON.parse(
        Buffer.from(jwt.split(".")[1], "base64url").toString(),
      );
      assert.strictEqual(payload.exp - payload.iat, TEN_YEARS_SECONDS);
    });

    test("signature verifies under the same secret", () => {
      const jwt = mintSupabaseAnonKey({ secret }, makeRuntime());
      const [h, p, s] = jwt.split(".");
      const expected = createHmac("sha256", secret)
        .update(`${h}.${p}`)
        .digest("base64url");
      assert.strictEqual(s, expected);
    });

    test("throws when secret missing", () => {
      assert.throws(
        () => mintSupabaseAnonKey({ secret: "" }, makeRuntime()),
        /mintSupabaseAnonKey: secret required/,
      );
    });
  });

  describe("mintSupabaseServiceRoleKey", () => {
    const secret = "supabase-test-secret";
    const TEN_YEARS_SECONDS = 10 * 365 * 24 * 60 * 60;

    test("returns a 3-segment HS256 JWT", () => {
      const jwt = mintSupabaseServiceRoleKey({ secret }, makeRuntime());
      const parts = jwt.split(".");
      assert.strictEqual(parts.length, 3);
      const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
      assert.deepStrictEqual(header, { alg: "HS256", typ: "JWT" });
    });

    test("payload contains role: service_role and iss: supabase", () => {
      const jwt = mintSupabaseServiceRoleKey({ secret }, makeRuntime());
      const payload = JSON.parse(
        Buffer.from(jwt.split(".")[1], "base64url").toString(),
      );
      assert.strictEqual(payload.role, "service_role");
      assert.strictEqual(payload.iss, "supabase");
    });

    test("exp - iat equals the 10-year constant", () => {
      const jwt = mintSupabaseServiceRoleKey({ secret }, makeRuntime());
      const payload = JSON.parse(
        Buffer.from(jwt.split(".")[1], "base64url").toString(),
      );
      assert.strictEqual(payload.exp - payload.iat, TEN_YEARS_SECONDS);
    });

    test("signature verifies under the same secret", () => {
      const jwt = mintSupabaseServiceRoleKey({ secret }, makeRuntime());
      const [h, p, s] = jwt.split(".");
      const expected = createHmac("sha256", secret)
        .update(`${h}.${p}`)
        .digest("base64url");
      assert.strictEqual(s, expected);
    });

    test("throws when secret missing", () => {
      assert.throws(
        () => mintSupabaseServiceRoleKey({ secret: "" }, makeRuntime()),
        /mintSupabaseServiceRoleKey: secret required/,
      );
    });
  });
});
