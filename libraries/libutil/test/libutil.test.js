import { describe, test } from "node:test";
import assert from "node:assert";

// Module under test
import { createBundleDownloader } from "../src/index.js";
import { createSilentLogger, spy } from "@forwardimpact/libmock";

const mockLogger = createSilentLogger();

describe("libutil", () => {
  describe("createBundleDownloader", () => {
    test("creates BundleDownloader instance with correct dependencies", () => {
      const mockStorageFactory = spy();

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
      const mockStorageFactory = spy();
      assert.throws(() => createBundleDownloader(mockStorageFactory, null), {
        message: /logger is required/,
      });
    });
  });
});
