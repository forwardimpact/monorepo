import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert";

import { LocalStorage } from "../index.js";

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
    const jsonlContent = jsonlData.map((obj) => JSON.stringify(obj)).join("\n");
    mockFs.readFile = mock.fn(() => Promise.resolve(Buffer.from(jsonlContent)));

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
        "/test/base/common.File.hash001.txt": new Date("2024-01-01T00:00:00Z"),
        "/test/base/common.File.hash002.txt": new Date("2024-01-02T00:00:00Z"),
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
