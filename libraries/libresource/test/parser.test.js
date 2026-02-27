import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";

import { Parser } from "../parser.js";
import { Skolemizer } from "../skolemizer.js";

describe("Parser", () => {
  let parser;
  let skolemizer;
  let logger;

  beforeEach(() => {
    skolemizer = new Skolemizer();
    logger = { debug: () => {} };
    parser = new Parser(skolemizer, logger);
  });

  test("creates Parser instance", () => {
    assert.ok(parser instanceof Parser);
  });

  test("requires skolemizer in constructor", () => {
    assert.throws(
      () => {
        new Parser(null, logger);
      },
      {
        message: "skolemizer is required",
      },
    );
  });

  test("parses simple HTML with microdata", async () => {
    const html = `
      <div itemscope itemtype="https://schema.org/Article">
        <h1 itemprop="headline">Test Article</h1>
      </div>
    `;
    const dom = new JSDOM(html);
    const baseIri = "https://example.com/";

    const items = await parser.parseHTML(dom, baseIri);

    assert.ok(Array.isArray(items));
    assert.ok(items.length > 0, "Should extract at least one item");
  });

  test("returns empty array for HTML without microdata", async () => {
    const html = "<div><h1>No Microdata Here</h1></div>";
    const dom = new JSDOM(html);
    const baseIri = "https://example.com/";

    const items = await parser.parseHTML(dom, baseIri);

    assert.ok(Array.isArray(items));
    assert.strictEqual(items.length, 0, "Should return empty array");
  });

  test("unionQuads merges arrays without duplicates", () => {
    // Create mock quads
    const quad1 = {
      subject: { value: "https://example.com/article" },
      predicate: { value: "https://schema.org/name" },
      object: {
        value: "Test",
        termType: "Literal",
        datatype: { value: "http://www.w3.org/2001/XMLSchema#string" },
        language: "",
      },
    };

    const quad2 = {
      subject: { value: "https://example.com/article" },
      predicate: { value: "https://schema.org/headline" },
      object: {
        value: "Article",
        termType: "Literal",
        datatype: { value: "http://www.w3.org/2001/XMLSchema#string" },
        language: "",
      },
    };

    const existingQuads = [quad1];
    const newQuads = [quad1, quad2]; // quad1 is duplicate

    const merged = parser.unionQuads(existingQuads, newQuads);

    assert.strictEqual(merged.length, 2, "Should have 2 unique quads");
  });

  test("unionQuads handles literals with different datatypes", () => {
    // Same value but different datatypes should be treated as different quads
    const quad1 = {
      subject: { value: "https://example.com/item" },
      predicate: { value: "https://schema.org/value" },
      object: {
        value: "123",
        termType: "Literal",
        datatype: { value: "http://www.w3.org/2001/XMLSchema#string" },
        language: "",
      },
    };

    const quad2 = {
      subject: { value: "https://example.com/item" },
      predicate: { value: "https://schema.org/value" },
      object: {
        value: "123",
        termType: "Literal",
        datatype: { value: "http://www.w3.org/2001/XMLSchema#integer" },
        language: "",
      },
    };

    const merged = parser.unionQuads([quad1], [quad2]);

    assert.strictEqual(
      merged.length,
      2,
      "Literals with different datatypes should be distinct",
    );
  });

  test("unionQuads handles literals with different languages", () => {
    // Same value but different languages should be treated as different quads
    const quad1 = {
      subject: { value: "https://example.com/item" },
      predicate: { value: "https://schema.org/name" },
      object: {
        value: "Hello",
        termType: "Literal",
        datatype: { value: "" },
        language: "en",
      },
    };

    const quad2 = {
      subject: { value: "https://example.com/item" },
      predicate: { value: "https://schema.org/name" },
      object: {
        value: "Hello",
        termType: "Literal",
        datatype: { value: "" },
        language: "fr",
      },
    };

    const merged = parser.unionQuads([quad1], [quad2]);

    assert.strictEqual(
      merged.length,
      2,
      "Literals with different languages should be distinct",
    );
  });

  test("unionQuads is commutative", () => {
    const quad1 = {
      subject: { value: "https://example.com/a" },
      predicate: { value: "https://schema.org/name" },
      object: {
        value: "A",
        termType: "Literal",
        datatype: { value: "" },
        language: "",
      },
    };

    const quad2 = {
      subject: { value: "https://example.com/b" },
      predicate: { value: "https://schema.org/name" },
      object: {
        value: "B",
        termType: "Literal",
        datatype: { value: "" },
        language: "",
      },
    };

    const merged1 = parser.unionQuads([quad1], [quad2]);
    const merged2 = parser.unionQuads([quad2], [quad1]);

    assert.strictEqual(
      merged1.length,
      merged2.length,
      "Union should be commutative",
    );
    assert.strictEqual(merged1.length, 2, "Should have both quads");
  });

  test("quadsToRdf converts quads to N-Quads format", async () => {
    const { DataFactory } = await import("n3");
    const { namedNode, quad } = DataFactory;

    const quads = [
      quad(
        namedNode("https://example.com/test"),
        namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
        namedNode("https://schema.org/Article"),
      ),
    ];

    const nquads = await parser.quadsToRdf(quads);

    assert.ok(typeof nquads === "string", "Should return string");
    assert.ok(
      nquads.includes("https://example.com/test"),
      "Should contain subject",
    );
    assert.ok(
      nquads.includes("https://schema.org/Article"),
      "Should contain object",
    );
  });

  test("rdfToQuads parses N-Quads back to quad objects", async () => {
    const nquads = `<https://example.com/test> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://schema.org/Article> .
`;

    const quads = await parser.rdfToQuads(nquads);

    assert.ok(Array.isArray(quads), "Should return array");
    assert.ok(quads.length > 0, "Should have at least one quad");
    assert.strictEqual(quads[0].subject.value, "https://example.com/test");
    assert.strictEqual(quads[0].object.value, "https://schema.org/Article");
  });

  test("round-trip conversion preserves data (quads → N-Quads → quads)", async () => {
    // Create properly formatted N3 quads
    const { DataFactory } = await import("n3");
    const { namedNode, literal, quad } = DataFactory;

    const originalQuads = [
      quad(
        namedNode("https://example.com/test"),
        namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
        namedNode("https://schema.org/Article"),
      ),
      quad(
        namedNode("https://example.com/test"),
        namedNode("https://schema.org/name"),
        literal("Test Article"),
      ),
    ];

    const nquads = await parser.quadsToRdf(originalQuads);
    const parsedQuads = await parser.rdfToQuads(nquads);

    assert.strictEqual(
      parsedQuads.length,
      originalQuads.length,
      "Should preserve quad count",
    );
    assert.strictEqual(
      parsedQuads[0].subject.value,
      originalQuads[0].subject.value,
    );
    assert.strictEqual(
      parsedQuads[1].object.value,
      originalQuads[1].object.value,
    );
  });
});
