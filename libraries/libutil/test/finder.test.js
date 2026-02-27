import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { createMockLogger } from "@forwardimpact/libharness";

// Module under test
import { Finder } from "../finder.js";

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

    finder = new Finder(fsPromises, mockLogger, mockProcess);

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

  describe("constructor", () => {
    test("creates Finder with fs, logger and process", () => {
      const finder = new Finder(fsPromises, mockLogger, mockProcess);

      assert.ok(finder instanceof Finder);
    });

    test("validates fs parameter", () => {
      assert.throws(() => new Finder(), {
        message: /fs is required/,
      });
      assert.throws(() => new Finder(null), {
        message: /fs is required/,
      });
    });

    test("validates logger parameter", () => {
      assert.throws(() => new Finder(fsPromises), {
        message: /logger is required/,
      });
      assert.throws(() => new Finder(fsPromises, null), {
        message: /logger is required/,
      });
    });

    test("validates process parameter", () => {
      assert.throws(() => new Finder(fsPromises, mockLogger, null), {
        message: /process is required/,
      });
    });

    test("uses global process when not provided", () => {
      const finder = new Finder(fsPromises, mockLogger);
      assert.ok(finder instanceof Finder);
    });
  });

  describe("findUpward", () => {
    test("finds file in current directory", () => {
      // Create test structure
      const testFile = path.join(tempDir, "target.txt");
      fs.writeFileSync(testFile, "test");

      const result = finder.findUpward(tempDir, "target.txt");

      assert.strictEqual(result, testFile);
    });

    test("finds file in parent directory", () => {
      // Create test structure
      const subDir = path.join(tempDir, "subdir");
      fs.mkdirSync(subDir);
      const testFile = path.join(tempDir, "target.txt");
      fs.writeFileSync(testFile, "test");

      const result = finder.findUpward(subDir, "target.txt");

      assert.strictEqual(result, testFile);
    });

    test("returns null when file not found", () => {
      const result = finder.findUpward(tempDir, "nonexistent.txt");

      assert.strictEqual(result, null);
    });

    test("respects maxDepth parameter", () => {
      // Create nested structure
      const deepDir = path.join(tempDir, "a", "b", "c");
      fs.mkdirSync(deepDir, { recursive: true });
      const testFile = path.join(tempDir, "target.txt");
      fs.writeFileSync(testFile, "test");

      // Should not find with maxDepth of 2
      const result = finder.findUpward(deepDir, "target.txt", 2);

      assert.strictEqual(result, null);
    });
  });

  describe("findProjectRoot", () => {
    test("finds project root with package.json", () => {
      // Create test project structure
      const projectRoot = path.join(tempDir, "project");
      const packagesDir = path.join(projectRoot, "packages", "somepackage");
      fs.mkdirSync(packagesDir, { recursive: true });
      fs.writeFileSync(path.join(projectRoot, "package.json"), "{}");

      // Test from the package directory (3 levels deep from project root)
      const result = finder.findProjectRoot(packagesDir);

      assert.strictEqual(result, projectRoot);
    });

    test("throws error when project root not found", () => {
      // Create a directory structure without package.json at any level
      const deepDir = path.join(tempDir, "no-project", "deep", "dir");
      fs.mkdirSync(deepDir, { recursive: true });

      assert.throws(() => finder.findProjectRoot(deepDir), {
        message: /Could not find project root/,
      });
    });
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
      // Should point to new source
      assert.strictEqual(fs.readlinkSync(targetPath), sourceDir);
    });
  });

  describe("createPackageSymlinks", () => {
    test("creates symlinks when project root is found", async () => {
      // Mock findProjectRoot to return a valid path
      const originalFindProjectRoot = finder.findProjectRoot;
      finder.findProjectRoot = mock.fn(() => {
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
      finder.findProjectRoot = mock.fn(() => projectRoot);

      const generatedPath = path.join(tempDir, "generated");
      fs.mkdirSync(generatedPath, { recursive: true });

      await finder.createPackageSymlinks(generatedPath);

      // Check that symlinks were created
      const libtypeTarget = path.join(packagesDir, "libtype", "generated");
      const librpcTarget = path.join(packagesDir, "librpc", "generated");

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

  describe("findPackagePath", () => {
    test("finds package in local monorepo structure", () => {
      // Create mock monorepo structure
      const projectRoot = path.join(tempDir, "project");
      const packagePath = path.join(projectRoot, "packages", "libtype");
      fs.mkdirSync(packagePath, { recursive: true });

      const result = finder.findPackagePath(projectRoot, "libtype");

      assert.strictEqual(result, packagePath);
    });
  });

  describe("findGeneratedPath", () => {
    test("returns generated directory path for package", () => {
      // Create mock structure
      const projectRoot = path.join(tempDir, "project");
      const packagePath = path.join(projectRoot, "packages", "libtype");
      fs.mkdirSync(packagePath, { recursive: true });

      const result = finder.findGeneratedPath(projectRoot, "libtype");

      assert.strictEqual(result, path.join(packagePath, "generated"));
    });
  });
});
