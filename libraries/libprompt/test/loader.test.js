import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { PromptLoader, createPromptLoader } from "../index.js";

describe("PromptLoader", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "libprompt-test-"));
  });

  test("constructor throws when promptDir is not provided", () => {
    assert.throws(() => new PromptLoader(), {
      message: "promptDir is required",
    });
  });

  test("constructor throws when promptDir is empty string", () => {
    assert.throws(() => new PromptLoader(""), {
      message: "promptDir is required",
    });
  });

  test("constructor accepts valid promptDir", () => {
    const loader = new PromptLoader(tempDir);
    assert.ok(loader instanceof PromptLoader);
  });

  describe("load", () => {
    test("throws when promptName is not provided", () => {
      const loader = new PromptLoader(tempDir);
      assert.throws(() => loader.load(), {
        message: "promptName is required",
      });
    });

    test("throws when promptName is empty string", () => {
      const loader = new PromptLoader(tempDir);
      assert.throws(() => loader.load(""), {
        message: "promptName is required",
      });
    });

    test("throws when prompt file does not exist", () => {
      const loader = new PromptLoader(tempDir);
      assert.throws(() => loader.load("nonexistent"), {
        message: /Prompt file not found/,
      });
    });

    test("loads prompt file content", () => {
      const content = "# Test Prompt\n\nThis is a test prompt.";
      writeFileSync(join(tempDir, "test.prompt.md"), content);

      const loader = new PromptLoader(tempDir);
      const result = loader.load("test");

      assert.strictEqual(result, content);
    });

    test("loads prompt file with utf-8 encoding", () => {
      const content = "# Prompt with umlauts and accents";
      writeFileSync(join(tempDir, "unicode.prompt.md"), content);

      const loader = new PromptLoader(tempDir);
      const result = loader.load("unicode");

      assert.strictEqual(result, content);
    });
  });

  describe("render", () => {
    test("renders template with data", () => {
      const template = "Hello, {{name}}!";
      writeFileSync(join(tempDir, "greeting.prompt.md"), template);

      const loader = new PromptLoader(tempDir);
      const result = loader.render("greeting", { name: "World" });

      assert.strictEqual(result, "Hello, World!");
    });

    test("renders template with empty data object", () => {
      const template = "Hello, {{name}}!";
      writeFileSync(join(tempDir, "greeting.prompt.md"), template);

      const loader = new PromptLoader(tempDir);
      const result = loader.render("greeting", {});

      assert.strictEqual(result, "Hello, !");
    });

    test("renders template without data argument", () => {
      const template = "Static content";
      writeFileSync(join(tempDir, "static.prompt.md"), template);

      const loader = new PromptLoader(tempDir);
      const result = loader.render("static");

      assert.strictEqual(result, "Static content");
    });

    test("renders template with triple mustache for unescaped content", () => {
      const template = "Content: {{{html}}}";
      writeFileSync(join(tempDir, "html.prompt.md"), template);

      const loader = new PromptLoader(tempDir);
      const result = loader.render("html", { html: "<strong>bold</strong>" });

      assert.strictEqual(result, "Content: <strong>bold</strong>");
    });

    test("renders template with sections", () => {
      const template =
        "Items:{{#items}}\n- {{name}}{{/items}}\nTotal: {{total}}";
      writeFileSync(join(tempDir, "list.prompt.md"), template);

      const loader = new PromptLoader(tempDir);
      const result = loader.render("list", {
        items: [{ name: "First" }, { name: "Second" }],
        total: 2,
      });

      assert.strictEqual(result, "Items:\n- First\n- Second\nTotal: 2");
    });
  });

  test.afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });
});

describe("createPromptLoader", () => {
  test("returns a PromptLoader instance", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "libprompt-factory-"));
    const loader = createPromptLoader(tempDir);
    assert.ok(loader instanceof PromptLoader);
    rmSync(tempDir, { recursive: true, force: true });
  });
});
