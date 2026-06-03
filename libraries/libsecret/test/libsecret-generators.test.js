import { describe, test } from "node:test";
import assert from "node:assert";

import {
  generateHash,
  generateUUID,
  generateSecret,
  generateBase64Secret,
} from "../src/index.js";

describe("libsecret — generators", () => {
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
});
