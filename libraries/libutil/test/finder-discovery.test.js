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

    // Create a temporary directory for the test
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
    // Clean up the temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("constructor", () => {
    test("creates a Finder with injected collaborators", () => {
      const finder = new Finder({
        fs: fsPromises,
        fsSync: fs,
        proc: mockProcess,
        logger: mockLogger,
      });

      assert.ok(finder instanceof Finder);
    });

    test("validates the fs parameter", () => {
      assert.throws(() => new Finder(), {
        message: /fs is required/,
      });
      assert.throws(() => new Finder({ proc: mockProcess }), {
        message: /fs is required/,
      });
    });

    test("validates the proc parameter", () => {
      assert.throws(() => new Finder({ fs: fsPromises }), {
        message: /proc is required/,
      });
    });

    test("defaults the logger to a no-op when the caller omits it", () => {
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
      // swapped logger. The original logger stays untouched.
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

      // Existence still resolves through the SAME injected sync surface. The
      // rebuild must not silently fall back to the async `fs`.
      assert.ok(syncFs.existsSync.mock.calls.length > 0);
      assert.strictEqual(asyncFs.existsSync.mock.calls.length, 0);
    });
  });

  describe("findUpward", () => {
    test("finds a file in the current directory", () => {
      // Create the test structure
      const testFile = path.join(tempDir, "target.txt");
      fs.writeFileSync(testFile, "test");

      const result = finder.findUpward(tempDir, "target.txt");

      assert.strictEqual(result, testFile);
    });

    test("finds a file in the parent directory", () => {
      // Create the test structure
      const subDir = path.join(tempDir, "subdir");
      fs.mkdirSync(subDir);
      const testFile = path.join(tempDir, "target.txt");
      fs.writeFileSync(testFile, "test");

      const result = finder.findUpward(subDir, "target.txt");

      assert.strictEqual(result, testFile);
    });

    test("returns null when it does not find the file", () => {
      const result = finder.findUpward(tempDir, "nonexistent.txt");

      assert.strictEqual(result, null);
    });

    test("respects the maxDepth parameter", () => {
      // Create the nested structure
      const deepDir = path.join(tempDir, "a", "b", "c");
      fs.mkdirSync(deepDir, { recursive: true });
      const testFile = path.join(tempDir, "target.txt");
      fs.writeFileSync(testFile, "test");

      // The search should not find it with a maxDepth of 2
      const result = finder.findUpward(deepDir, "target.txt", 2);

      assert.strictEqual(result, null);
    });
  });

  describe("findProjectRoot", () => {
    test("finds the project root with package.json", () => {
      // Create the test project structure
      const projectRoot = path.join(tempDir, "project");
      const packagesDir = path.join(projectRoot, "packages", "somepackage");
      fs.mkdirSync(packagesDir, { recursive: true });
      fs.writeFileSync(path.join(projectRoot, "package.json"), "{}");

      // Test from the package directory (3 levels deep from the project root)
      const result = finder.findProjectRoot(packagesDir);

      assert.strictEqual(result, projectRoot);
    });

    test("throws an error when it does not find the project root", () => {
      // Create a directory structure without package.json at any level
      const deepDir = path.join(tempDir, "no-project", "deep", "dir");
      fs.mkdirSync(deepDir, { recursive: true });

      assert.throws(() => finder.findProjectRoot(deepDir), {
        message: /Could not find project root/,
      });
    });

    test("defaults the search origin to cwd when the caller gives no startPath", () => {
      const cwd = path.join(tempDir, "cwd-project");
      fs.mkdirSync(cwd, { recursive: true });
      fs.writeFileSync(path.join(cwd, "package.json"), "{}");

      const cwdFinder = new Finder({
        fs: fsPromises,
        fsSync: fs,
        proc: { cwd: () => cwd },
        logger: mockLogger,
      });

      assert.strictEqual(cwdFinder.findProjectRoot(), cwd);
    });

    test("returns cwd in a compiled binary and does not touch the filesystem", () => {
      // A compiled binary's module dir is the /$bunfs root. So the code skips
      // the upward package.json search entirely. cwd is the project root.
      const compiledFinder = new Finder({
        fs: fsPromises,
        fsSync: {
          existsSync: () => {
            throw new Error("compiled findProjectRoot must not hit the fs");
          },
        },
        proc: { cwd: () => "/launched/here" },
        logger: mockLogger,
        isCompiled: true,
      });

      assert.strictEqual(
        compiledFinder.findProjectRoot("/ignored"),
        "/launched/here",
      );
    });
  });

  describe("findData", () => {
    test("finds data/ in CWD through findUpward", () => {
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

    test("finds data/ in a parent directory through findUpward", () => {
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

    test("throws when neither CWD traversal nor HOME fallback finds the directory", () => {
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
    test("finds the package in the local monorepo structure", () => {
      // Create the mock monorepo structure
      const projectRoot = path.join(tempDir, "project");
      const packagePath = path.join(projectRoot, "packages", "libtype");
      fs.mkdirSync(packagePath, { recursive: true });

      const result = finder.findPackagePath(projectRoot, "libtype");

      assert.strictEqual(result, packagePath);
    });
  });

  describe("findGeneratedPath", () => {
    test("returns the generated directory path for the package", () => {
      // Create the mock structure
      const projectRoot = path.join(tempDir, "project");
      const packagePath = path.join(projectRoot, "packages", "libtype");
      fs.mkdirSync(packagePath, { recursive: true });

      const result = finder.findGeneratedPath(projectRoot, "libtype");

      assert.strictEqual(result, path.join(packagePath, "src", "generated"));
    });
  });
});

// The collaborator-config constructor form injects fs/proc. That fixes the
// dead-`fs` bug, where existence checks ignored the injected fs.
describe("Finder (collaborator config)", () => {
  test("findUpward uses the injected fs instead of the real filesystem", () => {
    const mockFs = createMockFs({
      "/repo/sub/dir/package.json": "{}",
    });
    const finder = new Finder({
      fs: mockFs,
      proc: { cwd: () => "/repo/sub/dir" },
    });

    const result = finder.findUpward("/repo/sub/dir", "package.json");

    assert.strictEqual(result, "/repo/sub/dir/package.json");
    // The injected fs.existsSync drove the lookup. That proves fs flows
    // through.
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

  test("fsSync drives existence checks when the caller supplies both surfaces", () => {
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
