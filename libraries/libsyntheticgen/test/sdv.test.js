import { describe, test } from "node:test";
import assert from "node:assert";
import { SdvTool } from "../tools/sdv.js";

const logger = { info() {}, error() {} };

describe("SdvTool", () => {
  test("requires all dependencies", () => {
    assert.throws(() => new SdvTool({}), /requires logger/);
    assert.throws(() => new SdvTool({ logger }), /requires execFileFn/);
    assert.throws(
      () => new SdvTool({ logger, execFileFn: async () => {} }),
      /requires fsFns/,
    );
  });

  test("checkAvailability throws when python/sdv missing", async () => {
    const tool = new SdvTool({
      logger,
      execFileFn: async () => {
        throw new Error("not found");
      },
      fsFns: { writeFile: async () => {}, rm: async () => {} },
    });
    await assert.rejects(
      () => tool.checkAvailability(),
      /SDV requires Python 3/,
    );
  });

  test("parses subprocess output into datasets", async () => {
    let _capturedConfig;
    const stdout = [
      JSON.stringify({ name: "orders", records: [{ id: 1, amount: 99.5 }] }),
      JSON.stringify({
        name: "items",
        records: [{ id: 2, product: "widget" }],
      }),
    ].join("\n");

    const tool = new SdvTool({
      logger,
      execFileFn: async (cmd, args) => {
        _capturedConfig = args;
        return { stdout };
      },
      fsFns: {
        writeFile: async () => {},
        rm: async () => {},
      },
    });

    const datasets = await tool.generate({
      name: "sales",
      metadata: "meta.json",
      data: { orders: "orders.csv", items: "items.csv" },
      rows: 100,
      seed: 42,
    });

    assert.strictEqual(datasets.length, 2);
    assert.strictEqual(datasets[0].name, "sales_orders");
    assert.strictEqual(datasets[0].records[0].amount, 99.5);
    assert.strictEqual(datasets[0].metadata.tool, "sdv");
    assert.strictEqual(datasets[1].name, "sales_items");
  });
});
