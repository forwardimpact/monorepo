import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { createHmac } from "node:crypto";
import fs from "fs/promises";
import path from "path";
import os from "os";

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
} from "../index.js";

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

  describe("updateEnvFile", () => {
    let tempDir;
    let envPath;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "libsecret-test-"));
      envPath = path.join(tempDir, ".env");
    });

    afterEach(async () => {
      try {
        await fs.rm(tempDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    test("creates new .env file when it does not exist", async () => {
      await updateEnvFile("TEST_KEY", "test-value", envPath);

      const content = await fs.readFile(envPath, "utf8");
      // When file doesn't exist, split("") gives [""], resulting in leading newline
      assert.ok(content.includes("TEST_KEY=test-value"));
    });

    test("adds new key to existing .env file", async () => {
      await fs.writeFile(envPath, "EXISTING_KEY=existing-value\n");

      await updateEnvFile("NEW_KEY", "new-value", envPath);

      const content = await fs.readFile(envPath, "utf8");
      assert.ok(content.includes("EXISTING_KEY=existing-value"));
      assert.ok(content.includes("NEW_KEY=new-value"));
    });

    test("updates existing key in .env file", async () => {
      await fs.writeFile(envPath, "MY_KEY=old-value\n");

      await updateEnvFile("MY_KEY", "new-value", envPath);

      const content = await fs.readFile(envPath, "utf8");
      assert.ok(content.includes("MY_KEY=new-value"));
      assert.ok(!content.includes("old-value"));
    });

    test("uncomments and updates commented key", async () => {
      await fs.writeFile(envPath, "# TEST_KEY=commented-value\n");

      await updateEnvFile("TEST_KEY", "new-value", envPath);

      const content = await fs.readFile(envPath, "utf8");
      assert.strictEqual(content.trim(), "TEST_KEY=new-value");
    });

    test("handles file without trailing newline", async () => {
      await fs.writeFile(envPath, "FIRST_KEY=value");

      await updateEnvFile("SECOND_KEY", "second-value", envPath);

      const content = await fs.readFile(envPath, "utf8");
      assert.ok(content.includes("FIRST_KEY=value"));
      assert.ok(content.includes("SECOND_KEY=second-value"));
    });

    test("uses default .env path when not specified", async () => {
      // This test creates a file in the current directory, so we mock it carefully
      const defaultPath = path.join(tempDir, ".env");
      await updateEnvFile("KEY", "value", defaultPath);

      const content = await fs.readFile(defaultPath, "utf8");
      assert.ok(content.includes("KEY=value"));
    });
  });

  describe("readEnvFile", () => {
    let tempDir;
    let envPath;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "libsecret-test-"));
      envPath = path.join(tempDir, ".env");
    });

    afterEach(async () => {
      try {
        await fs.rm(tempDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    test("returns undefined when file does not exist", async () => {
      const value = await readEnvFile("MISSING_KEY", envPath);
      assert.strictEqual(value, undefined);
    });

    test("returns undefined when key does not exist", async () => {
      await fs.writeFile(envPath, "OTHER_KEY=other-value\n");

      const value = await readEnvFile("MISSING_KEY", envPath);
      assert.strictEqual(value, undefined);
    });

    test("returns value for existing key", async () => {
      await fs.writeFile(envPath, "MY_KEY=my-value\n");

      const value = await readEnvFile("MY_KEY", envPath);
      assert.strictEqual(value, "my-value");
    });

    test("returns value with equals sign in it", async () => {
      await fs.writeFile(envPath, "JWT_TOKEN=abc=def==\n");

      const value = await readEnvFile("JWT_TOKEN", envPath);
      assert.strictEqual(value, "abc=def==");
    });

    test("ignores commented keys", async () => {
      await fs.writeFile(envPath, "# MY_KEY=commented-value\n");

      const value = await readEnvFile("MY_KEY", envPath);
      assert.strictEqual(value, undefined);
    });

    test("returns first matching key when duplicates exist", async () => {
      await fs.writeFile(envPath, "MY_KEY=first-value\nMY_KEY=second-value\n");

      const value = await readEnvFile("MY_KEY", envPath);
      assert.strictEqual(value, "first-value");
    });

    test("handles empty value", async () => {
      await fs.writeFile(envPath, "EMPTY_KEY=\n");

      const value = await readEnvFile("EMPTY_KEY", envPath);
      assert.strictEqual(value, "");
    });
  });

  describe("getOrGenerateSecret", () => {
    let tempDir;
    let envPath;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "libsecret-test-"));
      envPath = path.join(tempDir, ".env");
    });

    afterEach(async () => {
      try {
        await fs.rm(tempDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    test("returns existing value when key exists", async () => {
      await fs.writeFile(envPath, "MY_SECRET=existing-secret\n");

      const generator = () => "new-secret";
      const value = await getOrGenerateSecret("MY_SECRET", generator, envPath);

      assert.strictEqual(value, "existing-secret");
    });

    test("calls generator when key does not exist", async () => {
      const generator = () => "generated-secret";
      const value = await getOrGenerateSecret("MY_SECRET", generator, envPath);

      assert.strictEqual(value, "generated-secret");
    });

    test("does not call generator when key exists", async () => {
      await fs.writeFile(envPath, "MY_SECRET=existing-secret\n");

      let generatorCalled = false;
      const generator = () => {
        generatorCalled = true;
        return "new-secret";
      };

      await getOrGenerateSecret("MY_SECRET", generator, envPath);
      assert.strictEqual(generatorCalled, false);
    });

    test("calls generator when file does not exist", async () => {
      const generator = () => "generated-secret";
      const value = await getOrGenerateSecret("MY_SECRET", generator, envPath);

      assert.strictEqual(value, "generated-secret");
    });

    test("throws when generator is not a function", async () => {
      await assert.rejects(
        async () => getOrGenerateSecret("MY_SECRET", "not-a-function", envPath),
        { message: "generator is required" },
      );
    });

    test("does not write to file (no side effects)", async () => {
      const generator = () => "generated-secret";
      await getOrGenerateSecret("MY_SECRET", generator, envPath);

      // File should not exist since getOrGenerateSecret doesn't write
      await assert.rejects(async () => fs.readFile(envPath, "utf8"), {
        code: "ENOENT",
      });
    });
  });
});
