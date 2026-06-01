import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { JSDOM } from "jsdom";
import {
  createDslParser,
  createEntityGenerator,
} from "@forwardimpact/libsyntheticgen";
import { Renderer, ContentValidator } from "@forwardimpact/libsyntheticrender";
import {
  ProseCache,
  ProseGenerator,
  PathwayGenerator,
} from "@forwardimpact/libsyntheticprose";
import { TemplateLoader } from "@forwardimpact/libtemplate/loader";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { Parser } from "@forwardimpact/libresource/parser.js";
import { Skolemizer } from "@forwardimpact/libresource/skolemizer.js";
import { Pipeline } from "../src/pipeline.js";
import { NullProseCacheSink } from "../src/sinks.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "fixtures", "fhir.dsl");
const TEMPLATE_DIR = join(
  __dirname,
  "..",
  "..",
  "libsyntheticrender",
  "templates",
);
const PATIENT_UUID = "44444444-4444-4444-8444-444444444444";
const PATIENT_IRI = `https://test.example/id/clinical/patient/${PATIENT_UUID}`;
const TRIAL_IRI = "https://test.example/id/clinical/trial/oncora_p3";
const CONDITION_IRI = "https://test.example/id/clinical/condition/diabetes_t2";
const SITE_IRI = "https://test.example/id/clinical/site/cambridge";

const PRED = {
  rdfType: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
  Person: "https://schema.org/Person",
  hasCondition: "https://www.forwardimpact.team/schema/rdf/hasCondition",
  hasProcedure: "https://www.forwardimpact.team/schema/rdf/hasProcedure",
  hasMedicationRequest:
    "https://www.forwardimpact.team/schema/rdf/hasMedicationRequest",
  enrolledIn: "https://www.forwardimpact.team/schema/rdf/enrolledIn",
  enrolledPatient: "https://www.forwardimpact.team/schema/rdf/enrolledPatient",
  affectedPatient: "https://www.forwardimpact.team/schema/rdf/affectedPatient",
  servedPatient: "https://www.forwardimpact.team/schema/rdf/servedPatient",
};

function makeLogger() {
  return { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };
}

function makeFhirToolFactory() {
  return function () {
    return {
      checkAvailability: async () => true,
      generate: async (config) => [
        {
          name: `${config.name}_patient`,
          records: [
            {
              resourceType: "Patient",
              id: PATIENT_UUID,
              name: [{ use: "official", family: "Doe", given: ["Jane"] }],
              gender: "female",
              birthDate: "1980-01-01",
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
              onsetDateTime: "2020-01-01",
            },
          ],
        },
        {
          name: `${config.name}_procedure`,
          records: [
            {
              resourceType: "Procedure",
              subject: { reference: `Patient/${PATIENT_UUID}` },
              code: { coding: [{ code: "44608003", display: "Dialysis" }] },
              performedDateTime: "2021-01-01",
            },
          ],
        },
        {
          name: `${config.name}_medicationrequest`,
          records: [
            {
              resourceType: "MedicationRequest",
              subject: { reference: `urn:uuid:${PATIENT_UUID}` },
              medicationCodeableConcept: {
                coding: [{ code: "metformin", display: "Metformin" }],
              },
              authoredOn: "2022-01-01",
            },
          ],
        },
      ],
    };
  };
}

function makePipeline() {
  const tmpDir = mkdtempSync(join(tmpdir(), "fhir-rdf-"));
  const logger = makeLogger();
  const runtime = createDefaultRuntime();
  const proseCache = new ProseCache({
    runtime,
    cachePath: join(tmpDir, "cache.json"),
    logger,
  });
  const proseGenerator = new ProseGenerator({
    runtime,
    cache: proseCache,
    mode: "no-prose",
    promptLoader: { load: () => "system", render: () => "user" },
    logger,
  });
  const deps = {
    dslParser: createDslParser(),
    entityGenerator: createEntityGenerator(logger, runtime),
    proseCache,
    proseGenerator,
    pathwayGenerator: new PathwayGenerator(proseGenerator, logger),
    renderer: new Renderer(
      new TemplateLoader(TEMPLATE_DIR, createDefaultRuntime()),
      logger,
      runtime,
    ),
    validator: new ContentValidator(logger),
    proseCacheSink: new NullProseCacheSink(),
    toolFactory: makeFhirToolFactory(),
    runtime,
    logger,
  };
  return { tmpDir, pipeline: new Pipeline(deps) };
}

async function parseFile(parser, content, baseIri) {
  const dom = new JSDOM(content);
  return parser.parseHTML(dom, baseIri);
}

function hasQuad(items, { subject, predicate, object }) {
  for (const item of items) {
    for (const q of item.quads) {
      if (
        q.subject.value === subject &&
        q.predicate.value === predicate &&
        q.object.value === object
      ) {
        return true;
      }
    }
  }
  return false;
}

describe("FHIR microdata HTML → libresource RDF", () => {
  test("emits Person main item and Patient → resource quads per spec criteria 2–6", async () => {
    const { tmpDir, pipeline } = makePipeline();
    try {
      const result = await pipeline.run({
        storyPath: FIXTURE,
        terminal: "write",
      });
      const parser = new Parser(new Skolemizer(), makeLogger());

      const patientHtml = result.files.get(
        `data/patients/${PATIENT_UUID}.html`,
      );
      assert.ok(patientHtml, "expected per-patient HTML in write output");
      const patientItems = await parseFile(
        parser,
        patientHtml,
        "https://test.example/",
      );

      // Criterion 2: exactly one Person main item whose IRI matches the
      // patient pattern. Nested inline MedicalCondition/Procedure/
      // DrugPrescription items also surface via libresource's
      // allowed-prefix grouping (skolemized blank-node IRIs); the spec's
      // "exactly one main item" is about the Person/IRI uniqueness.
      const personItems = patientItems.filter((item) =>
        item.quads.some(
          (q) =>
            q.subject.value === item.iri &&
            q.predicate.value === PRED.rdfType &&
            q.object.value === PRED.Person,
        ),
      );
      assert.strictEqual(
        personItems.length,
        1,
        `expected 1 Person main item, got ${personItems.length}`,
      );
      assert.strictEqual(personItems[0].iri, PATIENT_IRI);
      assert.ok(
        hasQuad(patientItems, {
          subject: PATIENT_IRI,
          predicate: PRED.rdfType,
          object: PRED.Person,
        }),
        "patient page missing Person rdf:type quad",
      );

      // Criterion 3: Patient → inline resource predicates fire.
      for (const pred of [
        PRED.hasCondition,
        PRED.hasProcedure,
        PRED.hasMedicationRequest,
      ]) {
        const found = patientItems[0].quads.some(
          (q) => q.subject.value === PATIENT_IRI && q.predicate.value === pred,
        );
        assert.ok(found, `patient page missing ${pred} quad`);
      }

      // Criterion 4: patient → trial quad.
      assert.ok(
        hasQuad(patientItems, {
          subject: PATIENT_IRI,
          predicate: PRED.enrolledIn,
          object: TRIAL_IRI,
        }),
        "patient page missing enrolledIn → trial quad",
      );

      // Criterion 5: trial-card / condition / site reverse links.
      const trialHtml = result.files.get("data/knowledge/trial-cards.html");
      const trialItems = await parseFile(
        parser,
        trialHtml,
        "https://test.example/",
      );
      assert.ok(
        hasQuad(trialItems, {
          subject: TRIAL_IRI,
          predicate: PRED.enrolledPatient,
          object: PATIENT_IRI,
        }),
        "trial-card missing enrolledPatient → patient quad",
      );

      const conditionHtml = result.files.get(
        "data/knowledge/condition-explainers.html",
      );
      const conditionItems = await parseFile(
        parser,
        conditionHtml,
        "https://test.example/",
      );
      assert.ok(
        hasQuad(conditionItems, {
          subject: CONDITION_IRI,
          predicate: PRED.affectedPatient,
          object: PATIENT_IRI,
        }),
        "condition-explainer missing affectedPatient → patient quad",
      );

      const siteHtml = result.files.get(
        "data/knowledge/site-descriptions.html",
      );
      const siteItems = await parseFile(
        parser,
        siteHtml,
        "https://test.example/",
      );
      assert.ok(
        hasQuad(siteItems, {
          subject: SITE_IRI,
          predicate: PRED.servedPatient,
          object: PATIENT_IRI,
        }),
        "site-description missing servedPatient → patient quad",
      );

      // Criterion 6: both directions of patient↔trial present in combined graph.
      const allItems = [...patientItems, ...trialItems];
      assert.ok(
        hasQuad(allItems, {
          subject: PATIENT_IRI,
          predicate: PRED.enrolledIn,
          object: TRIAL_IRI,
        }),
        "combined graph missing patient → trial quad",
      );
      assert.ok(
        hasQuad(allItems, {
          subject: TRIAL_IRI,
          predicate: PRED.enrolledPatient,
          object: PATIENT_IRI,
        }),
        "combined graph missing trial → patient quad",
      );
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });
});
