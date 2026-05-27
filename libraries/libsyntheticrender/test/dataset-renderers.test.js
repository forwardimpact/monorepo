import { describe, test } from "node:test";
import assert from "node:assert";
import { renderDataset } from "../src/render/dataset-renderers.js";
import { assertRejectsMessage } from "@forwardimpact/libmock";

const FIXTURE = {
  name: "test_records",
  schema: null,
  records: [
    { id: 1, name: "Alice", active: true, score: 9.5, tags: null },
    { id: 2, name: "Bob", active: false, score: 7.2, tags: ["a", "b"] },
    { id: 3, name: "Carol", active: true, score: 8.0, tags: { nested: true } },
  ],
  metadata: { tool: "test" },
};

const EMPTY = {
  name: "empty",
  schema: null,
  records: [],
  metadata: { tool: "test" },
};

describe("dataset renderers", () => {
  describe("JSON", () => {
    test("renders valid JSON", async () => {
      const result = await renderDataset(FIXTURE, "json", {
        path: "out/test.json",
      });
      assert.strictEqual(result.size, 1);
      const content = result.get("out/test.json");
      const parsed = JSON.parse(content);
      assert.strictEqual(parsed.length, 3);
      assert.strictEqual(parsed[0].name, "Alice");
    });

    test("round-trips records", async () => {
      const result = await renderDataset(FIXTURE, "json", { path: "x.json" });
      const parsed = JSON.parse(result.get("x.json"));
      assert.deepStrictEqual(parsed, FIXTURE.records);
    });

    test("handles empty dataset", async () => {
      const result = await renderDataset(EMPTY, "json", { path: "e.json" });
      assert.deepStrictEqual(JSON.parse(result.get("e.json")), []);
    });
  });

  describe("YAML", () => {
    test("renders YAML content", async () => {
      const result = await renderDataset(FIXTURE, "yaml", {
        path: "out/test.yaml",
      });
      const content = result.get("out/test.yaml");
      assert.ok(content.includes("Alice"));
      assert.ok(content.includes("Bob"));
    });
  });

  describe("CSV", () => {
    test("renders header and rows", async () => {
      const result = await renderDataset(FIXTURE, "csv", {
        path: "out/test.csv",
      });
      const lines = result.get("out/test.csv").split("\n");
      assert.strictEqual(lines[0], "id,name,active,score,tags");
      assert.ok(lines[1].startsWith("1,Alice,true,9.5,"));
    });

    test("quotes values with commas", async () => {
      const ds = {
        name: "comma",
        schema: null,
        records: [{ val: "hello, world" }],
        metadata: {},
      };
      const result = await renderDataset(ds, "csv", { path: "c.csv" });
      const lines = result.get("c.csv").split("\n");
      assert.ok(lines[1].includes('"hello, world"'));
    });

    test("handles empty dataset", async () => {
      const result = await renderDataset(EMPTY, "csv", { path: "e.csv" });
      assert.strictEqual(result.get("e.csv"), "");
    });

    test("serializes nested objects as JSON strings", async () => {
      const ds = {
        name: "nested",
        schema: null,
        records: [{ data: { key: "val" } }],
        metadata: {},
      };
      const result = await renderDataset(ds, "csv", { path: "n.csv" });
      const content = result.get("n.csv");
      // Nested object is serialized as JSON, then CSV-escaped (quotes doubled)
      assert.ok(content.includes('{""key"":""val""}'));
    });
  });

  describe("Markdown", () => {
    test("renders table with header", async () => {
      const result = await renderDataset(FIXTURE, "markdown", {
        path: "out/test.md",
      });
      const content = result.get("out/test.md");
      assert.ok(content.startsWith("# test_records"));
      assert.ok(content.includes("| id | name |"));
      assert.ok(content.includes("| --- |"));
      assert.ok(content.includes("Alice"));
    });

    test("handles empty dataset", async () => {
      const result = await renderDataset(EMPTY, "markdown", { path: "e.md" });
      const content = result.get("e.md");
      assert.ok(content.includes("No records."));
    });

    test("escapes pipe characters", async () => {
      const ds = {
        name: "pipe",
        schema: null,
        records: [{ val: "a|b" }],
        metadata: {},
      };
      const result = await renderDataset(ds, "markdown", { path: "p.md" });
      assert.ok(result.get("p.md").includes("a\\|b"));
    });
  });

  describe("SQL INSERT", () => {
    test("renders INSERT statement", async () => {
      const result = await renderDataset(FIXTURE, "sql", {
        path: "out/test.sql",
        table: "my_table",
      });
      const content = result.get("out/test.sql");
      assert.ok(content.startsWith('INSERT INTO "my_table"'));
      assert.ok(content.includes('"id"'));
      assert.ok(content.includes("'Alice'"));
      assert.ok(content.includes("TRUE"));
      assert.ok(content.includes("FALSE"));
      assert.ok(content.endsWith(";\n"));
    });

    test("uses dataset name as default table", async () => {
      const result = await renderDataset(FIXTURE, "sql", {
        path: "out/test.sql",
      });
      const content = result.get("out/test.sql");
      assert.ok(content.includes('"test_records"'));
    });

    test("escapes single quotes in strings", async () => {
      const ds = {
        name: "esc",
        schema: null,
        records: [{ val: "it's" }],
        metadata: {},
      };
      const result = await renderDataset(ds, "sql", {
        path: "e.sql",
        table: "t",
      });
      assert.ok(result.get("e.sql").includes("'it''s'"));
    });

    test("renders NULL for null values", async () => {
      const result = await renderDataset(FIXTURE, "sql", {
        path: "n.sql",
        table: "t",
      });
      assert.ok(result.get("n.sql").includes("NULL"));
    });

    test("handles empty dataset", async () => {
      const result = await renderDataset(EMPTY, "sql", {
        path: "e.sql",
        table: "t",
      });
      assert.ok(result.get("e.sql").includes("No records"));
    });
  });

  describe("Parquet", () => {
    test("renders parquet buffer", async () => {
      const simpleDs = {
        name: "parq",
        schema: null,
        records: [
          { id: 1, name: "Alice" },
          { id: 2, name: "Bob" },
        ],
        metadata: {},
      };
      const result = await renderDataset(simpleDs, "parquet", {
        path: "out/test.parquet",
      });
      const buf = result.get("out/test.parquet");
      assert.ok(Buffer.isBuffer(buf));
      assert.ok(buf.length > 0);
      // Parquet magic bytes: PAR1
      assert.strictEqual(buf.toString("ascii", 0, 4), "PAR1");
    });
  });

  describe("dispatch", () => {
    test("throws on unknown format", async () => {
      await assertRejectsMessage(
        () => renderDataset(FIXTURE, "xlsx", { path: "x" }),
        /Unknown format: xlsx/,
      );
    });
  });
});
