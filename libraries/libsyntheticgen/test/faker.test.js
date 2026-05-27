import { describe, test } from "node:test";
import assert from "node:assert";
import { FakerTool } from "../src/tools/faker.js";
import {
  assertRejectsMessage,
  assertThrowsMessage,
} from "@forwardimpact/libmock";

const logger = {
  info() {},
  error() {},
};

describe("FakerTool", () => {
  test("requires logger", () => {
    assertThrowsMessage(() => new FakerTool({}), /requires logger/);
  });

  test("checkAvailability returns true", async () => {
    const tool = new FakerTool({ logger });
    assert.strictEqual(await tool.checkAvailability(), true);
  });

  test("generates correct number of records", async () => {
    const tool = new FakerTool({ logger });
    const datasets = await tool.generate({
      name: "test",
      rows: 10,
      fields: { id: "string.uuid", name: "person.fullName" },
      seed: 42,
    });
    assert.strictEqual(datasets.length, 1);
    assert.strictEqual(datasets[0].records.length, 10);
    assert.strictEqual(datasets[0].name, "test");
    assert.strictEqual(datasets[0].metadata.tool, "faker");
  });

  test("records have all specified fields", async () => {
    const tool = new FakerTool({ logger });
    const datasets = await tool.generate({
      name: "test",
      rows: 3,
      fields: { id: "string.uuid", email: "internet.email" },
      seed: 42,
    });
    for (const record of datasets[0].records) {
      assert.ok("id" in record, "record should have id");
      assert.ok("email" in record, "record should have email");
      assert.ok(typeof record.id === "string");
      assert.ok(typeof record.email === "string");
    }
  });

  test("deterministic with same seed", async () => {
    const tool = new FakerTool({ logger });
    const config = {
      name: "det",
      rows: 5,
      fields: { name: "person.fullName" },
      seed: 99,
    };
    const a = await tool.generate(config);
    const b = await tool.generate(config);
    assert.deepStrictEqual(a[0].records, b[0].records);
  });

  test("different seeds produce different records", async () => {
    const tool = new FakerTool({ logger });
    const base = { name: "det", rows: 5, fields: { name: "person.fullName" } };
    const a = await tool.generate({ ...base, seed: 1 });
    const b = await tool.generate({ ...base, seed: 2 });
    assert.notDeepStrictEqual(a[0].records, b[0].records);
  });

  test("throws on unknown provider", async () => {
    const tool = new FakerTool({ logger });
    await assertRejectsMessage(
      () =>
        tool.generate({
          name: "bad",
          rows: 1,
          fields: { x: "nonexistent.provider" },
          seed: 42,
        }),
      /Unknown Faker provider/,
    );
  });

  test("throws on non-function provider", async () => {
    const tool = new FakerTool({ logger });
    await assertRejectsMessage(
      () =>
        tool.generate({
          name: "bad",
          rows: 1,
          fields: { x: "string" },
          seed: 42,
        }),
      /is not a function/,
    );
  });
});
