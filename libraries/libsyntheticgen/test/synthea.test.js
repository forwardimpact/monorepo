import { describe, test } from "node:test";
import assert from "node:assert";
import { SyntheaTool } from "../tools/synthea.js";

const logger = { info() {}, error() {} };

describe("SyntheaTool", () => {
  test("requires all dependencies", () => {
    assert.throws(() => new SyntheaTool({}), /requires logger/);
    assert.throws(() => new SyntheaTool({ logger }), /requires syntheaJar/);
    assert.throws(
      () => new SyntheaTool({ logger, syntheaJar: "/path.jar" }),
      /requires execFileFn/,
    );
    assert.throws(
      () =>
        new SyntheaTool({
          logger,
          syntheaJar: "/path.jar",
          execFileFn: async () => {},
        }),
      /requires fsFns/,
    );
  });

  test("checkAvailability throws when java missing", async () => {
    const tool = new SyntheaTool({
      logger,
      syntheaJar: "/missing.jar",
      execFileFn: async () => {
        throw new Error("not found");
      },
      fsFns: { readFile: async () => Buffer.from("") },
    });
    await assert.rejects(
      () => tool.checkAvailability(),
      /Synthea requires Java/,
    );
  });

  test("passes correct args to java", async () => {
    let capturedArgs;
    const fhirBundle = {
      entry: [
        { resource: { resourceType: "Patient", id: "p1", name: "Alice" } },
        { resource: { resourceType: "Condition", id: "c1", code: "diabetes" } },
      ],
    };

    const tool = new SyntheaTool({
      logger,
      syntheaJar: "/synthea.jar",
      execFileFn: async (cmd, args) => {
        capturedArgs = { cmd, args };
        return { stdout: "" };
      },
      fsFns: {
        readFile: async (path, _enc) => {
          if (path === "/synthea.jar") return Buffer.from("");
          return JSON.stringify(fhirBundle);
        },
        readdir: async () => ["patient1.json"],
        mkdtemp: async () => "/tmp/synthea-abc",
        rm: async () => {},
      },
    });

    const datasets = await tool.generate({
      name: "test",
      population: 50,
      modules: ["diabetes"],
      seed: 42,
    });

    assert.strictEqual(capturedArgs.cmd, "java");
    assert.ok(capturedArgs.args.includes("-jar"));
    assert.ok(capturedArgs.args.includes("/synthea.jar"));
    assert.ok(capturedArgs.args.includes("-p"));
    assert.ok(capturedArgs.args.includes("50"));
    assert.ok(capturedArgs.args.includes("-s"));
    assert.ok(capturedArgs.args.includes("42"));
    assert.ok(capturedArgs.args.includes("-m"));
    assert.ok(capturedArgs.args.includes("diabetes"));

    // Verify dataset flattening by resource type
    assert.strictEqual(datasets.length, 2);
    const names = datasets.map((d) => d.name).sort();
    assert.deepStrictEqual(names, ["test_condition", "test_patient"]);

    const patientDs = datasets.find((d) => d.name === "test_patient");
    assert.strictEqual(patientDs.records.length, 1);
    assert.strictEqual(patientDs.metadata.tool, "synthea");
    assert.strictEqual(patientDs.metadata.resourceType, "Patient");
  });
});
