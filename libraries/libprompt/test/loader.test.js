import { test, describe } from "node:test";
import assert from "node:assert";

import { PromptLoader, createPromptLoader } from "../src/index.js";
import { createMockFs, createTestRuntime } from "@forwardimpact/libmock";

const PROMPT_DIR = "/prompts";

/**
 * Build a PromptLoader over an in-memory fs seeded with `files` (a path→content
 * map), injected through the loader's `runtime` parameter.
 */
function loaderWith(files = {}) {
  return new PromptLoader(
    PROMPT_DIR,
    createTestRuntime({ fs: createMockFs(files) }),
  );
}

describe("PromptLoader", () => {
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
    const loader = loaderWith();
    assert.ok(loader instanceof PromptLoader);
  });

  describe("load", () => {
    test("throws when promptName is not provided", () => {
      const loader = loaderWith();
      assert.throws(() => loader.load(), {
        message: "promptName is required",
      });
    });

    test("throws when promptName is empty string", () => {
      const loader = loaderWith();
      assert.throws(() => loader.load(""), {
        message: "promptName is required",
      });
    });

    test("throws when prompt file does not exist", () => {
      const loader = loaderWith();
      assert.throws(() => loader.load("nonexistent"), {
        message: /Prompt file not found/,
      });
    });

    test("loads prompt file content", () => {
      const content = "# Test Prompt\n\nThis is a test prompt.";
      const loader = loaderWith({ [`${PROMPT_DIR}/test.prompt.md`]: content });
      const result = loader.load("test");

      assert.strictEqual(result, content);
    });

    test("loads prompt file with utf-8 encoding", () => {
      const content = "# Prompt with umlauts and accents";
      const loader = loaderWith({
        [`${PROMPT_DIR}/unicode.prompt.md`]: content,
      });
      const result = loader.load("unicode");

      assert.strictEqual(result, content);
    });
  });

  describe("render", () => {
    test("renders template with data", () => {
      const template = "Hello, {{name}}!";
      const loader = loaderWith({
        [`${PROMPT_DIR}/greeting.prompt.md`]: template,
      });
      const result = loader.render("greeting", { name: "World" });

      assert.strictEqual(result, "Hello, World!");
    });

    test("renders template with empty data object", () => {
      const template = "Hello, {{name}}!";
      const loader = loaderWith({
        [`${PROMPT_DIR}/greeting.prompt.md`]: template,
      });
      const result = loader.render("greeting", {});

      assert.strictEqual(result, "Hello, !");
    });

    test("renders template without data argument", () => {
      const template = "Static content";
      const loader = loaderWith({
        [`${PROMPT_DIR}/static.prompt.md`]: template,
      });
      const result = loader.render("static");

      assert.strictEqual(result, "Static content");
    });

    test("renders template with triple mustache for unescaped content", () => {
      const template = "Content: {{{html}}}";
      const loader = loaderWith({
        [`${PROMPT_DIR}/html.prompt.md`]: template,
      });
      const result = loader.render("html", { html: "<strong>bold</strong>" });

      assert.strictEqual(result, "Content: <strong>bold</strong>");
    });

    test("renders template with sections", () => {
      const template =
        "Items:{{#items}}\n- {{name}}{{/items}}\nTotal: {{total}}";
      const loader = loaderWith({
        [`${PROMPT_DIR}/list.prompt.md`]: template,
      });
      const result = loader.render("list", {
        items: [{ name: "First" }, { name: "Second" }],
        total: 2,
      });

      assert.strictEqual(result, "Items:\n- First\n- Second\nTotal: 2");
    });
  });
});

describe("createPromptLoader", () => {
  test("returns a PromptLoader instance", () => {
    const loader = createPromptLoader(
      PROMPT_DIR,
      createTestRuntime({ fs: createMockFs() }),
    );
    assert.ok(loader instanceof PromptLoader);
  });
});
