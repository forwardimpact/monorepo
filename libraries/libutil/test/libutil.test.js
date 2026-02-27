import { describe, test, mock } from "node:test";
import assert from "node:assert";

// Module under test
import { createBundleDownloader } from "../index.js";

describe("libutil", () => {
  describe("createBundleDownloader", () => {
    test("creates BundleDownloader instance with correct dependencies", async () => {
      const mockStorageFactory = mock.fn();
      const mockProcess = { env: { STORAGE_TYPE: "local" } };

      const downloader = await createBundleDownloader(
        mockStorageFactory,
        mockProcess,
      );

      assert.ok(downloader);
      // Check that it's a BundleDownloader instance by checking if it has the expected methods
      assert.ok(typeof downloader.initialize === "function");
      assert.ok(typeof downloader.download === "function");
    });

    test("validates storageFactory parameter", async () => {
      await assert.rejects(() => createBundleDownloader(null), {
        message: /createStorage is required/,
      });
    });

    test("uses global process when not provided", async () => {
      const mockStorageFactory = mock.fn();

      const downloader = await createBundleDownloader(mockStorageFactory);

      assert.ok(downloader);
    });
  });
});
