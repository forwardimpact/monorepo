import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert";

import {
  LocalStorage,
  S3Storage,
  SupabaseStorage,
  createStorage,
  fromJsonLines,
  fromJson,
  toJsonLines,
  toJson,
  isJsonLines,
  isJson,
} from "../index.js";

describe("storageFactory", () => {
  let mockProcess;

  beforeEach(() => {
    mockProcess = {
      env: {},
    };
  });

  test("creates LocalStorage for local type", () => {
    mockProcess.env.STORAGE_ROOT = "/tmp";

    const storage = createStorage("config", "local", mockProcess);

    assert(storage instanceof LocalStorage);
  });

  test("creates S3Storage for s3 type", () => {
    mockProcess.env = {
      STORAGE_TYPE: "s3",
      S3_REGION: "us-east-1",
      S3_ENDPOINT: "https://s3.amazonaws.com",
      AWS_ACCESS_KEY_ID: "test-key",
      AWS_SECRET_ACCESS_KEY: "test-secret",
      S3_DATA_BUCKET: "test-bucket",
    };

    const storage = createStorage("/test/path", "s3", mockProcess);

    assert(storage instanceof S3Storage);
  });

  test("throws error for unsupported storage type", () => {
    mockProcess.env.STORAGE_TYPE = "unsupported";

    assert.throws(
      () => createStorage("/test/path", "unsupported", mockProcess),
      {
        message: /Unsupported storage type: unsupported/,
      },
    );
  });
});

describe("SupabaseStorage", () => {
  let mockClient;
  let mockCommands;
  let supabaseStorage;

  beforeEach(() => {
    mockClient = { send: mock.fn(() => Promise.resolve()) };
    mockCommands = {
      PutObjectCommand: mock.fn((params) => ({ params })),
      GetObjectCommand: mock.fn((params) => ({ params })),
      DeleteObjectCommand: mock.fn((params) => ({ params })),
      HeadObjectCommand: mock.fn((params) => ({ params })),
      HeadBucketCommand: mock.fn((params) => ({ params })),
      ListObjectsV2Command: mock.fn((params) => ({ params })),
    };

    supabaseStorage = new SupabaseStorage(
      "test-prefix",
      "test-bucket",
      mockClient,
      "https://supabase.example.com/storage/v1",
      "service-role-key-123",
      mockCommands,
    );
  });

  test("constructor throws when serviceRoleKey is missing", () => {
    assert.throws(
      () =>
        new SupabaseStorage(
          "test-prefix",
          "test-bucket",
          mockClient,
          "https://supabase.example.com/storage/v1",
          null,
          mockCommands,
        ),
      {
        message: /SupabaseStorage requires serviceRoleKey/,
      },
    );
  });

  test("ensureBucket creates bucket via REST API when successful", async () => {
    global.fetch = mock.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(""),
      }),
    );

    const created = await supabaseStorage.ensureBucket();

    assert.strictEqual(created, true);
    assert.strictEqual(global.fetch.mock.callCount(), 1);
    const [url, options] = global.fetch.mock.calls[0].arguments;
    assert.strictEqual(url, "https://supabase.example.com/storage/v1/bucket");
    assert.strictEqual(options.method, "POST");
    assert.strictEqual(
      options.headers.Authorization,
      "Bearer service-role-key-123",
    );
  });

  test("ensureBucket returns false on 409 Conflict", async () => {
    global.fetch = mock.fn(() =>
      Promise.resolve({
        ok: false,
        status: 409,
        text: () => Promise.resolve(""),
      }),
    );

    const created = await supabaseStorage.ensureBucket();

    assert.strictEqual(created, false);
  });

  test("ensureBucket returns false on Duplicate error in body", async () => {
    global.fetch = mock.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        text: () => Promise.resolve(JSON.stringify({ statusCode: "409" })),
      }),
    );

    const created = await supabaseStorage.ensureBucket();

    assert.strictEqual(created, false);
  });

  test("ensureBucket throws on other errors", async () => {
    global.fetch = mock.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      }),
    );

    await assert.rejects(() => supabaseStorage.ensureBucket(), {
      message: /Failed to create Supabase bucket: 500/,
    });
  });
});

describe("JSON utilities", () => {
  describe("fromJsonLines", () => {
    test("parses valid JSON Lines content", () => {
      const content = '{"id":1}\n{"id":2}\n{"id":3}';
      const result = fromJsonLines(content);
      assert.deepStrictEqual(result, [{ id: 1 }, { id: 2 }, { id: 3 }]);
    });

    test("handles Buffer input", () => {
      const content = Buffer.from('{"name":"test"}\n{"name":"test2"}');
      const result = fromJsonLines(content);
      assert.deepStrictEqual(result, [{ name: "test" }, { name: "test2" }]);
    });

    test("returns empty array for empty content", () => {
      assert.deepStrictEqual(fromJsonLines(""), []);
      assert.deepStrictEqual(fromJsonLines("   "), []);
    });

    test("handles content with blank lines", () => {
      const content = '{"id":1}\n\n{"id":2}\n';
      const result = fromJsonLines(content);
      assert.deepStrictEqual(result, [{ id: 1 }, { id: 2 }]);
    });
  });

  describe("fromJson", () => {
    test("parses valid JSON content", () => {
      const content = '{"name":"test","value":42}';
      const result = fromJson(content);
      assert.deepStrictEqual(result, { name: "test", value: 42 });
    });

    test("handles Buffer input", () => {
      const content = Buffer.from('{"key":"value"}');
      const result = fromJson(content);
      assert.deepStrictEqual(result, { key: "value" });
    });

    test("returns empty object for empty content", () => {
      assert.deepStrictEqual(fromJson(""), {});
      assert.deepStrictEqual(fromJson("   "), {});
    });
  });

  describe("toJsonLines", () => {
    test("converts array to JSONL format", () => {
      const data = [{ id: 1 }, { id: 2 }];
      const result = toJsonLines(data);
      assert.strictEqual(result, '{"id":1}\n{"id":2}\n');
    });

    test("throws error for non-array input", () => {
      assert.throws(() => toJsonLines({ id: 1 }), {
        message: "Data must be an array for JSONL format",
      });
    });

    test("handles empty array", () => {
      const result = toJsonLines([]);
      assert.strictEqual(result, "\n");
    });
  });

  describe("toJson", () => {
    test("converts object to formatted JSON", () => {
      const data = { name: "test" };
      const result = toJson(data);
      assert.strictEqual(result, '{\n  "name": "test"\n}');
    });

    test("handles nested objects", () => {
      const data = { outer: { inner: "value" } };
      const result = toJson(data);
      assert.ok(result.includes('"outer"'));
      assert.ok(result.includes('"inner"'));
    });
  });

  describe("isJsonLines", () => {
    test("returns true for .jsonl files with array data", () => {
      assert.strictEqual(isJsonLines("data.jsonl", [{ id: 1 }]), true);
    });

    test("returns false for non-.jsonl files", () => {
      assert.strictEqual(isJsonLines("data.json", [{ id: 1 }]), false);
    });

    test("returns false for non-array data", () => {
      assert.strictEqual(isJsonLines("data.jsonl", { id: 1 }), false);
    });
  });

  describe("isJson", () => {
    test("returns true for .json files with object data", () => {
      assert.strictEqual(isJson("config.json", { key: "value" }), true);
    });

    test("returns false for non-.json files", () => {
      assert.strictEqual(isJson("config.txt", { key: "value" }), false);
    });

    test("returns false for null data", () => {
      assert.strictEqual(isJson("config.json", null), false);
    });

    test("returns false for Buffer data", () => {
      assert.strictEqual(isJson("config.json", Buffer.from("test")), false);
    });

    test("returns false for non-object data", () => {
      assert.strictEqual(isJson("config.json", "string"), false);
    });
  });
});
