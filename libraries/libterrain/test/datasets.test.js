import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildNodes } from "../src/nodes.js";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

function makeLogger() {
  return { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };
}

/**
 * Build a fake tool that records the config it was invoked with and produces
 * an empty result set. Lets tests assert on the `modules` that nodes.js
 * resolved before calling the tool.
 */
function makeRecordingFactory() {
  const calls = [];
  function factory() {
    return {
      checkAvailability: async () => true,
      generate: async (config) => {
        calls.push(config);
        return [];
      },
    };
  }
  return { factory, calls };
}

function runDatasetsNode(parse, { clinical, factory }) {
  const nodes = buildNodes({
    dslParser: null,
    entityGenerator: null,
    proseGenerator: null,
    pathwayGenerator: null,
    renderer: null,
    validator: null,
    proseCacheSink: { flush: () => {} },
    toolFactory: factory,
    logger: makeLogger(),
    runtime: createDefaultRuntime(),
    options: {},
  });
  return nodes.datasets.run({ parse: { ...parse, clinical } });
}

describe("datasets node — condition resolution", () => {
  test("resolves clinical conditions to Synthea modules", async () => {
    const { factory, calls } = makeRecordingFactory();
    const parse = {
      datasets: [
        {
          id: "trial_patients",
          tool: "synthea",
          config: { conditions: ["diabetes_t2", "lung_cancer"] },
        },
      ],
      outputs: [],
      seed: 42,
    };
    const clinical = {
      conditions: [
        { id: "diabetes_t2", synthea_module: "diabetes" },
        { id: "lung_cancer", synthea_module: "lung_cancer" },
      ],
    };

    await runDatasetsNode(parse, { clinical, factory });

    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0].modules, ["diabetes", "lung_cancer"]);
  });

  test("silently skips unknown condition refs", async () => {
    const { factory, calls } = makeRecordingFactory();
    const parse = {
      datasets: [
        {
          id: "trial_patients",
          tool: "synthea",
          config: { conditions: ["diabetes_t2", "unknown_condition"] },
        },
      ],
      outputs: [],
      seed: 42,
    };
    const clinical = {
      conditions: [{ id: "diabetes_t2", synthea_module: "diabetes" }],
    };

    await runDatasetsNode(parse, { clinical, factory });

    assert.deepStrictEqual(calls[0].modules, ["diabetes"]);
  });

  test("ignores conditions when no clinical block, leaves modules untouched", async () => {
    const { factory, calls } = makeRecordingFactory();
    const parse = {
      datasets: [
        {
          id: "trial_patients",
          tool: "synthea",
          config: {
            modules: ["hypertension"],
            conditions: ["lung_cancer"],
          },
        },
      ],
      outputs: [],
      seed: 42,
    };

    await runDatasetsNode(parse, { clinical: null, factory });

    assert.deepStrictEqual(calls[0].modules, ["hypertension"]);
    assert.deepStrictEqual(calls[0].conditions, ["lung_cancer"]);
  });

  test("leaves config.modules untouched when dataset has no conditions field", async () => {
    const { factory, calls } = makeRecordingFactory();
    const parse = {
      datasets: [
        {
          id: "trial_patients",
          tool: "synthea",
          config: { modules: ["diabetes"] },
        },
      ],
      outputs: [],
      seed: 42,
    };
    const clinical = {
      conditions: [{ id: "diabetes_t2", synthea_module: "diabetes" }],
    };

    await runDatasetsNode(parse, { clinical, factory });

    assert.deepStrictEqual(calls[0].modules, ["diabetes"]);
  });

  test("merges explicit modules with conditions-derived modules, deduped", async () => {
    const { factory, calls } = makeRecordingFactory();
    const ds = {
      id: "trial_patients",
      tool: "synthea",
      config: {
        modules: ["hypertension"],
        conditions: ["diabetes_t2", "hypertension_dsl"],
      },
    };
    const parse = { datasets: [ds], outputs: [], seed: 42 };
    const clinical = {
      conditions: [
        { id: "diabetes_t2", synthea_module: "diabetes" },
        // Both DSL conditions can resolve to the same Synthea module —
        // the merge dedupes so we don't load the same module twice.
        { id: "hypertension_dsl", synthea_module: "hypertension" },
      ],
    };

    await runDatasetsNode(parse, { clinical, factory });

    assert.deepStrictEqual(calls[0].modules, ["hypertension", "diabetes"]);
    // The parsed AST node must stay clean for any re-run of the stage.
    assert.deepStrictEqual(ds.config.modules, ["hypertension"]);
  });

  test("returns datasetsMap on the empty path when no datasets declared", async () => {
    const { factory } = makeRecordingFactory();
    const parse = { datasets: [], outputs: [], seed: 42 };

    const result = await runDatasetsNode(parse, { clinical: null, factory });

    assert.ok(result.datasetsMap instanceof Map, "datasetsMap is a Map");
    assert.strictEqual(result.datasetsMap.size, 0);
  });

  test("returns datasetsMap with generated datasets", async () => {
    function factoryWithDataset() {
      return {
        checkAvailability: async () => true,
        generate: async (config) => [
          { name: `${config.name}_patient`, records: [{ id: "p1" }] },
        ],
      };
    }
    const parse = {
      datasets: [{ id: "trial_patients", tool: "synthea", config: {} }],
      outputs: [],
      seed: 42,
    };

    const result = await runDatasetsNode(parse, {
      clinical: null,
      factory: factoryWithDataset,
    });

    assert.ok(result.datasetsMap.has("trial_patients_patient"));
  });

  test("skips fhir_microdata_html outputs without 'dataset not generated' log", async () => {
    const logs = [];
    const logger = {
      info: (cat, msg) => logs.push({ cat, msg }),
      debug: () => {},
      warn: () => {},
      error: () => {},
    };
    const { factory } = makeRecordingFactory();
    const parse = {
      datasets: [{ id: "trial_patients", tool: "synthea", config: {} }],
      outputs: [
        {
          dataset: "trial_patients",
          format: "fhir_microdata_html",
          config: {},
        },
      ],
      seed: 42,
    };
    const nodes = buildNodes({
      dslParser: null,
      entityGenerator: null,
      proseGenerator: null,
      pathwayGenerator: null,
      renderer: null,
      validator: null,
      proseCacheSink: { flush: () => {} },
      toolFactory: factory,
      logger,
      runtime: createDefaultRuntime(),
      options: {},
    });

    await nodes.datasets.run({ parse: { ...parse, clinical: null } });

    const skips = logs.filter((l) => l.msg?.includes("dataset not generated"));
    assert.strictEqual(skips.length, 0);
  });

  test("does not mutate parse.datasets[i].config", async () => {
    const { factory } = makeRecordingFactory();
    const ds = {
      id: "trial_patients",
      tool: "synthea",
      config: { conditions: ["diabetes_t2"] },
    };
    const parse = { datasets: [ds], outputs: [], seed: 42 };
    const clinical = {
      conditions: [{ id: "diabetes_t2", synthea_module: "diabetes" }],
    };

    await runDatasetsNode(parse, { clinical, factory });

    // Original AST node still only carries `conditions`; nothing wrote
    // `modules` onto it.
    assert.strictEqual(ds.config.modules, undefined);
    assert.deepStrictEqual(ds.config.conditions, ["diabetes_t2"]);
  });
});

const PATIENT_UUID = "11111111-1111-4111-8111-111111111111";

function makeFhirFactory() {
  return function fhirFactory() {
    return {
      checkAvailability: async () => true,
      generate: async (config) => [
        {
          name: `${config.name}_patient`,
          records: [
            {
              resourceType: "Patient",
              id: PATIENT_UUID,
              name: [{ use: "official", family: "Jones", given: ["Alice"] }],
            },
          ],
        },
        {
          name: `${config.name}_condition`,
          records: [
            {
              resourceType: "Condition",
              subject: { reference: `urn:uuid:${PATIENT_UUID}` },
              code: {
                coding: [{ code: "diabetes_t2", display: "Type 2 Diabetes" }],
                text: "Type 2 Diabetes",
              },
            },
          ],
        },
      ],
    };
  };
}

function makeClinicalEntities() {
  return {
    domain: "test.example",
    clinical: {
      conditions: [{ id: "diabetes_t2", name: "Type 2 Diabetes" }],
      trials: [
        {
          id: "oncora_p3",
          conditions: ["diabetes_t2"],
          sites: ["cambridge"],
          iri: "https://test.example/id/clinical/trial/oncora_p3",
        },
      ],
      sites: [
        {
          id: "cambridge",
          iri: "https://test.example/id/clinical/site/cambridge",
        },
      ],
    },
  };
}

async function runFhirNodes(parse, ctx = {}) {
  const nodes = buildNodes({
    dslParser: null,
    entityGenerator: null,
    proseGenerator: null,
    pathwayGenerator: null,
    renderer: null,
    validator: null,
    proseCacheSink: { flush: () => {} },
    toolFactory: ctx.factory ?? null,
    logger: ctx.logger ?? makeLogger(),
    runtime: createDefaultRuntime(),
    options: {},
  });
  const datasets = await nodes.datasets.run({
    parse: { ...parse, clinical: ctx.entities?.clinical ?? null },
  });
  const entities = ctx.entities ?? {};
  const crossRef = nodes["fhir-cross-ref"].run({ parse, entities, datasets });
  const microdata = nodes["fhir-microdata-html"].run({
    parse,
    entities,
    datasets,
    "fhir-cross-ref": crossRef,
  });
  return { datasets, crossRef, microdata };
}

describe("fhir-cross-ref node", () => {
  test("returns null when no output declares fhir_microdata_html", async () => {
    const parse = {
      datasets: [],
      outputs: [{ dataset: "ds", format: "json", config: { path: "x" } }],
      seed: 42,
    };
    const { crossRef } = await runFhirNodes(parse, {
      entities: makeClinicalEntities(),
    });
    assert.strictEqual(crossRef, null);
  });

  test("returns null when entities.clinical is missing even with wired output", async () => {
    const parse = {
      datasets: [],
      outputs: [
        {
          dataset: "patients",
          format: "fhir_microdata_html",
          config: { path: "p" },
        },
      ],
      seed: 42,
    };
    const { crossRef } = await runFhirNodes(parse, {
      entities: { domain: "test.example" },
    });
    assert.strictEqual(crossRef, null);
  });

  test("returns CrossRefIndex when both conditions hold", async () => {
    const parse = {
      datasets: [{ id: "patients", tool: "synthea", config: {} }],
      outputs: [
        {
          dataset: "patients",
          format: "fhir_microdata_html",
          config: { path: "data/patients" },
        },
      ],
      seed: 42,
      domain: "test.example",
    };
    const { crossRef } = await runFhirNodes(parse, {
      entities: makeClinicalEntities(),
      factory: makeFhirFactory(),
    });
    assert.ok(crossRef, "crossRef should be non-null");
    assert.ok(crossRef.conditionIdToPatientIris.get("diabetes_t2"));
  });
});

describe("fhir-microdata-html node", () => {
  test("emits per-patient HTML + index.html files when wired", async () => {
    const parse = {
      datasets: [{ id: "patients", tool: "synthea", config: {} }],
      outputs: [
        {
          dataset: "patients",
          format: "fhir_microdata_html",
          config: { path: "data/patients" },
        },
      ],
      seed: 42,
      domain: "test.example",
    };
    const { microdata } = await runFhirNodes(parse, {
      entities: makeClinicalEntities(),
      factory: makeFhirFactory(),
    });
    assert.ok(microdata.files.has(`data/patients/${PATIENT_UUID}.html`));
    assert.ok(microdata.files.has("data/patients/index.html"));
  });

  test("emits empty files Map when cross-ref is null", async () => {
    const parse = {
      datasets: [],
      outputs: [{ dataset: "ds", format: "json", config: { path: "x" } }],
      seed: 42,
    };
    const { microdata } = await runFhirNodes(parse, {
      entities: makeClinicalEntities(),
    });
    assert.strictEqual(microdata.files.size, 0);
  });
});
