import { strict as assert } from "node:assert";
import { test, describe, beforeEach, mock } from "node:test";

import { createSilentLogger } from "@forwardimpact/libharness";

import { BundleDownloader } from "../downloader.js";

describe("BundleDownloader", () => {
  let mockStorageFactory;
  let mockExtractor;
  let mockLogger;
  let mockFinder;
  let mockProcess;
  let mockLocalStorage;
  let mockRemoteStorage;

  beforeEach(() => {
    mockLocalStorage = {
      ensureBucket: async () => {},
      put: async () => {},
      delete: async () => {},
      path: (key = ".") => `/local/path/${key}`,
    };

    mockRemoteStorage = {
      exists: async () => true,
      get: async () => Buffer.from("bundle data"),
    };

    mockStorageFactory = (prefix, type) => {
      return type === "local" ? mockLocalStorage : mockRemoteStorage;
    };

    mockExtractor = {
      extract: mock.fn(async () => {}),
    };
    mockLogger = createSilentLogger();
    mockFinder = {
      createPackageSymlinks: mock.fn(async () => {}),
    };
    mockProcess = {
      env: { STORAGE_TYPE: "s3" },
    };
  });

  test("constructor validates required dependencies", () => {
    assert.throws(
      () =>
        new BundleDownloader(
          null,
          mockFinder,
          mockLogger,
          mockExtractor,
          mockProcess,
        ),
      /createStorageFn is required/,
    );

    assert.throws(
      () =>
        new BundleDownloader(
          mockStorageFactory,
          null,
          mockLogger,
          mockExtractor,
          mockProcess,
        ),
      /finder is required/,
    );

    assert.throws(
      () =>
        new BundleDownloader(
          mockStorageFactory,
          mockFinder,
          null,
          mockExtractor,
          mockProcess,
        ),
      /logger is required/,
    );

    assert.throws(
      () =>
        new BundleDownloader(
          mockStorageFactory,
          mockFinder,
          mockLogger,
          null,
          mockProcess,
        ),
      /extractor is required/,
    );

    assert.throws(
      () =>
        new BundleDownloader(
          mockStorageFactory,
          mockFinder,
          mockLogger,
          mockExtractor,
          null,
        ),
      /process is required/,
    );
  });

  test("downloads and extracts bundle when it exists", async () => {
    const operations = [];
    mockLocalStorage.put = async (key, data) => {
      operations.push({ op: "put", key, hasData: !!data });
    };
    mockLocalStorage.delete = async (key) => {
      operations.push({ op: "delete", key });
    };
    mockExtractor.extract = async (sourcePath, targetPath) => {
      operations.push({ op: "extract", sourcePath, targetPath });
    };

    const download = new BundleDownloader(
      mockStorageFactory,
      mockFinder,
      mockLogger,
      mockExtractor,
      mockProcess,
    );
    await download.initialize();
    await download.download();

    assert.strictEqual(operations.length, 3);
    assert.deepStrictEqual(operations[0], {
      op: "put",
      key: "bundle.tar.gz",
      hasData: true,
    });
    assert.strictEqual(operations[1].op, "extract");
    assert.strictEqual(operations[1].sourcePath, "/local/path/bundle.tar.gz");
    assert.strictEqual(operations[1].targetPath, "/local/path/.");
    assert.deepStrictEqual(operations[2], {
      op: "delete",
      key: "bundle.tar.gz",
    });
  });

  test("throws error when bundle does not exist", async () => {
    mockRemoteStorage.exists = async () => false;

    const download = new BundleDownloader(
      mockStorageFactory,
      mockFinder,
      mockLogger,
      mockExtractor,
      mockProcess,
    );
    await download.initialize();

    await assert.rejects(() => download.download(), {
      message: /Bundle not found/,
    });
  });

  test("initializes storage instances correctly", async () => {
    const ensureBucketCalls = [];
    mockLocalStorage.ensureBucket = async () => {
      ensureBucketCalls.push("generated");
    };

    const download = new BundleDownloader(
      mockStorageFactory,
      mockFinder,
      mockLogger,
      mockExtractor,
      mockProcess,
    );
    await download.initialize();

    assert.strictEqual(ensureBucketCalls.length, 1);
    assert.strictEqual(ensureBucketCalls[0], "generated");

    // Should have called createPackageSymlinks
    assert.strictEqual(mockFinder.createPackageSymlinks.mock.calls.length, 1);
    assert.strictEqual(
      mockFinder.createPackageSymlinks.mock.calls[0].arguments[0],
      "/local/path/.",
    );
  });

  test("skips download when STORAGE_TYPE is local", async () => {
    mockProcess.env.STORAGE_TYPE = "local";
    mockRemoteStorage.exists = mock.fn(async () => true);

    const download = new BundleDownloader(
      mockStorageFactory,
      mockFinder,
      mockLogger,
      mockExtractor,
      mockProcess,
    );
    await download.initialize();
    await download.download();

    // Should not have called remote storage
    assert.strictEqual(mockRemoteStorage.exists.mock.calls.length, 0);
  });

  test("downloads when STORAGE_TYPE is s3", async () => {
    mockProcess.env.STORAGE_TYPE = "s3";
    mockRemoteStorage.exists = mock.fn(async () => true);

    const download = new BundleDownloader(
      mockStorageFactory,
      mockFinder,
      mockLogger,
      mockExtractor,
      mockProcess,
    );
    await download.initialize();
    await download.download();

    // Should have called remote storage
    assert.strictEqual(mockRemoteStorage.exists.mock.calls.length, 1);
  });
});
