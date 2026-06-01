import { describe, test } from "node:test";
import assert from "node:assert";
import { createHmac } from "node:crypto";

import {
  createTestRuntime,
  createMockFs,
  createMockClock,
} from "@forwardimpact/libmock";

// Module under test
import {
  updateEnvFile,
  readEnvFile,
  getOrGenerateSecret,
  generateHash,
  generateUUID,
  generateSecret,
  generateBase64Secret,
  generateJWT,
  mintSupabaseJwt,
  mintSupabaseAnonKey,
  mintSupabaseServiceRoleKey,
  parseDuration,
} from "../src/index.js";

// Fixed test env path used across all mocked-fs tests.
const TEST_ENV_PATH = "/test/.env";

/**
 * Build a test runtime with an in-memory fs.
 * @param {Object<string,string>} [files]
 */
function makeRuntime(files = {}) {
  return createTestRuntime({ fs: createMockFs(files) });
}

describe("libsecret", () => {
  describe("generateHash", () => {
    test("generates deterministic hash from single value", () => {
      const hash1 = generateHash("test-value");
      const hash2 = generateHash("test-value");
      assert.strictEqual(hash1, hash2);
    });

    test("generates deterministic hash from multiple values", () => {
      const hash1 = generateHash("value1", "value2", "value3");
      const hash2 = generateHash("value1", "value2", "value3");
      assert.strictEqual(hash1, hash2);
    });

    test("generates different hashes for different inputs", () => {
      const hash1 = generateHash("value1");
      const hash2 = generateHash("value2");
      assert.notStrictEqual(hash1, hash2);
    });

    test("filters out falsy values", () => {
      const hash1 = generateHash("value1", null, "value2");
      const hash2 = generateHash("value1", "value2");
      assert.strictEqual(hash1, hash2);
    });

    test("returns 8-character hex string", () => {
      const hash = generateHash("test");
      assert.strictEqual(hash.length, 8);
      assert.match(hash, /^[0-9a-f]{8}$/);
    });
  });

  describe("generateUUID", () => {
    test("generates valid UUID format", () => {
      const uuid = generateUUID();
      assert.match(
        uuid,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    test("generates unique UUIDs", () => {
      const uuid1 = generateUUID();
      const uuid2 = generateUUID();
      assert.notStrictEqual(uuid1, uuid2);
    });
  });

  describe("generateSecret", () => {
    test("generates 64-character hex string by default (32 bytes)", () => {
      const secret = generateSecret();
      assert.strictEqual(secret.length, 64);
      assert.match(secret, /^[0-9a-f]{64}$/);
    });

    test("generates correct length for custom byte count", () => {
      const secret = generateSecret(16);
      assert.strictEqual(secret.length, 32); // 16 bytes = 32 hex chars
    });

    test("generates unique secrets", () => {
      const secret1 = generateSecret();
      const secret2 = generateSecret();
      assert.notStrictEqual(secret1, secret2);
    });
  });

  describe("generateBase64Secret", () => {
    test("generates base64url-encoded string by default", () => {
      const secret = generateBase64Secret();
      // Base64url uses only alphanumeric chars, -, and _
      assert.match(secret, /^[A-Za-z0-9_-]+$/);
    });

    test("generates correct length for custom byte count", () => {
      const secret = generateBase64Secret(16);
      // 16 bytes encoded in base64 = ceil(16 * 4 / 3) = ~22 chars
      assert.ok(secret.length >= 21 && secret.length <= 24);
    });

    test("generates unique secrets", () => {
      const secret1 = generateBase64Secret();
      const secret2 = generateBase64Secret();
      assert.notStrictEqual(secret1, secret2);
    });
  });

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

  describe("parseDuration", () => {
    test("parses hours", () => {
      assert.strictEqual(parseDuration("1h"), 3600);
      assert.strictEqual(parseDuration("24h"), 86400);
    });

    test("parses days", () => {
      assert.strictEqual(parseDuration("1d"), 86400);
      assert.strictEqual(parseDuration("365d"), 31536000);
    });

    test("parses years", () => {
      assert.strictEqual(parseDuration("1y"), 31536000);
      assert.strictEqual(parseDuration("2y"), 63072000);
    });

    test("rejects bare numbers", () => {
      assert.throws(() => parseDuration("60"), /invalid duration/);
    });

    test("rejects unknown suffix", () => {
      assert.throws(() => parseDuration("5m"), /invalid duration/);
    });

    test("rejects empty string", () => {
      assert.throws(() => parseDuration(""), /invalid duration/);
    });
  });

  describe("updateEnvFile", () => {
    test("creates new .env file when it does not exist", async () => {
      const runtime = makeRuntime();
      await updateEnvFile("TEST_KEY", "test-value", TEST_ENV_PATH, runtime);

      const content = await runtime.fs.readFile(TEST_ENV_PATH, "utf8");
      assert.ok(content.includes("TEST_KEY=test-value"));
    });

    test("adds new key to existing .env file", async () => {
      const runtime = makeRuntime({
        [TEST_ENV_PATH]: "EXISTING_KEY=existing-value\n",
      });
      await updateEnvFile("NEW_KEY", "new-value", TEST_ENV_PATH, runtime);

      const content = await runtime.fs.readFile(TEST_ENV_PATH, "utf8");
      assert.ok(content.includes("EXISTING_KEY=existing-value"));
      assert.ok(content.includes("NEW_KEY=new-value"));
    });

    test("updates existing key in .env file", async () => {
      const runtime = makeRuntime({ [TEST_ENV_PATH]: "MY_KEY=old-value\n" });
      await updateEnvFile("MY_KEY", "new-value", TEST_ENV_PATH, runtime);

      const content = await runtime.fs.readFile(TEST_ENV_PATH, "utf8");
      assert.ok(content.includes("MY_KEY=new-value"));
      assert.ok(!content.includes("old-value"));
    });

    test("uncomments and updates commented key", async () => {
      const runtime = makeRuntime({
        [TEST_ENV_PATH]: "# TEST_KEY=commented-value\n",
      });
      await updateEnvFile("TEST_KEY", "new-value", TEST_ENV_PATH, runtime);

      const content = await runtime.fs.readFile(TEST_ENV_PATH, "utf8");
      assert.strictEqual(content.trim(), "TEST_KEY=new-value");
    });

    test("handles file without trailing newline", async () => {
      const runtime = makeRuntime({ [TEST_ENV_PATH]: "FIRST_KEY=value" });
      await updateEnvFile("SECOND_KEY", "second-value", TEST_ENV_PATH, runtime);

      const content = await runtime.fs.readFile(TEST_ENV_PATH, "utf8");
      assert.ok(content.includes("FIRST_KEY=value"));
      assert.ok(content.includes("SECOND_KEY=second-value"));
    });

    test("output always ends with trailing newline", async () => {
      const runtime = makeRuntime();
      await updateEnvFile("KEY_A", "value-a", TEST_ENV_PATH, runtime);
      let content = await runtime.fs.readFile(TEST_ENV_PATH, "utf8");
      assert.ok(content.endsWith("\n"), "new file should end with newline");

      await updateEnvFile("KEY_B", "value-b", TEST_ENV_PATH, runtime);
      content = await runtime.fs.readFile(TEST_ENV_PATH, "utf8");
      assert.ok(
        content.endsWith("\n"),
        "file with appended key should end with newline",
      );

      await updateEnvFile("KEY_A", "updated", TEST_ENV_PATH, runtime);
      content = await runtime.fs.readFile(TEST_ENV_PATH, "utf8");
      assert.ok(
        content.endsWith("\n"),
        "file with updated key should end with newline",
      );
    });

    test("uses provided env path", async () => {
      const customPath = "/test/custom.env";
      const runtime = makeRuntime();
      await updateEnvFile("KEY", "value", customPath, runtime);

      const content = await runtime.fs.readFile(customPath, "utf8");
      assert.ok(content.includes("KEY=value"));
    });

    test("calls chmod(path, 0o600) on new file", async () => {
      const runtime = makeRuntime();
      await updateEnvFile("SECRET", "s3cret", TEST_ENV_PATH, runtime);

      assert.strictEqual(runtime.fs.chmod.mock.callCount(), 1);
      assert.strictEqual(
        runtime.fs.chmod.mock.calls[0].arguments[0],
        TEST_ENV_PATH,
      );
      assert.strictEqual(runtime.fs.chmod.mock.calls[0].arguments[1], 0o600);
    });

    test("calls chmod(path, 0o600) on update", async () => {
      const runtime = makeRuntime({ [TEST_ENV_PATH]: "PRIOR=value\n" });
      await updateEnvFile("PRIOR", "updated", TEST_ENV_PATH, runtime);

      assert.strictEqual(runtime.fs.chmod.mock.callCount(), 1);
      assert.strictEqual(runtime.fs.chmod.mock.calls[0].arguments[1], 0o600);
    });
  });

  describe("readEnvFile", () => {
    test("returns undefined when file does not exist", async () => {
      const runtime = makeRuntime();
      const value = await readEnvFile("MISSING_KEY", TEST_ENV_PATH, runtime);
      assert.strictEqual(value, undefined);
    });

    test("returns undefined when key does not exist", async () => {
      const runtime = makeRuntime({
        [TEST_ENV_PATH]: "OTHER_KEY=other-value\n",
      });
      const value = await readEnvFile("MISSING_KEY", TEST_ENV_PATH, runtime);
      assert.strictEqual(value, undefined);
    });

    test("returns value for existing key", async () => {
      const runtime = makeRuntime({ [TEST_ENV_PATH]: "MY_KEY=my-value\n" });
      const value = await readEnvFile("MY_KEY", TEST_ENV_PATH, runtime);
      assert.strictEqual(value, "my-value");
    });

    test("returns value with equals sign in it", async () => {
      const runtime = makeRuntime({ [TEST_ENV_PATH]: "JWT_TOKEN=abc=def==\n" });
      const value = await readEnvFile("JWT_TOKEN", TEST_ENV_PATH, runtime);
      assert.strictEqual(value, "abc=def==");
    });

    test("ignores commented keys", async () => {
      const runtime = makeRuntime({
        [TEST_ENV_PATH]: "# MY_KEY=commented-value\n",
      });
      const value = await readEnvFile("MY_KEY", TEST_ENV_PATH, runtime);
      assert.strictEqual(value, undefined);
    });

    test("returns first matching key when duplicates exist", async () => {
      const runtime = makeRuntime({
        [TEST_ENV_PATH]: "MY_KEY=first-value\nMY_KEY=second-value\n",
      });
      const value = await readEnvFile("MY_KEY", TEST_ENV_PATH, runtime);
      assert.strictEqual(value, "first-value");
    });

    test("handles empty value", async () => {
      const runtime = makeRuntime({ [TEST_ENV_PATH]: "EMPTY_KEY=\n" });
      const value = await readEnvFile("EMPTY_KEY", TEST_ENV_PATH, runtime);
      assert.strictEqual(value, "");
    });
  });

  describe("getOrGenerateSecret", () => {
    test("returns existing value when key exists", async () => {
      const runtime = makeRuntime({
        [TEST_ENV_PATH]: "MY_SECRET=existing-secret\n",
      });
      const generator = () => "new-secret";
      const value = await getOrGenerateSecret(
        "MY_SECRET",
        generator,
        TEST_ENV_PATH,
        runtime,
      );
      assert.strictEqual(value, "existing-secret");
    });

    test("calls generator when key does not exist", async () => {
      const runtime = makeRuntime();
      const generator = () => "generated-secret";
      const value = await getOrGenerateSecret(
        "MY_SECRET",
        generator,
        TEST_ENV_PATH,
        runtime,
      );
      assert.strictEqual(value, "generated-secret");
    });

    test("does not call generator when key exists", async () => {
      const runtime = makeRuntime({
        [TEST_ENV_PATH]: "MY_SECRET=existing-secret\n",
      });
      let generatorCalled = false;
      const generator = () => {
        generatorCalled = true;
        return "new-secret";
      };
      await getOrGenerateSecret("MY_SECRET", generator, TEST_ENV_PATH, runtime);
      assert.strictEqual(generatorCalled, false);
    });

    test("calls generator when file does not exist", async () => {
      const runtime = makeRuntime();
      const generator = () => "generated-secret";
      const value = await getOrGenerateSecret(
        "MY_SECRET",
        generator,
        TEST_ENV_PATH,
        runtime,
      );
      assert.strictEqual(value, "generated-secret");
    });

    test("throws when generator is not a function", async () => {
      const runtime = makeRuntime();
      await assert.rejects(
        async () =>
          getOrGenerateSecret(
            "MY_SECRET",
            "not-a-function",
            TEST_ENV_PATH,
            runtime,
          ),
        { message: "generator is required" },
      );
    });

    test("does not write to file (no side effects)", async () => {
      const runtime = makeRuntime();
      const generator = () => "generated-secret";
      await getOrGenerateSecret("MY_SECRET", generator, TEST_ENV_PATH, runtime);

      // writeFile should never have been called
      assert.strictEqual(runtime.fs.writeFile.mock.callCount(), 0);
    });
  });
});
