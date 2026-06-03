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

  describe("constructor", () => {
    test("creates Finder with injected collaborators", () => {
      const finder = new Finder({
        fs: fsPromises,
        fsSync: fs,
        proc: mockProcess,
        logger: mockLogger,
      });

      assert.ok(finder instanceof Finder);
    });

    test("validates fs parameter", () => {
      assert.throws(() => new Finder(), {
        message: /fs is required/,
      });
      assert.throws(() => new Finder({ proc: mockProcess }), {
        message: /fs is required/,
      });
    });

    test("validates proc parameter", () => {
      assert.throws(() => new Finder({ fs: fsPromises }), {
        message: /proc is required/,
      });
    });

    test("defaults logger to a no-op when omitted", () => {
      const finder = new Finder({
        fs: fsPromises,
        fsSync: fs,
        proc: mockProcess,
      });
      assert.ok(finder instanceof Finder);
    });
  });

  describe("withLogger", () => {
    test("returns a new Finder that logs through the swapped logger", async () => {
      const otherLogger = createMockLogger();
      const scoped = finder.withLogger(otherLogger);

      assert.ok(scoped instanceof Finder);
      assert.notStrictEqual(scoped, finder);

      // createSymlink (the one Finder method that logs) now routes through the
      // swapped logger; the original is left untouched.
      const sourceDir = path.join(tempDir, "wl-source");
      const targetPath = path.join(tempDir, "wl-target");
      await scoped.createSymlink(sourceDir, targetPath);

      assert.strictEqual(otherLogger.debug.mock.calls.length, 1);
      assert.ok(
        otherLogger.debug.mock.calls[0].arguments[1].includes(
          "Created symlink",
        ),
      );
      assert.strictEqual(mockLogger.debug.mock.calls.length, 0);
    });

    test("preserves the injected fsSync existence binding", () => {
      const syncFs = createMockFs();
      const asyncFs = createMockFs();
      const base = new Finder({
        fs: asyncFs,
        fsSync: syncFs,
        proc: mockProcess,
      });

      base.withLogger(createMockLogger()).findUpward("/a/b/c", "target");

      // Existence still resolves through the SAME injected sync surface — the
      // rebuild must not silently fall back to the async `fs`.
      assert.ok(syncFs.existsSync.mock.calls.length > 0);
      assert.strictEqual(asyncFs.existsSync.mock.calls.length, 0);
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

  describe("findData", () => {
    test("finds data/ in CWD via findUpward", () => {
      const dataDir = path.join(tempDir, "data");
      fs.mkdirSync(dataDir);

      const cwdFinder = new Finder({
        fs: fsPromises,
        fsSync: fs,
        proc: { cwd: () => tempDir },
        logger: mockLogger,
      });
      const result = cwdFinder.findData("data", "/nonexistent-home");

      assert.strictEqual(result, dataDir);
    });

    test("finds data/ in a parent directory via findUpward", () => {
      const dataDir = path.join(tempDir, "data");
      fs.mkdirSync(dataDir);
      const subDir = path.join(tempDir, "products", "pathway");
      fs.mkdirSync(subDir, { recursive: true });

      const cwdFinder = new Finder({
        fs: fsPromises,
        fsSync: fs,
        proc: { cwd: () => subDir },
        logger: mockLogger,
      });
      const result = cwdFinder.findData("data", "/nonexistent-home");

      assert.strictEqual(result, dataDir);
    });

    test("falls back to ~/.fit/data/ when CWD traversal fails", () => {
      const fakeHome = path.join(tempDir, "fakehome");
      const homeFitData = path.join(fakeHome, ".fit", "data");
      fs.mkdirSync(homeFitData, { recursive: true });

      const isolatedDir = path.join(tempDir, "isolated");
      fs.mkdirSync(isolatedDir);

      const cwdFinder = new Finder({
        fs: fsPromises,
        fsSync: fs,
        proc: { cwd: () => isolatedDir },
        logger: mockLogger,
      });
      const result = cwdFinder.findData("data", fakeHome);

      assert.strictEqual(result, homeFitData);
    });

    test("throws when neither CWD traversal nor HOME fallback finds directory", () => {
      const isolatedDir = path.join(tempDir, "isolated");
      fs.mkdirSync(isolatedDir);

      const cwdFinder = new Finder({
        fs: fsPromises,
        fsSync: fs,
        proc: { cwd: () => isolatedDir },
        logger: mockLogger,
      });

      assert.throws(() => cwdFinder.findData("data", "/nonexistent-home"), {
        message: /No data directory found/,
      });
    });

    test("CWD takes priority over HOME when both exist", () => {
      const cwdData = path.join(tempDir, "data");
      fs.mkdirSync(cwdData);

      const fakeHome = path.join(tempDir, "fakehome");
      const homeFitData = path.join(fakeHome, ".fit", "data");
      fs.mkdirSync(homeFitData, { recursive: true });

      const cwdFinder = new Finder({
        fs: fsPromises,
        fsSync: fs,
        proc: { cwd: () => tempDir },
        logger: mockLogger,
      });
      const result = cwdFinder.findData("data", fakeHome);

      assert.strictEqual(result, cwdData);
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

      assert.strictEqual(result, path.join(packagePath, "src", "generated"));
    });
  });
});

// The collaborator-config constructor form injects fs/proc so the
// dead-`fs` bug (existence checks ignoring the injected fs) is fixed.
describe("Finder (collaborator config)", () => {
  test("findUpward uses the injected fs, not the real filesystem", () => {
    const mockFs = createMockFs({
      "/repo/sub/dir/package.json": "{}",
    });
    const finder = new Finder({
      fs: mockFs,
      proc: { cwd: () => "/repo/sub/dir" },
    });

    const result = finder.findUpward("/repo/sub/dir", "package.json");

    assert.strictEqual(result, "/repo/sub/dir/package.json");
    // The injected fs.existsSync drove the lookup — proves fs flows through.
    assert.ok(mockFs.existsSync.mock.calls.length > 0);
  });

  test("findUpward returns null when the injected fs has no match", () => {
    const mockFs = createMockFs({});
    const finder = new Finder({
      fs: mockFs,
      proc: { cwd: () => "/repo" },
    });

    assert.strictEqual(finder.findUpward("/repo", "package.json"), null);
  });

  test("fsSync drives existence checks when both surfaces are supplied", () => {
    const asyncFs = createMockFs({});
    const syncFs = createMockFs({ "/work/data": "" });
    const finder = new Finder({
      fs: asyncFs,
      fsSync: syncFs,
      proc: { cwd: () => "/work" },
    });

    assert.strictEqual(finder.findData("data", "/home"), "/work/data");
    assert.ok(syncFs.existsSync.mock.calls.length > 0);
    assert.strictEqual(asyncFs.existsSync.mock.calls.length, 0);
  });

  test("requires fs and proc", () => {
    assert.throws(() => new Finder({ proc: { cwd: () => "/" } }), {
      message: /fs is required/,
    });
    assert.throws(() => new Finder({ fs: {} }), {
      message: /proc is required/,
    });
  });
});
