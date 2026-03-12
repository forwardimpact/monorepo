import { describe, test, mock } from "node:test";
import assert from "node:assert";

// Module under test
import { createBundleDownloader } from "../index.js";

const noop = () => {};
const mockLogger = { info: noop, debug: noop, warn: noop, error: noop };

describe("libutil", () => {
  describe("createBundleDownloader", () => {
    test("creates BundleDownloader instance with correct dependencies", () => {
      const mockStorageFactory = mock.fn();

      const downloader = createBundleDownloader(mockStorageFactory, mockLogger);

      assert.ok(downloader);
      assert.ok(typeof downloader.initialize === "function");
      assert.ok(typeof downloader.download === "function");
    });

    test("validates storageFactory parameter", () => {
      assert.throws(() => createBundleDownloader(null, mockLogger), {
        message: /createStorage is required/,
      });
    });

    test("validates logger parameter", () => {
      const mockStorageFactory = mock.fn();
      assert.throws(() => createBundleDownloader(mockStorageFactory, null), {
        message: /logger is required/,
      });
    });
  });
});
