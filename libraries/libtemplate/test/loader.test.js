import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { TemplateLoader, createTemplateLoader } from "../index.js";

describe("TemplateLoader", () => {
  let defaultsDir;

  beforeEach(() => {
    defaultsDir = mkdtempSync(join(tmpdir(), "libtemplate-test-"));
  });

  test("constructor throws when defaultsDir is not provided", () => {
    assert.throws(() => new TemplateLoader(), {
      message: "defaultsDir is required",
    });
  });

  test("constructor throws when defaultsDir is empty string", () => {
    assert.throws(() => new TemplateLoader(""), {
      message: "defaultsDir is required",
    });
  });

  test("constructor accepts valid defaultsDir", () => {
    const loader = new TemplateLoader(defaultsDir);
    assert.ok(loader instanceof TemplateLoader);
  });

  describe("load", () => {
    test("throws when name is not provided", () => {
      const loader = new TemplateLoader(defaultsDir);
      assert.throws(() => loader.load(), {
        message: "name is required",
      });
    });

    test("throws when name is empty string", () => {
      const loader = new TemplateLoader(defaultsDir);
      assert.throws(() => loader.load(""), {
        message: "name is required",
      });
    });

    test("throws when template file does not exist", () => {
      const loader = new TemplateLoader(defaultsDir);
      assert.throws(() => loader.load("nonexistent.html"), {
        message: /Template 'nonexistent.html' not found/,
      });
    });

    test("loads template from defaults directory", () => {
      const content = "<h1>{{title}}</h1>";
      writeFileSync(join(defaultsDir, "page.html"), content);

      const loader = new TemplateLoader(defaultsDir);
      const result = loader.load("page.html");

      assert.strictEqual(result, content);
    });

    test("loads template from dataDir override", () => {
      const dataDir = mkdtempSync(join(tmpdir(), "libtemplate-data-"));
      mkdirSync(join(dataDir, "templates"), { recursive: true });

      writeFileSync(join(defaultsDir, "page.html"), "default");
      writeFileSync(join(dataDir, "templates", "page.html"), "override");

      const loader = new TemplateLoader(defaultsDir);
      const result = loader.load("page.html", dataDir);

      assert.strictEqual(result, "override");
      rmSync(dataDir, { recursive: true, force: true });
    });

    test("falls back to defaults when dataDir template missing", () => {
      const dataDir = mkdtempSync(join(tmpdir(), "libtemplate-data-"));
      mkdirSync(join(dataDir, "templates"), { recursive: true });

      writeFileSync(join(defaultsDir, "page.html"), "default");

      const loader = new TemplateLoader(defaultsDir);
      const result = loader.load("page.html", dataDir);

      assert.strictEqual(result, "default");
      rmSync(dataDir, { recursive: true, force: true });
    });
  });

  describe("render", () => {
    test("renders template with data", () => {
      writeFileSync(join(defaultsDir, "greeting.html"), "Hello, {{name}}!");

      const loader = new TemplateLoader(defaultsDir);
      const result = loader.render("greeting.html", { name: "World" });

      assert.strictEqual(result, "Hello, World!");
    });

    test("renders template with empty data", () => {
      writeFileSync(join(defaultsDir, "greeting.html"), "Hello, {{name}}!");

      const loader = new TemplateLoader(defaultsDir);
      const result = loader.render("greeting.html", {});

      assert.strictEqual(result, "Hello, !");
    });

    test("renders template without data argument", () => {
      writeFileSync(join(defaultsDir, "static.html"), "Static content");

      const loader = new TemplateLoader(defaultsDir);
      const result = loader.render("static.html");

      assert.strictEqual(result, "Static content");
    });

    test("renders template with sections", () => {
      const template = "<ul>{{#items}}<li>{{.}}</li>{{/items}}</ul>";
      writeFileSync(join(defaultsDir, "list.html"), template);

      const loader = new TemplateLoader(defaultsDir);
      const result = loader.render("list.html", { items: ["a", "b"] });

      assert.strictEqual(result, "<ul><li>a</li><li>b</li></ul>");
    });

    test("renders from dataDir override", () => {
      const dataDir = mkdtempSync(join(tmpdir(), "libtemplate-data-"));
      mkdirSync(join(dataDir, "templates"), { recursive: true });

      writeFileSync(join(defaultsDir, "page.html"), "default {{v}}");
      writeFileSync(join(dataDir, "templates", "page.html"), "custom {{v}}");

      const loader = new TemplateLoader(defaultsDir);
      const result = loader.render("page.html", { v: "!" }, dataDir);

      assert.strictEqual(result, "custom !");
      rmSync(dataDir, { recursive: true, force: true });
    });
  });

  test.afterEach(() => {
    try {
      rmSync(defaultsDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });
});

describe("createTemplateLoader", () => {
  test("returns a TemplateLoader instance", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "libtemplate-factory-"));
    const loader = createTemplateLoader(tempDir);
    assert.ok(loader instanceof TemplateLoader);
    rmSync(tempDir, { recursive: true, force: true });
  });
});
