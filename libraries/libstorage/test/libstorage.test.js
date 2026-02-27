import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert";

// Module under test
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

describe("libstorage", () => {
  describe("LocalStorage", () => {
    let localStorage;
    let mockFs;

    beforeEach(() => {
      mockFs = {
        mkdir: mock.fn(() => Promise.resolve()),
        writeFile: mock.fn(() => Promise.resolve()),
        appendFile: mock.fn(() => Promise.resolve()),
        readFile: mock.fn(() => Promise.resolve(Buffer.from("test data"))),
        unlink: mock.fn(() => Promise.resolve()),
        access: mock.fn(() => Promise.resolve()),
        stat: mock.fn(() =>
          Promise.resolve({
            birthtime: new Date("2024-01-01T00:00:00Z"),
            mtime: new Date("2024-01-01T00:00:00Z"),
          }),
        ),
        readdir: mock.fn(() =>
          Promise.resolve([
            { name: "file1.txt", isFile: () => true, isDirectory: () => false },
            { name: "subdir", isFile: () => false, isDirectory: () => true },
          ]),
        ),
      };

      localStorage = new LocalStorage("/test/base", mockFs);
    });

    test("put creates directory and writes file", async () => {
      await localStorage.put("subdir/file.txt", "content");

      assert.strictEqual(mockFs.mkdir.mock.callCount(), 1);
      assert.strictEqual(mockFs.writeFile.mock.callCount(), 1);
      assert.deepStrictEqual(mockFs.writeFile.mock.calls[0].arguments, [
        "/test/base/subdir/file.txt",
        "content",
      ]);
    });

    test("get reads file", async () => {
      const result = await localStorage.get("file.txt");

      assert.strictEqual(mockFs.readFile.mock.callCount(), 1);
      assert.deepStrictEqual(mockFs.readFile.mock.calls[0].arguments, [
        "/test/base/file.txt",
      ]);
      assert(Buffer.isBuffer(result));
    });

    test("get parses JSON files automatically", async () => {
      const jsonData = { name: "test", value: 42 };
      mockFs.readFile = mock.fn(() =>
        Promise.resolve(Buffer.from(JSON.stringify(jsonData))),
      );

      const result = await localStorage.get("config.json");

      assert.strictEqual(mockFs.readFile.mock.callCount(), 1);
      assert.deepStrictEqual(result, jsonData);
    });

    test("get parses JSON Lines files automatically", async () => {
      const jsonlData = [
        { id: 1, name: "first" },
        { id: 2, name: "second" },
      ];
      const jsonlContent = jsonlData
        .map((obj) => JSON.stringify(obj))
        .join("\n");
      mockFs.readFile = mock.fn(() =>
        Promise.resolve(Buffer.from(jsonlContent)),
      );

      const result = await localStorage.get("data.jsonl");

      assert.strictEqual(mockFs.readFile.mock.callCount(), 1);
      assert.deepStrictEqual(result, jsonlData);
    });

    test("get returns empty object for empty JSON files", async () => {
      mockFs.readFile = mock.fn(() => Promise.resolve(Buffer.from("")));

      const result = await localStorage.get("empty.json");

      assert.deepStrictEqual(result, {});
    });

    test("get returns empty array for empty JSON Lines files", async () => {
      mockFs.readFile = mock.fn(() => Promise.resolve(Buffer.from("")));

      const result = await localStorage.get("empty.jsonl");

      assert.deepStrictEqual(result, []);
    });

    test("append creates directory and appends to file", async () => {
      await localStorage.append("subdir/file.txt", "new content");

      assert.strictEqual(mockFs.mkdir.mock.callCount(), 1);
      assert.strictEqual(mockFs.appendFile.mock.callCount(), 1);
      assert.deepStrictEqual(mockFs.appendFile.mock.calls[0].arguments, [
        "/test/base/subdir/file.txt",
        "new content\n",
      ]);
    });

    test("append automatically adds newline characters", async () => {
      await localStorage.append("file.txt", "line without newline");

      assert.strictEqual(mockFs.appendFile.mock.callCount(), 1);
      assert.deepStrictEqual(mockFs.appendFile.mock.calls[0].arguments, [
        "/test/base/file.txt",
        "line without newline\n",
      ]);
    });

    test("delete removes file", async () => {
      await localStorage.delete("file.txt");

      assert.strictEqual(mockFs.unlink.mock.callCount(), 1);
      assert.deepStrictEqual(mockFs.unlink.mock.calls[0].arguments, [
        "/test/base/file.txt",
      ]);
    });

    test("exists returns true when file exists", async () => {
      const exists = await localStorage.exists("file.txt");

      assert.strictEqual(exists, true);
      assert.strictEqual(mockFs.access.mock.callCount(), 1);
    });

    test("exists returns false when file missing", async () => {
      mockFs.access = mock.fn(() => Promise.reject(new Error("Not found")));

      const exists = await localStorage.exists("file.txt");

      assert.strictEqual(exists, false);
    });

    test("handles absolute paths", async () => {
      await localStorage.put("/absolute/path/file.txt", "content");

      assert.deepStrictEqual(
        mockFs.writeFile.mock.calls[0].arguments[0],
        "/absolute/path/file.txt",
      );
    });

    test("ensureBucket returns false when directory exists", async () => {
      const created = await localStorage.ensureBucket();

      assert.strictEqual(created, false);
      assert.strictEqual(mockFs.access.mock.callCount(), 1);
      assert.strictEqual(mockFs.mkdir.mock.callCount(), 0);
    });

    test("ensureBucket returns true when directory is created", async () => {
      mockFs.access = mock.fn(() => Promise.reject(new Error("Not found")));

      const created = await localStorage.ensureBucket();

      assert.strictEqual(created, true);
      assert.strictEqual(mockFs.access.mock.callCount(), 1);
      assert.strictEqual(mockFs.mkdir.mock.callCount(), 1);
      assert.deepStrictEqual(mockFs.mkdir.mock.calls[0].arguments, [
        "/test/base",
        { recursive: true },
      ]);
    });

    test("bucketExists returns true when directory exists", async () => {
      const exists = await localStorage.bucketExists();

      assert.strictEqual(exists, true);
      assert.strictEqual(mockFs.access.mock.callCount(), 1);
    });

    test("bucketExists returns false when directory missing", async () => {
      mockFs.access = mock.fn(() => Promise.reject(new Error("Not found")));

      const exists = await localStorage.bucketExists();

      assert.strictEqual(exists, false);
      assert.strictEqual(mockFs.access.mock.callCount(), 1);
    });

    test("getMany retrieves multiple items by keys", async () => {
      mockFs.readFile = mock.fn((path) => {
        if (path.includes("file1.txt")) return Promise.resolve("content1");
        if (path.includes("file2.txt")) return Promise.resolve("content2");
        return Promise.reject({ code: "ENOENT" });
      });

      const results = await localStorage.getMany([
        "file1.txt",
        "file2.txt",
        "missing.txt",
      ]);

      assert.deepStrictEqual(results, {
        "file1.txt": "content1",
        "file2.txt": "content2",
      });
      assert.strictEqual(mockFs.readFile.mock.callCount(), 3);
    });

    test("getMany handles errors other than ENOENT", async () => {
      mockFs.readFile = mock.fn(() =>
        Promise.reject(new Error("Permission denied")),
      );

      await assert.rejects(() => localStorage.getMany(["file1.txt"]), {
        message: "Permission denied",
      });
    });

    test("findByPrefix finds keys with specified prefix", async () => {
      mockFs.readdir = mock.fn((path) => {
        if (path === "/test/base") {
          return Promise.resolve([
            {
              name: "common.File.hash001.txt",
              isDirectory: () => false,
              isFile: () => true,
            },
            {
              name: "common.File.hash002.txt",
              isDirectory: () => false,
              isFile: () => true,
            },
            {
              name: "other:prefix.txt",
              isDirectory: () => false,
              isFile: () => true,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      mockFs.stat = mock.fn((path) => {
        const timestamps = {
          "/test/base/common.File.hash001.txt": new Date(
            "2024-01-01T00:00:00Z",
          ),
          "/test/base/common.File.hash002.txt": new Date(
            "2024-01-02T00:00:00Z",
          ),
          "/test/base/other:prefix.txt": new Date("2024-01-03T00:00:00Z"),
        };
        return Promise.resolve({
          birthtime: timestamps[path] || new Date("2024-01-01T00:00:00Z"),
          mtime: timestamps[path] || new Date("2024-01-01T00:00:00Z"),
        });
      });

      const keys = await localStorage.findByPrefix("common.File");

      assert.deepStrictEqual(keys, [
        "common.File.hash001.txt",
        "common.File.hash002.txt",
      ]);
    });

    test("findByExtension method", async () => {
      mockFs.readdir = mock.fn((path) => {
        if (path === "/test/base") {
          return Promise.resolve([
            { name: "file1.txt", isDirectory: () => false, isFile: () => true },
            {
              name: "file2.json",
              isDirectory: () => false,
              isFile: () => true,
            },
            { name: "file3.txt", isDirectory: () => false, isFile: () => true },
          ]);
        }
        return Promise.resolve([]);
      });

      mockFs.stat = mock.fn((path) => {
        const timestamps = {
          "/test/base/file1.txt": new Date("2024-01-01T00:00:00Z"),
          "/test/base/file2.json": new Date("2024-01-02T00:00:00Z"),
          "/test/base/file3.txt": new Date("2024-01-03T00:00:00Z"),
        };
        return Promise.resolve({
          birthtime: timestamps[path] || new Date("2024-01-01T00:00:00Z"),
          mtime: timestamps[path] || new Date("2024-01-01T00:00:00Z"),
        });
      });

      const keys = await localStorage.findByExtension(".txt");

      assert.deepStrictEqual(keys, ["file1.txt", "file3.txt"]);
    });

    test("list returns files in chronological order (oldest first)", async () => {
      mockFs.readdir = mock.fn((path) => {
        if (path === "/test/base") {
          return Promise.resolve([
            {
              name: "newest.txt",
              isDirectory: () => false,
              isFile: () => true,
            },
            {
              name: "oldest.txt",
              isDirectory: () => false,
              isFile: () => true,
            },
            {
              name: "middle.txt",
              isDirectory: () => false,
              isFile: () => true,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      mockFs.stat = mock.fn((path) => {
        const timestamps = {
          "/test/base/newest.txt": new Date("2024-01-03T00:00:00Z"),
          "/test/base/oldest.txt": new Date("2024-01-01T00:00:00Z"),
          "/test/base/middle.txt": new Date("2024-01-02T00:00:00Z"),
        };
        return Promise.resolve({
          birthtime: timestamps[path],
          mtime: timestamps[path],
        });
      });

      const keys = await localStorage.list();

      assert.deepStrictEqual(keys, ["oldest.txt", "middle.txt", "newest.txt"]);
    });
  });

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

      s3Storage = new S3Storage(
        "test-prefix",
        "guide",
        mockClient,
        mockCommands,
      );
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
      const jsonlContent = jsonlData
        .map((obj) => JSON.stringify(obj))
        .join("\n");
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
      assert.strictEqual(
        putCall.Body.toString(),
        "existing dataappended data\n",
      );
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
});
