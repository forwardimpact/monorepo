import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert";

import { S3Storage } from "../index.js";

describe("S3Storage", () => {
  let s3Storage;
  let mockClient;
  let mockCommands;

  beforeEach(() => {
    mockClient = {
      send: mock.fn(() =>
        Promise.resolve({ Body: [Buffer.from("test data")] }),
      ),
    };

    // Mock commands as constructor functions
    mockCommands = {
      PutObjectCommand: mock.fn(function (params) {
        this.params = params;
        return this;
      }),
      GetObjectCommand: mock.fn(function (params) {
        this.params = params;
        return this;
      }),
      DeleteObjectCommand: mock.fn(function (params) {
        this.params = params;
        return this;
      }),
      HeadObjectCommand: mock.fn(function (params) {
        this.params = params;
        return this;
      }),
      ListObjectsV2Command: mock.fn(function (params) {
        this.params = params;
        return this;
      }),
      CreateBucketCommand: mock.fn(function (params) {
        this.params = params;
        return this;
      }),
      HeadBucketCommand: mock.fn(function (params) {
        this.params = params;
        return this;
      }),
    };

    s3Storage = new S3Storage("test-prefix", "guide", mockClient, mockCommands);
  });

  test("put sends PutObjectCommand", async () => {
    await s3Storage.put("file.txt", "content");

    assert.strictEqual(mockClient.send.mock.callCount(), 1);
    assert.strictEqual(mockCommands.PutObjectCommand.mock.callCount(), 1);
    assert.deepStrictEqual(
      mockCommands.PutObjectCommand.mock.calls[0].arguments[0],
      {
        Bucket: "guide",
        Key: "test-prefix/file.txt",
        Body: "content",
      },
    );
  });

  test("get sends GetObjectCommand and concatenates chunks", async () => {
    mockClient.send = mock.fn(() =>
      Promise.resolve({
        Body: [Buffer.from("chunk1"), Buffer.from("chunk2")],
      }),
    );

    const result = await s3Storage.get("file.txt");

    assert.strictEqual(mockClient.send.mock.callCount(), 1);
    assert.strictEqual(mockCommands.GetObjectCommand.mock.callCount(), 1);
    assert(Buffer.isBuffer(result));
    assert.strictEqual(result.toString(), "chunk1chunk2");
  });

  test("get parses JSON files automatically", async () => {
    const jsonData = { name: "test", value: 42 };
    mockClient.send = mock.fn(() =>
      Promise.resolve({
        Body: [Buffer.from(JSON.stringify(jsonData))],
      }),
    );

    const result = await s3Storage.get("config.json");

    assert.strictEqual(mockClient.send.mock.callCount(), 1);
    assert.deepStrictEqual(result, jsonData);
  });

  test("get parses JSON Lines files automatically", async () => {
    const jsonlData = [
      { id: 1, name: "first" },
      { id: 2, name: "second" },
    ];
    const jsonlContent = jsonlData.map((obj) => JSON.stringify(obj)).join("\n");
    mockClient.send = mock.fn(() =>
      Promise.resolve({
        Body: [Buffer.from(jsonlContent)],
      }),
    );

    const result = await s3Storage.get("data.jsonl");

    assert.strictEqual(mockClient.send.mock.callCount(), 1);
    assert.deepStrictEqual(result, jsonlData);
  });

  test("get returns empty object for empty JSON files", async () => {
    mockClient.send = mock.fn(() =>
      Promise.resolve({
        Body: [Buffer.from("")],
      }),
    );

    const result = await s3Storage.get("empty.json");

    assert.deepStrictEqual(result, {});
  });

  test("get returns empty array for empty JSON Lines files", async () => {
    mockClient.send = mock.fn(() =>
      Promise.resolve({
        Body: [Buffer.from("")],
      }),
    );

    const result = await s3Storage.get("empty.jsonl");

    assert.deepStrictEqual(result, []);
  });

  test("append reads existing data and puts combined data", async () => {
    // Mock first call to get existing data, second call for put
    let callCount = 0;
    mockClient.send = mock.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          Body: [Buffer.from("existing ")],
        });
      } else {
        return Promise.resolve();
      }
    });

    await s3Storage.append("file.txt", "new content");

    assert.strictEqual(mockClient.send.mock.callCount(), 2);
    assert.strictEqual(mockCommands.GetObjectCommand.mock.callCount(), 1);
    assert.strictEqual(mockCommands.PutObjectCommand.mock.callCount(), 1);
  });

  test("append handles non-existent file", async () => {
    // Mock get to fail with 404, then succeed for put
    let callCount = 0;
    mockClient.send = mock.fn(() => {
      callCount++;
      if (callCount === 1) {
        const error = new Error("Not found");
        error.name = "NoSuchKey";
        throw error;
      } else {
        return Promise.resolve();
      }
    });

    await s3Storage.append("file.txt", "new content");

    assert.strictEqual(mockClient.send.mock.callCount(), 2);
    assert.strictEqual(mockCommands.GetObjectCommand.mock.callCount(), 1);
    assert.strictEqual(mockCommands.PutObjectCommand.mock.callCount(), 1);
  });

  test("append automatically adds newline characters", async () => {
    // Mock get to return existing data, then put for append
    let callCount = 0;
    mockClient.send = mock.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          Body: [Buffer.from("existing data")],
        });
      } else {
        return Promise.resolve();
      }
    });

    await s3Storage.append("file.txt", "appended data");

    // Verify the put command received exactly what we expect with automatic newlines
    assert.strictEqual(mockCommands.PutObjectCommand.mock.callCount(), 1);
    const putCall = mockCommands.PutObjectCommand.mock.calls[0].arguments[0];
    assert.strictEqual(putCall.Key, "test-prefix/file.txt");
    // The body should be the concatenation of existing + new data with added newline
    assert.strictEqual(putCall.Body.toString(), "existing dataappended data\n");
  });

  test("delete sends DeleteObjectCommand", async () => {
    await s3Storage.delete("file.txt");

    assert.strictEqual(mockClient.send.mock.callCount(), 1);
    assert.strictEqual(mockCommands.DeleteObjectCommand.mock.callCount(), 1);
    assert.deepStrictEqual(
      mockCommands.DeleteObjectCommand.mock.calls[0].arguments[0],
      {
        Bucket: "guide",
        Key: "test-prefix/file.txt",
      },
    );
  });

  test("exists returns true when object exists", async () => {
    const exists = await s3Storage.exists("file.txt");

    assert.strictEqual(exists, true);
    assert.strictEqual(mockCommands.HeadObjectCommand.mock.callCount(), 1);
  });

  test("exists returns false when NotFound error", async () => {
    const error = new Error("Not found");
    error.name = "NotFound";
    mockClient.send = mock.fn(() => Promise.reject(error));

    const exists = await s3Storage.exists("file.txt");

    assert.strictEqual(exists, false);
  });

  test("exists returns false when 404 status", async () => {
    const error = new Error("Not found");
    error.$metadata = { httpStatusCode: 404 };
    mockClient.send = mock.fn(() => Promise.reject(error));

    const exists = await s3Storage.exists("file.txt");

    assert.strictEqual(exists, false);
  });
});
