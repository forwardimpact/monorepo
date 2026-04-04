import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert";

import { S3Storage } from "../index.js";

describe("S3Storage - operations", () => {
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

  test("find lists objects with extension", async () => {
    mockClient.send = mock.fn(() =>
      Promise.resolve({
        Contents: [
          { Key: "test-prefix/file1.txt" },
          { Key: "test-prefix/file2.txt" },
          { Key: "test-prefix/other.json" },
        ],
      }),
    );

    const keys = await s3Storage.findByExtension(".txt");

    assert.deepStrictEqual(keys, ["file1.txt", "file2.txt"]);
  });

  test("handles absolute paths by removing leading slash", async () => {
    await s3Storage.put("/absolute/file.txt", "content");

    assert.deepStrictEqual(
      mockCommands.PutObjectCommand.mock.calls[0].arguments[0].Key,
      "test-prefix/absolute/file.txt",
    );
  });

  test("ensureBucket returns false when bucket exists", async () => {
    const created = await s3Storage.ensureBucket();

    assert.strictEqual(created, false);
    assert.strictEqual(mockCommands.HeadBucketCommand.mock.callCount(), 1);
    assert.strictEqual(mockCommands.CreateBucketCommand.mock.callCount(), 0);
  });

  test("ensureBucket returns true when bucket is created", async () => {
    const error = new Error("Not found");
    error.name = "NotFound";

    // Mock HeadBucketCommand to fail (bucket doesn't exist)
    // Mock CreateBucketCommand to succeed (bucket created)
    let callCount = 0;
    mockClient.send = mock.fn(() => {
      callCount++;
      if (callCount === 1) {
        // First call is HeadBucketCommand - bucket doesn't exist
        return Promise.reject(error);
      } else {
        // Second call is CreateBucketCommand - create bucket
        return Promise.resolve();
      }
    });

    const created = await s3Storage.ensureBucket();

    assert.strictEqual(created, true);
    assert.strictEqual(mockClient.send.mock.callCount(), 2);
  });

  test("ensureBucket handles NoSuchBucket error", async () => {
    const error = new Error("No such bucket");
    error.Code = "NoSuchBucket";

    let callCount = 0;
    mockClient.send = mock.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(error);
      }
      return Promise.resolve();
    });

    const created = await s3Storage.ensureBucket();

    assert.strictEqual(created, true);
  });

  test("ensureBucket handles 404 status code", async () => {
    const error = new Error("Not found");
    error.$metadata = { httpStatusCode: 404 };

    let callCount = 0;
    mockClient.send = mock.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(error);
      }
      return Promise.resolve();
    });

    const created = await s3Storage.ensureBucket();

    assert.strictEqual(created, true);
  });

  test("bucketExists returns true when bucket exists", async () => {
    const exists = await s3Storage.bucketExists();

    assert.strictEqual(exists, true);
    assert.strictEqual(mockCommands.HeadBucketCommand.mock.callCount(), 1);
  });

  test("bucketExists returns false when bucket not found", async () => {
    const error = new Error("Not found");
    error.name = "NotFound";
    mockClient.send = mock.fn(() => Promise.reject(error));

    const exists = await s3Storage.bucketExists();

    assert.strictEqual(exists, false);
  });

  test("bucketExists returns false when 404 status", async () => {
    const error = new Error("Not found");
    error.$metadata = { httpStatusCode: 404 };
    mockClient.send = mock.fn(() => Promise.reject(error));

    const exists = await s3Storage.bucketExists();

    assert.strictEqual(exists, false);
  });

  test("isHealthy returns true when bucket exists", async () => {
    const healthy = await s3Storage.isHealthy();

    assert.strictEqual(healthy, true);
    assert.strictEqual(mockCommands.HeadBucketCommand.mock.callCount(), 1);
  });

  test("isHealthy returns true when bucket not found (service reachable)", async () => {
    const error = new Error("Not found");
    error.name = "NotFound";
    mockClient.send = mock.fn(() => Promise.reject(error));

    const healthy = await s3Storage.isHealthy();

    assert.strictEqual(healthy, true);
  });

  test("isHealthy returns true when bucket 404 (service reachable)", async () => {
    const error = new Error("Not found");
    error.$metadata = { httpStatusCode: 404 };
    mockClient.send = mock.fn(() => Promise.reject(error));

    const healthy = await s3Storage.isHealthy();

    assert.strictEqual(healthy, true);
  });

  test("isHealthy returns false on connection error", async () => {
    const error = new Error("Connection refused");
    error.code = "ECONNREFUSED";
    mockClient.send = mock.fn(() => Promise.reject(error));

    const healthy = await s3Storage.isHealthy();

    assert.strictEqual(healthy, false);
  });

  test("isHealthy returns false on authentication error", async () => {
    const error = new Error("Access denied");
    error.name = "AccessDenied";
    mockClient.send = mock.fn(() => Promise.reject(error));

    const healthy = await s3Storage.isHealthy();

    assert.strictEqual(healthy, false);
  });

  test("getMany retrieves multiple items by keys", async () => {
    mockClient.send = mock.fn((command) => {
      if (command.params && command.params.Key === "test-prefix/file1.txt") {
        return Promise.resolve({ Body: [Buffer.from("content1")] });
      }
      if (command.params && command.params.Key === "test-prefix/file2.txt") {
        return Promise.resolve({ Body: [Buffer.from("content2")] });
      }
      const error = new Error("Not found");
      error.name = "NoSuchKey";
      return Promise.reject(error);
    });

    const results = await s3Storage.getMany([
      "file1.txt",
      "file2.txt",
      "missing.txt",
    ]);

    assert.deepStrictEqual(results, {
      "file1.txt": Buffer.from("content1"),
      "file2.txt": Buffer.from("content2"),
    });
    assert.strictEqual(mockClient.send.mock.callCount(), 3);
  });

  test("getMany handles errors other than NoSuchKey", async () => {
    mockClient.send = mock.fn(() =>
      Promise.reject(new Error("Permission denied")),
    );

    await assert.rejects(() => s3Storage.getMany(["file1.txt"]), {
      message: "Permission denied",
    });
  });

  test("findByPrefix finds keys with specified prefix", async () => {
    mockClient.send = mock.fn(() =>
      Promise.resolve({
        Contents: [
          { Key: "test-prefix/common.File.hash001.txt" },
          { Key: "test-prefix/common.File.hash002.txt" },
          { Key: "test-prefix/other:prefix.txt" },
        ],
      }),
    );

    const keys = await s3Storage.findByPrefix("common.File");

    assert.deepStrictEqual(keys, [
      "common.File.hash001.txt",
      "common.File.hash002.txt",
      "other:prefix.txt",
    ]);
    assert.strictEqual(mockCommands.ListObjectsV2Command.mock.callCount(), 1);
    assert.deepStrictEqual(
      mockCommands.ListObjectsV2Command.mock.calls[0].arguments[0].Prefix,
      "test-prefix/common.File",
    );
  });

  test("findByPrefix handles pagination", async () => {
    let callCount = 0;
    mockClient.send = mock.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          Contents: [{ Key: "test-prefix/prefix1.txt" }],
          NextContinuationToken: "token123",
        });
      } else {
        return Promise.resolve({
          Contents: [{ Key: "test-prefix/prefix2.txt" }],
        });
      }
    });

    const keys = await s3Storage.findByPrefix("prefix");

    assert.deepStrictEqual(keys, ["prefix1.txt", "prefix2.txt"]);
    assert.strictEqual(mockClient.send.mock.callCount(), 2);
  });
});
