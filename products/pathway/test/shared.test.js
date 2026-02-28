import { test, describe } from "node:test";
import assert from "node:assert";

import {
  trimValue,
  trimRequired,
  splitLines,
  trimFields,
  formatLevelText,
  tableToMarkdown,
  objectToMarkdownList,
  formatPercent,
  capitalize,
  truncate,
} from "../src/formatters/shared.js";

describe("formatters/shared", () => {
  describe("trimValue", () => {
    test("trims trailing newlines", () => {
      assert.strictEqual(trimValue("hello\n\n"), "hello");
    });

    test("returns null for null input", () => {
      assert.strictEqual(trimValue(null), null);
    });

    test("returns null for undefined input", () => {
      assert.strictEqual(trimValue(undefined), null);
    });

    test("returns null for empty string after trim", () => {
      assert.strictEqual(trimValue("\n\n"), null);
    });

    test("preserves content without trailing newlines", () => {
      assert.strictEqual(trimValue("hello"), "hello");
    });
  });

  describe("trimRequired", () => {
    test("trims trailing newlines", () => {
      assert.strictEqual(trimRequired("hello\n"), "hello");
    });

    test("returns empty string for null", () => {
      assert.strictEqual(trimRequired(null), "");
    });

    test("preserves original if trim would result in empty", () => {
      assert.strictEqual(trimRequired("\n"), "\n");
    });
  });

  describe("splitLines", () => {
    test("splits string into lines", () => {
      assert.deepStrictEqual(splitLines("a\nb\nc"), ["a", "b", "c"]);
    });

    test("returns empty array for null", () => {
      assert.deepStrictEqual(splitLines(null), []);
    });

    test("returns empty array for empty string", () => {
      assert.deepStrictEqual(splitLines(""), []);
    });

    test("trims trailing newlines before splitting", () => {
      assert.deepStrictEqual(splitLines("a\nb\n\n"), ["a", "b"]);
    });
  });

  describe("trimFields", () => {
    test("trims optional fields", () => {
      const result = trimFields([{ name: "hello\n" }], { name: "optional" });
      assert.strictEqual(result[0].name, "hello");
    });

    test("trims required fields", () => {
      const result = trimFields([{ name: "hello\n" }], { name: "required" });
      assert.strictEqual(result[0].name, "hello");
    });

    test("trims array fields", () => {
      const result = trimFields([{ items: ["a\n", "b\n"] }], {
        items: "array",
      });
      assert.deepStrictEqual(result[0].items, ["a", "b"]);
    });

    test("returns empty array for null input", () => {
      assert.deepStrictEqual(trimFields(null, {}), []);
    });
  });

  describe("formatLevelText", () => {
    test("formats level 1", () => {
      assert.strictEqual(formatLevelText(1, "Awareness"), "●○○○○ Awareness");
    });

    test("formats level 5", () => {
      assert.strictEqual(formatLevelText(5, "Expert"), "●●●●● Expert");
    });

    test("formats level 3", () => {
      assert.strictEqual(formatLevelText(3, "Working"), "●●●○○ Working");
    });
  });

  describe("tableToMarkdown", () => {
    test("formats a markdown table", () => {
      const result = tableToMarkdown(
        ["Name", "Value"],
        [
          ["A", "1"],
          ["B", "2"],
        ],
      );
      assert.ok(result.includes("| Name | Value |"));
      assert.ok(result.includes("| --- | --- |"));
      assert.ok(result.includes("| A | 1 |"));
    });
  });

  describe("objectToMarkdownList", () => {
    test("formats key-value pairs as markdown list", () => {
      const result = objectToMarkdownList({ scope: "Team", autonomy: "High" });
      assert.ok(result.includes("- **Scope**: Team"));
      assert.ok(result.includes("- **Autonomy**: High"));
    });

    test("applies indentation", () => {
      const result = objectToMarkdownList({ key: "value" }, 2);
      assert.ok(result.startsWith("    - **Key**: value"));
    });
  });

  describe("formatPercent", () => {
    test("formats decimal as percentage", () => {
      assert.strictEqual(formatPercent(0.5), "50%");
    });

    test("formats 1 as 100%", () => {
      assert.strictEqual(formatPercent(1), "100%");
    });

    test("formats 0 as 0%", () => {
      assert.strictEqual(formatPercent(0), "0%");
    });

    test("rounds to nearest integer", () => {
      assert.strictEqual(formatPercent(0.333), "33%");
    });
  });

  describe("capitalize", () => {
    test("capitalizes snake_case", () => {
      assert.strictEqual(capitalize("impact_scope"), "Impact Scope");
    });

    test("capitalizes camelCase", () => {
      assert.strictEqual(capitalize("impactScope"), "Impact Scope");
    });

    test("capitalizes single word", () => {
      assert.strictEqual(capitalize("scope"), "Scope");
    });

    test("returns empty string for empty input", () => {
      assert.strictEqual(capitalize(""), "");
    });

    test("returns empty string for null-like input", () => {
      assert.strictEqual(capitalize(null), "");
    });
  });

  describe("truncate", () => {
    test("returns text unchanged if within limit", () => {
      assert.strictEqual(truncate("hello", 10), "hello");
    });

    test("truncates with ellipsis", () => {
      assert.strictEqual(truncate("hello world", 8), "hello...");
    });

    test("returns empty string for empty input", () => {
      assert.strictEqual(truncate(""), "");
    });

    test("returns empty string for null input", () => {
      assert.strictEqual(truncate(null), "");
    });
  });
});
