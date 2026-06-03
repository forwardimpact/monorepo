import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { createMockFs, createMockLogger, spy } from "@forwardimpact/libmock";

// Module under test
import { Finder } from "../src/finder.js";

describe("Finder", () => {
  let mockLogger;
  let mockProcess;
  let finder;
  let tempDir;

  beforeEach(() => {
    mockLogger = createMockLogger();

    mockProcess = {
      cwd: () => "/test/project",
    };

    finder = new Finder({
      fs: fsPromises,
      fsSync: fs,
      proc: mockProcess,
      logger: mockLogger,
    });

    // Create a temporary directory for testing
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    tempDir = path.join(__dirname, ".tmp-linker-test");

    // Clean up any existing temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("createSymlink", () => {
    test("creates symlink between directories", async () => {
      const sourceDir = path.join(tempDir, "source");
      const targetPath = path.join(tempDir, "target");

      await finder.createSymlink(sourceDir, targetPath);

      assert.ok(fs.existsSync(targetPath));
      assert.ok(fs.lstatSync(targetPath).isSymbolicLink());
      assert.strictEqual(mockLogger.debug.mock.calls.length, 1);
      assert.ok(
        mockLogger.debug.mock.calls[0].arguments[1].includes("Created symlink"),
      );
    });

    test("removes existing target before creating symlink", async () => {
      const sourceDir = path.join(tempDir, "source");
      const targetPath = path.join(tempDir, "target");

      // Create existing target directory
      fs.mkdirSync(targetPath);
      fs.writeFileSync(path.join(targetPath, "existing.txt"), "test");

      await finder.createSymlink(sourceDir, targetPath);

      assert.ok(fs.existsSync(targetPath));
      assert.ok(fs.lstatSync(targetPath).isSymbolicLink());
      // Original file should be gone
      assert.ok(!fs.existsSync(path.join(targetPath, "existing.txt")));
    });

    test("removes existing symlink before creating new one", async () => {
      const sourceDir = path.join(tempDir, "source");
      const oldSourceDir = path.join(tempDir, "old-source");
      const targetPath = path.join(tempDir, "target");

      // Create old symlink
      fs.mkdirSync(oldSourceDir);
      fs.symlinkSync(oldSourceDir, targetPath, "dir");

      await finder.createSymlink(sourceDir, targetPath);

      assert.ok(fs.existsSync(targetPath));
      assert.ok(fs.lstatSync(targetPath).isSymbolicLink());
      // Should point to new source, via a relative target so the link
      // survives being restored at a different absolute path.
      assert.strictEqual(
        fs.readlinkSync(targetPath),
        path.relative(path.dirname(targetPath), sourceDir),
      );
    });
  });

  describe("createPackageSymlinks", () => {
    test("creates symlinks when project root is found", async () => {
      // Mock findProjectRoot to return a valid path
      const originalFindProjectRoot = finder.findProjectRoot;
      finder.findProjectRoot = spy(() => {
        const projectRoot = path.join(tempDir, "project");
        const packagesDir = path.join(projectRoot, "packages");
        fs.mkdirSync(path.join(packagesDir, "libtype"), { recursive: true });
        fs.mkdirSync(path.join(packagesDir, "librpc"), { recursive: true });
        return projectRoot;
      });

      const generatedPath = path.join(tempDir, "generated");

      await finder.createPackageSymlinks(generatedPath);

      // Should have called findProjectRoot
      assert.strictEqual(finder.findProjectRoot.mock.calls.length, 1);

      // Restore original method
      finder.findProjectRoot = originalFindProjectRoot;
    });

    test("creates symlinks for standard packages", async () => {
      // Create mock project structure
      const projectRoot = path.join(tempDir, "project");
      const packagesDir = path.join(projectRoot, "packages");
      fs.mkdirSync(path.join(packagesDir, "libtype"), { recursive: true });
      fs.mkdirSync(path.join(packagesDir, "librpc"), { recursive: true });

      // Mock findProjectRoot
      const originalFindProjectRoot = finder.findProjectRoot;
      finder.findProjectRoot = spy(() => projectRoot);

      const generatedPath = path.join(tempDir, "generated");
      fs.mkdirSync(generatedPath, { recursive: true });

      await finder.createPackageSymlinks(generatedPath);

      // Check that symlinks were created
      const libtypeTarget = path.join(
        packagesDir,
        "libtype",
        "src",
        "generated",
      );
      const librpcTarget = path.join(packagesDir, "librpc", "src", "generated");

      assert.ok(fs.existsSync(libtypeTarget));
      assert.ok(fs.lstatSync(libtypeTarget).isSymbolicLink());
      assert.ok(fs.existsSync(librpcTarget));
      assert.ok(fs.lstatSync(librpcTarget).isSymbolicLink());

      assert.ok(
        mockLogger.debug.mock.calls.some((call) =>
          call.arguments[1].includes("Created symlink"),
        ),
      );

      // Restore original method
      finder.findProjectRoot = originalFindProjectRoot;
    });
  });

});
