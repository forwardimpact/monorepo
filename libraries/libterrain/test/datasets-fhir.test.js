import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildNodes } from "../src/nodes.js";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

function makeLogger() {
  return { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };
}

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
                coding: [{ code: "diabetes-t2", display: "Type 2 Diabetes" }],
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
      conditions: [{ id: "diabetes-t2", name: "Type 2 Diabetes" }],
      trials: [
        {
          id: "oncora-p3",
          conditions: ["diabetes-t2"],
          sites: ["cambridge"],
          iri: "https://test.example/id/clinical/trial/oncora-p3",
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
    assert.ok(crossRef.conditionIdToPatientIris.get("diabetes-t2"));
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
