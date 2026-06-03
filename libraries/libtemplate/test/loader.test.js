import { test, describe } from "node:test";
import assert from "node:assert";

import { TemplateLoader, createTemplateLoader } from "../src/index.js";
import { createMockFs, createTestRuntime } from "@forwardimpact/libmock";

const DEFAULTS_DIR = "/defaults";
const DATA_DIR = "/data";

/**
 * Build a TemplateLoader over an in-memory fs seeded with `files` (a
 * path→content map), injected through the loader's `runtime` parameter. The
 * defaults layer lives at `/defaults`; override-dir tests seed
 * `/data/templates/...` into the same map.
 */
function loaderWith(files = {}) {
  return new TemplateLoader(
    DEFAULTS_DIR,
    createTestRuntime({ fs: createMockFs(files) }),
  );
}

describe("TemplateLoader", () => {
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
    const loader = loaderWith();
    assert.ok(loader instanceof TemplateLoader);
  });

  describe("load", () => {
    test("throws when name is not provided", () => {
      const loader = loaderWith();
      assert.throws(() => loader.load(), {
        message: "name is required",
      });
    });

    test("throws when name is empty string", () => {
      const loader = loaderWith();
      assert.throws(() => loader.load(""), {
        message: "name is required",
      });
    });

    test("throws when template file does not exist", () => {
      const loader = loaderWith();
      assert.throws(() => loader.load("nonexistent.html"), {
        message: /Template 'nonexistent.html' not found/,
      });
    });

    test("loads template from defaults directory", () => {
      const content = "<h1>{{title}}</h1>";
      const loader = loaderWith({ [`${DEFAULTS_DIR}/page.html`]: content });
      const result = loader.load("page.html");

      assert.strictEqual(result, content);
    });

    test("loads template from dataDir override", () => {
      const loader = loaderWith({
        [`${DEFAULTS_DIR}/page.html`]: "default",
        [`${DATA_DIR}/templates/page.html`]: "override",
      });
      const result = loader.load("page.html", DATA_DIR);

      assert.strictEqual(result, "override");
    });

    test("falls back to defaults when dataDir template missing", () => {
      const loader = loaderWith({ [`${DEFAULTS_DIR}/page.html`]: "default" });
      const result = loader.load("page.html", DATA_DIR);

      assert.strictEqual(result, "default");
    });
  });

  describe("render", () => {
    test("renders template with data", () => {
      const loader = loaderWith({
        [`${DEFAULTS_DIR}/greeting.html`]: "Hello, {{name}}!",
      });
      const result = loader.render("greeting.html", { name: "World" });

      assert.strictEqual(result, "Hello, World!");
    });

    test("renders template with empty data", () => {
      const loader = loaderWith({
        [`${DEFAULTS_DIR}/greeting.html`]: "Hello, {{name}}!",
      });
      const result = loader.render("greeting.html", {});

      assert.strictEqual(result, "Hello, !");
    });

    test("renders template without data argument", () => {
      const loader = loaderWith({
        [`${DEFAULTS_DIR}/static.html`]: "Static content",
      });
      const result = loader.render("static.html");

      assert.strictEqual(result, "Static content");
    });

    test("renders template with sections", () => {
      const template = "<ul>{{#items}}<li>{{.}}</li>{{/items}}</ul>";
      const loader = loaderWith({ [`${DEFAULTS_DIR}/list.html`]: template });
      const result = loader.render("list.html", { items: ["a", "b"] });

      assert.strictEqual(result, "<ul><li>a</li><li>b</li></ul>");
    });

    test("renders from dataDir override", () => {
      const loader = loaderWith({
        [`${DEFAULTS_DIR}/page.html`]: "default {{v}}",
        [`${DATA_DIR}/templates/page.html`]: "custom {{v}}",
      });
      const result = loader.render("page.html", { v: "!" }, DATA_DIR);

      assert.strictEqual(result, "custom !");
    });
  });

  describe("renderWithPartials", () => {
    test("resolves a partial referenced via {{> name}}", () => {
      const loader = loaderWith({
        [`${DEFAULTS_DIR}/page.html`]:
          "<ul>{{#items}}{{> item.html}}{{/items}}</ul>",
        [`${DEFAULTS_DIR}/item.html`]: "<li>{{label}}</li>",
      });
      const result = loader.renderWithPartials(
        "page.html",
        { items: [{ label: "a" }, { label: "b" }] },
        ["item.html"],
      );

      assert.strictEqual(result, "<ul><li>a</li><li>b</li></ul>");
    });

    test("partial under dataDir/templates overrides the package default", () => {
      const loader = loaderWith({
        [`${DEFAULTS_DIR}/page.html`]: "{{> partial.html}}",
        [`${DEFAULTS_DIR}/partial.html`]: "default",
        [`${DATA_DIR}/templates/partial.html`]: "overridden",
      });
      const result = loader.renderWithPartials(
        "page.html",
        {},
        ["partial.html"],
        DATA_DIR,
      );

      assert.strictEqual(result, "overridden");
    });

    test("missing partial raises a Template not found error", () => {
      const loader = loaderWith({
        [`${DEFAULTS_DIR}/page.html`]: "{{> missing.html}}",
      });
      assert.throws(
        () => loader.renderWithPartials("page.html", {}, ["missing.html"]),
        {
          message: /Template 'missing.html' not found/,
        },
      );
    });

    test("renders without any partials when partialNames is empty", () => {
      const loader = loaderWith({
        [`${DEFAULTS_DIR}/page.html`]: "Hello, {{name}}!",
      });
      const result = loader.renderWithPartials(
        "page.html",
        { name: "World" },
        [],
      );

      assert.strictEqual(result, "Hello, World!");
    });
  });
});

describe("createTemplateLoader", () => {
  test("returns a TemplateLoader instance", () => {
    const loader = createTemplateLoader(
      DEFAULTS_DIR,
      createTestRuntime({ fs: createMockFs() }),
    );
    assert.ok(loader instanceof TemplateLoader);
  });
});
