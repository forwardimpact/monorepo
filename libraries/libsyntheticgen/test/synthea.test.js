import { describe, test } from "node:test";
import assert from "node:assert";
import { SyntheaTool } from "../src/tools/synthea.js";
import {
  assertRejectsMessage,
  assertThrowsMessage,
  createMockFs,
  createSilentLogger,
} from "@forwardimpact/libmock";

const logger = createSilentLogger();

const JAR = "/synthea.jar";

/**
 * A libmock in-memory fs to back SyntheaTool's `fsFns`, plus an `execFileFn`
 * that materialises the supplied FHIR `bundles` under the temp dir Synthea was
 * told to export to (the `--exporter.baseDirectory` arg). This mirrors the real
 * flow — the tool creates a temp dir, the java run writes `fhir/*.json` into
 * it, then the tool reads them back — without touching the real filesystem.
 *
 * @param {object[]} [bundles] - FHIR bundles the run "produces".
 * @param {string} [jar] - The jar path to seed so the availability check passes.
 */
function syntheaDeps(bundles = [], jar = JAR) {
  const fs = createMockFs({ [jar]: "" });
  const execFileFn = async (cmd, args) => {
    const baseDir = args[args.indexOf("--exporter.baseDirectory") + 1];
    for (const [i, bundle] of bundles.entries()) {
      await fs.writeFile(
        `${baseDir}/fhir/bundle${i + 1}.json`,
        JSON.stringify(bundle),
      );
    }
    return { stdout: "" };
  };
  return { fsFns: fs, execFileFn };
}

describe("SyntheaTool", () => {
  test("requires all dependencies", () => {
    assertThrowsMessage(() => new SyntheaTool({}), /requires logger/);
    assertThrowsMessage(
      () => new SyntheaTool({ logger }),
      /requires syntheaJar/,
    );
    assertThrowsMessage(
      () => new SyntheaTool({ logger, syntheaJar: "/path.jar" }),
      /requires execFileFn/,
    );
    assertThrowsMessage(
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
      fsFns: syntheaDeps([], "/missing.jar").fsFns,
    });
    await assertRejectsMessage(
      () => tool.checkAvailability(),
      /Synthea requires Java/,
    );
  });

  test("checkAvailability error message references 'just synthetic-deps'", async () => {
    const tool = new SyntheaTool({
      logger,
      syntheaJar: "/missing.jar",
      execFileFn: async () => {
        throw new Error("not found");
      },
      fsFns: syntheaDeps([], "/missing.jar").fsFns,
    });
    await assertRejectsMessage(
      () => tool.checkAvailability(),
      /just synthetic-deps/,
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

    const { fsFns, execFileFn } = syntheaDeps([fhirBundle]);
    const tool = new SyntheaTool({
      logger,
      syntheaJar: JAR,
      execFileFn: async (cmd, args) => {
        capturedArgs = { cmd, args };
        return execFileFn(cmd, args);
      },
      fsFns,
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
    assert.deepStrictEqual(names, ["test-condition", "test-patient"]);

    const patientDs = datasets.find((d) => d.name === "test-patient");
    assert.strictEqual(patientDs.records.length, 1);
    assert.strictEqual(patientDs.metadata.tool, "synthea");
    assert.strictEqual(patientDs.metadata.resourceType, "Patient");
  });

  test("filterByConditions keeps only patients with matching FHIR Condition codes", async () => {
    // 5 patients, 3 with diabetes — output should contain those 3 only.
    const bundles = makeFhirBundles([
      { patient: "p1", conditions: [{ display: "Diabetes" }] },
      { patient: "p2", conditions: [{ display: "Hypertension" }] },
      { patient: "p3", conditions: [{ display: "Diabetes" }] },
      { patient: "p4", conditions: [{ display: "Diabetes" }] },
      { patient: "p5", conditions: [{ display: "Migraine" }] },
    ]);

    const tool = makeToolWithBundles(bundles, "/synthea.jar");
    const datasets = await tool.generate({
      name: "trial-patients",
      population: 5,
      conditions: ["diabetes"],
      seed: 1,
    });

    const patientDs = datasets.find((d) => d.name === "trial-patients-patient");
    assert.strictEqual(patientDs.records.length, 3);
    const ids = patientDs.records.map((r) => r.id).sort();
    assert.deepStrictEqual(ids, ["p1", "p3", "p4"]);
  });

  test("filterByConditions matches by FHIR code over display text", async () => {
    const bundles = makeFhirBundles([
      { patient: "p1", conditions: [{ code: "E11", display: "Type 2" }] },
      { patient: "p2", conditions: [{ code: "I10", display: "Hypertension" }] },
    ]);
    const tool = makeToolWithBundles(bundles, "/synthea.jar");
    const datasets = await tool.generate({
      name: "trial-patients",
      population: 2,
      conditions: ["E11"],
      seed: 1,
    });
    const patientDs = datasets.find((d) => d.name === "trial-patients-patient");
    assert.strictEqual(patientDs.records.length, 1);
    assert.strictEqual(patientDs.records[0].id, "p1");
  });

  test("no conditions field — no filtering applied", async () => {
    const bundles = makeFhirBundles([
      { patient: "p1", conditions: [{ display: "Diabetes" }] },
      { patient: "p2", conditions: [{ display: "Hypertension" }] },
    ]);
    const tool = makeToolWithBundles(bundles, "/synthea.jar");
    const datasets = await tool.generate({
      name: "patients",
      population: 2,
      seed: 1,
    });
    const patientDs = datasets.find((d) => d.name === "patients-patient");
    assert.strictEqual(patientDs.records.length, 2);
  });

  test("filterByConditions handles empty Condition list — no patient drop", async () => {
    const bundles = [
      {
        entry: [
          { resource: { resourceType: "Patient", id: "p1" } },
          { resource: { resourceType: "Patient", id: "p2" } },
        ],
      },
    ];
    const tool = makeToolWithBundles(bundles, "/synthea.jar");
    const datasets = await tool.generate({
      name: "patients",
      population: 2,
      conditions: ["diabetes"],
      seed: 1,
    });
    // No Condition resources → no patient gets a match, but the no-match
    // branch leaves data untouched rather than wiping it.
    const patientDs = datasets.find((d) => d.name === "patients-patient");
    assert.strictEqual(patientDs.records.length, 2);
  });

  test("filterByConditions retains linked Encounters/Observations of matched patients", async () => {
    // Real Synthea bundles include Encounter, Observation, etc., each with
    // their own resource id and a `subject.reference` back to the patient.
    // The filter must walk subject.reference, not r.id, for non-Patient rows.
    const bundles = [
      {
        entry: [
          { resource: { resourceType: "Patient", id: "p1" } },
          {
            resource: {
              resourceType: "Condition",
              id: "cond-1",
              code: { coding: [{ display: "Diabetes" }] },
              subject: { reference: "urn:uuid:p1" },
            },
          },
          {
            resource: {
              resourceType: "Encounter",
              id: "enc-1",
              subject: { reference: "urn:uuid:p1" },
            },
          },
          {
            resource: {
              resourceType: "Observation",
              id: "obs-1",
              subject: { reference: "urn:uuid:p1" },
            },
          },
        ],
      },
      {
        entry: [
          { resource: { resourceType: "Patient", id: "p2" } },
          {
            resource: {
              resourceType: "Condition",
              id: "cond-2",
              code: { coding: [{ display: "Hypertension" }] },
              subject: { reference: "urn:uuid:p2" },
            },
          },
          {
            resource: {
              resourceType: "Encounter",
              id: "enc-2",
              subject: { reference: "urn:uuid:p2" },
            },
          },
        ],
      },
    ];
    const tool = makeToolWithBundles(bundles, "/synthea.jar");
    const datasets = await tool.generate({
      name: "patients",
      population: 2,
      conditions: ["diabetes"],
      seed: 1,
    });
    const byType = Object.fromEntries(
      datasets.map((d) => [d.metadata.resourceType, d.records]),
    );
    assert.strictEqual(byType.Patient.length, 1);
    assert.strictEqual(byType.Patient[0].id, "p1");
    assert.strictEqual(byType.Condition.length, 1);
    assert.strictEqual(byType.Condition[0].id, "cond-1");
    assert.strictEqual(byType.Encounter.length, 1);
    assert.strictEqual(byType.Encounter[0].id, "enc-1");
    assert.strictEqual(byType.Observation.length, 1);
  });

  test("filterByConditions handles Patient/<id> reference form", async () => {
    const bundles = [
      {
        entry: [
          { resource: { resourceType: "Patient", id: "p1" } },
          {
            resource: {
              resourceType: "Condition",
              id: "cond-1",
              code: { coding: [{ display: "Diabetes" }] },
              subject: { reference: "Patient/p1" },
            },
          },
          {
            resource: {
              resourceType: "Encounter",
              id: "enc-1",
              subject: { reference: "Patient/p1" },
            },
          },
        ],
      },
    ];
    const tool = makeToolWithBundles(bundles, "/synthea.jar");
    const datasets = await tool.generate({
      name: "patients",
      population: 1,
      conditions: ["diabetes"],
      seed: 1,
    });
    const byType = Object.fromEntries(
      datasets.map((d) => [d.metadata.resourceType, d.records]),
    );
    assert.strictEqual(byType.Patient.length, 1);
    assert.strictEqual(byType.Encounter.length, 1);
  });

  test("empty FHIR output — generate returns no datasets without error", async () => {
    const tool = makeToolWithBundles([], "/synthea.jar");
    const datasets = await tool.generate({
      name: "patients",
      population: 0,
      seed: 1,
    });
    assert.strictEqual(datasets.length, 0);
  });
});

/**
 * Build FHIR bundles where each patient has a set of Condition resources
 * referencing them. Every resource gets its own `id` UUID — matching real
 * Synthea output, where Patient, Condition, Encounter, Observation, etc.
 * all carry independent resource IDs and link back via `subject.reference`.
 */
function makeFhirBundles(patientSpecs) {
  const bundles = [];
  let condCounter = 0;
  for (const spec of patientSpecs) {
    const entry = [{ resource: { resourceType: "Patient", id: spec.patient } }];
    for (const c of spec.conditions) {
      condCounter++;
      entry.push({
        resource: {
          resourceType: "Condition",
          id: `cond-${condCounter}`,
          code: {
            coding: [{ code: c.code, display: c.display }],
          },
          subject: { reference: `urn:uuid:${spec.patient}` },
        },
      });
    }
    bundles.push({ entry });
  }
  return bundles;
}

function makeToolWithBundles(bundles, syntheaJar) {
  const { fsFns, execFileFn } = syntheaDeps(bundles, syntheaJar);
  return new SyntheaTool({ logger, syntheaJar, execFileFn, fsFns });
}
