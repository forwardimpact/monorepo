import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { stringifySorted, parseFrontmatter } from "../src/util.js";

describe("stringifySorted", () => {
  test("sorts object keys recursively", () => {
    const input = { z: 1, a: { c: 3, b: 2 } };
    const result = JSON.parse(stringifySorted(input));
    expect(Object.keys(result)).toEqual(["a", "z"]);
    expect(Object.keys(result.a)).toEqual(["b", "c"]);
  });

  test("preserves array order", () => {
    const input = { items: [3, 1, 2] };
    const result = JSON.parse(stringifySorted(input));
    expect(result.items).toEqual([3, 1, 2]);
  });

  test("round-trips produce identical output", () => {
    const input = { z: 1, a: { c: [3, 1], b: "hello" } };
    expect(stringifySorted(input)).toBe(stringifySorted(input));
  });

  test("ends with newline", () => {
    expect(stringifySorted({ a: 1 })).toMatch(/\n$/);
  });
});

describe("parseFrontmatter", () => {
  test("extracts key-value pairs", () => {
    const content = "---\nname: test-skill\ndescription: A test\n---\n# Body";
    const result = parseFrontmatter(content);
    expect(result.name).toBe("test-skill");
    expect(result.description).toBe("A test");
  });

  test("returns empty object for missing frontmatter", () => {
    expect(parseFrontmatter("# No frontmatter")).toEqual({});
  });
});
