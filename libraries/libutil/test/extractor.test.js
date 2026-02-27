import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// Module under test
import { TarExtractor, ZipExtractor } from "../extractor.js";

describe("TarExtractor", () => {
  let extractor;
  let tempDir;
  let fixturesDir;

  beforeEach(() => {
    extractor = new TarExtractor(fsPromises, path);

    // Setup directories
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    fixturesDir = path.join(__dirname, "fixtures");
    tempDir = path.join(__dirname, ".tmp-extractor-test");

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
    test("creates TarExtractor with fs and path", () => {
      const extractor = new TarExtractor(fsPromises, path);

      assert.ok(extractor instanceof TarExtractor);
    });

    test("validates fs parameter", () => {
      assert.throws(() => new TarExtractor(), {
        message: /fs dependency is required/,
      });
      assert.throws(() => new TarExtractor(null, path), {
        message: /fs dependency is required/,
      });
    });

    test("validates path parameter", () => {
      assert.throws(() => new TarExtractor(fsPromises), {
        message: /path dependency is required/,
      });
      assert.throws(() => new TarExtractor(fsPromises, null), {
        message: /path dependency is required/,
      });
    });
  });

  describe("extract", () => {
    test("extracts tar.gz archive to specified directory", async () => {
      const tarPath = path.join(fixturesDir, "sample.tar.gz");
      const outputDir = path.join(tempDir, "tar-output");

      await extractor.extract(tarPath, outputDir);

      // Verify extracted files exist
      assert.ok(fs.existsSync(path.join(outputDir, "test.txt")));
      assert.ok(fs.existsSync(path.join(outputDir, "nested.txt")));
      assert.ok(fs.existsSync(path.join(outputDir, "subdir", "deep.txt")));
    });

    test("extracts files with correct content", async () => {
      const tarPath = path.join(fixturesDir, "sample.tar.gz");
      const outputDir = path.join(tempDir, "tar-content");

      await extractor.extract(tarPath, outputDir);

      // Verify file contents
      const testContent = await fsPromises.readFile(
        path.join(outputDir, "test.txt"),
        "utf8",
      );
      assert.strictEqual(testContent.trim(), "Hello from root file");

      const nestedContent = await fsPromises.readFile(
        path.join(outputDir, "nested.txt"),
        "utf8",
      );
      assert.strictEqual(nestedContent.trim(), "Nested content");

      const deepContent = await fsPromises.readFile(
        path.join(outputDir, "subdir", "deep.txt"),
        "utf8",
      );
      assert.strictEqual(deepContent.trim(), "Deep file content");
    });

    test("creates nested directory structure", async () => {
      const tarPath = path.join(fixturesDir, "sample.tar.gz");
      const outputDir = path.join(tempDir, "tar-structure");

      await extractor.extract(tarPath, outputDir);

      // Verify directory structure
      const subdirPath = path.join(outputDir, "subdir");
      assert.ok(fs.existsSync(subdirPath));

      const stats = await fsPromises.stat(subdirPath);
      assert.ok(stats.isDirectory());
    });

    test("handles non-existent output directory", async () => {
      const tarPath = path.join(fixturesDir, "sample.tar.gz");
      const outputDir = path.join(tempDir, "deep", "nested", "tar-output");

      // Should not throw - should create directory structure
      await extractor.extract(tarPath, outputDir);

      assert.ok(fs.existsSync(path.join(outputDir, "test.txt")));
    });
  });
});

describe("ZipExtractor", () => {
  let extractor;
  let tempDir;
  let fixturesDir;

  beforeEach(() => {
    extractor = new ZipExtractor(fsPromises, path);

    // Setup directories
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    fixturesDir = path.join(__dirname, "fixtures");
    tempDir = path.join(__dirname, ".tmp-extractor-test");

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
    test("creates ZipExtractor with fs and path", () => {
      const extractor = new ZipExtractor(fsPromises, path);

      assert.ok(extractor instanceof ZipExtractor);
    });

    test("validates fs parameter", () => {
      assert.throws(() => new ZipExtractor(), {
        message: /fs dependency is required/,
      });
      assert.throws(() => new ZipExtractor(null, path), {
        message: /fs dependency is required/,
      });
    });

    test("validates path parameter", () => {
      assert.throws(() => new ZipExtractor(fsPromises), {
        message: /path dependency is required/,
      });
      assert.throws(() => new ZipExtractor(fsPromises, null), {
        message: /path dependency is required/,
      });
    });
  });

  describe("extract", () => {
    test("extracts zip archive to specified directory", async () => {
      const zipPath = path.join(fixturesDir, "sample.zip");
      const outputDir = path.join(tempDir, "zip-output");

      await extractor.extract(zipPath, outputDir);

      // Verify extracted files exist
      assert.ok(fs.existsSync(path.join(outputDir, "test.txt")));
      assert.ok(fs.existsSync(path.join(outputDir, "nested.txt")));
      assert.ok(fs.existsSync(path.join(outputDir, "subdir", "deep.txt")));
    });

    test("extracts files with correct content", async () => {
      const zipPath = path.join(fixturesDir, "sample.zip");
      const outputDir = path.join(tempDir, "zip-content");

      await extractor.extract(zipPath, outputDir);

      // Verify file contents
      const testContent = await fsPromises.readFile(
        path.join(outputDir, "test.txt"),
        "utf8",
      );
      assert.strictEqual(testContent.trim(), "Hello from root file");

      const nestedContent = await fsPromises.readFile(
        path.join(outputDir, "nested.txt"),
        "utf8",
      );
      assert.strictEqual(nestedContent.trim(), "Nested content");

      const deepContent = await fsPromises.readFile(
        path.join(outputDir, "subdir", "deep.txt"),
        "utf8",
      );
      assert.strictEqual(deepContent.trim(), "Deep file content");
    });

    test("creates nested directory structure", async () => {
      const zipPath = path.join(fixturesDir, "sample.zip");
      const outputDir = path.join(tempDir, "zip-structure");

      await extractor.extract(zipPath, outputDir);

      // Verify directory structure
      const subdirPath = path.join(outputDir, "subdir");
      assert.ok(fs.existsSync(subdirPath));

      const stats = await fsPromises.stat(subdirPath);
      assert.ok(stats.isDirectory());
    });

    test("handles non-existent output directory", async () => {
      const zipPath = path.join(fixturesDir, "sample.zip");
      const outputDir = path.join(tempDir, "deep", "nested", "zip-output");

      // Should not throw - should create directory structure
      await extractor.extract(zipPath, outputDir);

      assert.ok(fs.existsSync(path.join(outputDir, "test.txt")));
    });

    test("throws error for invalid zip file", async () => {
      const invalidZipPath = path.join(tempDir, "invalid.zip");

      // Create an invalid zip file (just some random bytes)
      await fsPromises.writeFile(invalidZipPath, Buffer.from([0, 1, 2, 3, 4]));

      const outputDir = path.join(tempDir, "invalid-output");

      await assert.rejects(
        async () => {
          await extractor.extract(invalidZipPath, outputDir);
        },
        {
          message: /Invalid ZIP file/,
        },
      );
    });
  });

  describe("format comparison", () => {
    test("both extractors produce identical file content", async () => {
      const tarPath = path.join(fixturesDir, "sample.tar.gz");
      const zipPath = path.join(fixturesDir, "sample.zip");
      const tarOutput = path.join(tempDir, "tar-compare");
      const zipOutput = path.join(tempDir, "zip-compare");

      const tarExtractor = new TarExtractor(fsPromises, path);
      const zipExtractor = new ZipExtractor(fsPromises, path);

      await tarExtractor.extract(tarPath, tarOutput);
      await zipExtractor.extract(zipPath, zipOutput);

      // Compare file contents
      const tarTest = await fsPromises.readFile(
        path.join(tarOutput, "test.txt"),
        "utf8",
      );
      const zipTest = await fsPromises.readFile(
        path.join(zipOutput, "test.txt"),
        "utf8",
      );
      assert.strictEqual(tarTest, zipTest);

      const tarNested = await fsPromises.readFile(
        path.join(tarOutput, "nested.txt"),
        "utf8",
      );
      const zipNested = await fsPromises.readFile(
        path.join(zipOutput, "nested.txt"),
        "utf8",
      );
      assert.strictEqual(tarNested, zipNested);

      const tarDeep = await fsPromises.readFile(
        path.join(tarOutput, "subdir", "deep.txt"),
        "utf8",
      );
      const zipDeep = await fsPromises.readFile(
        path.join(zipOutput, "subdir", "deep.txt"),
        "utf8",
      );
      assert.strictEqual(tarDeep, zipDeep);
    });

    test("both extractors create identical directory structure", async () => {
      const tarPath = path.join(fixturesDir, "sample.tar.gz");
      const zipPath = path.join(fixturesDir, "sample.zip");
      const tarOutput = path.join(tempDir, "tar-struct");
      const zipOutput = path.join(tempDir, "zip-struct");

      const tarExtractor = new TarExtractor(fsPromises, path);
      const zipExtractor = new ZipExtractor(fsPromises, path);

      await tarExtractor.extract(tarPath, tarOutput);
      await zipExtractor.extract(zipPath, zipOutput);

      // Check that both have the subdir
      assert.ok(fs.existsSync(path.join(tarOutput, "subdir")));
      assert.ok(fs.existsSync(path.join(zipOutput, "subdir")));

      // Check that both subdirs are directories
      const tarSubdirStats = await fsPromises.stat(
        path.join(tarOutput, "subdir"),
      );
      const zipSubdirStats = await fsPromises.stat(
        path.join(zipOutput, "subdir"),
      );
      assert.ok(tarSubdirStats.isDirectory());
      assert.ok(zipSubdirStats.isDirectory());
    });
  });
});
