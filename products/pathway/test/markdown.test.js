import { test, describe } from "node:test";
import assert from "node:assert";

import { markdownToHtml } from "../src/lib/markdown.js";

describe("markdownToHtml", () => {
  test("converts h1 headings", () => {
    const result = markdownToHtml("# Hello");
    assert.strictEqual(result, "<h1>Hello</h1>");
  });

  test("converts h2 headings", () => {
    const result = markdownToHtml("## World");
    assert.strictEqual(result, "<h2>World</h2>");
  });

  test("converts h3 headings", () => {
    const result = markdownToHtml("### Section");
    assert.strictEqual(result, "<h3>Section</h3>");
  });

  test("converts unordered lists", () => {
    const result = markdownToHtml("- Item 1\n- Item 2");
    assert.ok(result.includes("<ul>"));
    assert.ok(result.includes("<li>Item 1</li>"));
    assert.ok(result.includes("<li>Item 2</li>"));
    assert.ok(result.includes("</ul>"));
  });

  test("converts paragraphs", () => {
    const result = markdownToHtml("Hello world");
    assert.strictEqual(result, "<p>Hello world</p>");
  });

  test("converts bold text", () => {
    const result = markdownToHtml("This is **bold** text");
    assert.ok(result.includes("<strong>bold</strong>"));
  });

  test("escapes HTML in headings", () => {
    const result = markdownToHtml("# <script>alert('xss')</script>");
    assert.ok(result.includes("&lt;script&gt;"));
    assert.ok(!result.includes("<script>"));
  });

  test("escapes HTML in paragraphs", () => {
    const result = markdownToHtml('Hello <img src="x" onerror="alert()">');
    assert.ok(result.includes("&lt;img"));
    assert.ok(!result.includes("<img"));
  });

  test("closes list before heading", () => {
    const result = markdownToHtml("- Item\n# Heading");
    const listClose = result.indexOf("</ul>");
    const heading = result.indexOf("<h1>");
    assert.ok(listClose < heading);
  });

  test("closes list at end of input", () => {
    const result = markdownToHtml("- Item 1\n- Item 2");
    assert.ok(result.endsWith("</ul>"));
  });

  test("handles empty lines between sections", () => {
    const result = markdownToHtml("# Title\n\nParagraph");
    assert.ok(result.includes("<h1>Title</h1>"));
    assert.ok(result.includes("<p>Paragraph</p>"));
  });
});
