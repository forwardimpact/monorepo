import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  renderFhirMicrodataHtml as _renderFhirMicrodataHtml,
  buildFhirCrossRef,
} from "../src/render/fhir-microdata.js";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

// Thread a real runtime (the renderer reads bundled templates via fsSync).
const _fhirRuntime = createDefaultRuntime();
const renderFhirMicrodataHtml = (input, config) =>
  _renderFhirMicrodataHtml(input, config, _fhirRuntime);

const PATIENT_A = "11111111-1111-4111-8111-111111111111";
const PATIENT_B = "22222222-2222-4222-8222-222222222222";
const PATIENT_C = "33333333-3333-4333-8333-333333333333";

function makePatient(id, family, given) {
  return {
    resourceType: "Patient",
    id,
    name: [{ use: "official", family, given: [given] }],
    gender: "female",
    birthDate: "1980-01-01",
  };
}

function makeCondition(patientId, code, display) {
  return {
    resourceType: "Condition",
    subject: { reference: `urn:uuid:${patientId}` },
    code: {
      coding: [{ system: "http://snomed.info/sct", code, display }],
      text: display,
    },
    onsetDateTime: "2020-01-01",
  };
}

function makeProcedure(patientId, code, display) {
  return {
    resourceType: "Procedure",
    subject: { reference: `Patient/${patientId}` },
    code: { coding: [{ code, display }] },
    performedDateTime: "2021-01-01",
  };
}

function makeMedRequest(patientId, code, display) {
  return {
    resourceType: "MedicationRequest",
    subject: { reference: `urn:uuid:${patientId}` },
    medicationCodeableConcept: { coding: [{ code, display }] },
    authoredOn: "2022-01-01",
  };
}

function makeClinical() {
  return {
    conditions: [
      {
        id: "diabetes_t2",
        name: "Type 2 Diabetes",
        iri: "https://test.example/id/clinical/condition/diabetes_t2",
      },
    ],
    trials: [
      {
        id: "oncora_p3",
        name: "ONCORA-301",
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
  };
}

describe("buildFhirCrossRef", () => {
  test("links patient to trial via condition match", () => {
    const patients = [makePatient(PATIENT_A, "Jones", "Alice")];
    const conditions = [
      makeCondition(PATIENT_A, "diabetes_t2", "Type 2 Diabetes"),
    ];
    const crossRef = buildFhirCrossRef({
      patients,
      conditions,
      clinical: makeClinical(),
      domain: "test.example",
    });

    const patientIri = `https://test.example/id/clinical/patient/${PATIENT_A}`;
    const trialIri = "https://test.example/id/clinical/trial/oncora_p3";
    assert.deepStrictEqual(
      [...(crossRef.patientToTrialIris.get(patientIri) ?? [])],
      [trialIri],
    );
    assert.deepStrictEqual(
      [...(crossRef.conditionIdToPatientIris.get("diabetes_t2") ?? [])],
      [patientIri],
    );
    assert.deepStrictEqual(
      [...(crossRef.siteIdToPatientIris.get("cambridge") ?? [])],
      [patientIri],
    );
    assert.deepStrictEqual(
      [...(crossRef.trialIriToPatientIris.get(trialIri) ?? [])],
      [patientIri],
    );
  });

  test("matches by display text normalization", () => {
    const patients = [makePatient(PATIENT_A, "Jones", "Alice")];
    const conditions = [makeCondition(PATIENT_A, "E11.9", "Type 2 Diabetes")];
    const clinical = {
      conditions: [{ id: "type_2_diabetes", name: "Type 2 Diabetes" }],
      trials: [],
      sites: [],
    };
    const crossRef = buildFhirCrossRef({
      patients,
      conditions,
      clinical,
      domain: "test.example",
    });
    const patientIri = `https://test.example/id/clinical/patient/${PATIENT_A}`;
    assert.deepStrictEqual(
      [...(crossRef.conditionIdToPatientIris.get("type_2_diabetes") ?? [])],
      [patientIri],
    );
  });

  test("returns empty maps when no conditions match", () => {
    const patients = [makePatient(PATIENT_A, "Jones", "Alice")];
    const conditions = [makeCondition(PATIENT_A, "unknown", "Other")];
    const crossRef = buildFhirCrossRef({
      patients,
      conditions,
      clinical: makeClinical(),
      domain: "test.example",
    });
    assert.strictEqual(crossRef.patientToTrialIris.size, 0);
    assert.strictEqual(crossRef.conditionIdToPatientIris.size, 0);
    assert.strictEqual(crossRef.siteIdToPatientIris.size, 0);
    assert.strictEqual(crossRef.trialIriToPatientIris.size, 0);
  });

  test("returned CrossRefIndex is frozen at the top level", () => {
    const crossRef = buildFhirCrossRef({
      patients: [makePatient(PATIENT_A, "Jones", "Alice")],
      conditions: [],
      clinical: makeClinical(),
      domain: "test.example",
    });
    assert.strictEqual(Object.isFrozen(crossRef), true);
    const before = crossRef.patientToTrialIris;
    try {
      crossRef.patientToTrialIris = new Map();
    } catch {
      /* strict mode throws; non-strict silently ignores — both produce no-op */
    }
    assert.strictEqual(crossRef.patientToTrialIris, before);
  });

  test("preserves insertion order across multiple patients", () => {
    const patients = [
      makePatient(PATIENT_A, "Jones", "Alice"),
      makePatient(PATIENT_B, "Smith", "Bob"),
      makePatient(PATIENT_C, "Chen", "Carol"),
    ];
    const conditions = [
      makeCondition(PATIENT_A, "diabetes_t2", "Type 2 Diabetes"),
      makeCondition(PATIENT_B, "diabetes_t2", "Type 2 Diabetes"),
      makeCondition(PATIENT_C, "diabetes_t2", "Type 2 Diabetes"),
    ];
    const crossRef = buildFhirCrossRef({
      patients,
      conditions,
      clinical: makeClinical(),
      domain: "test.example",
    });
    const trialIri = "https://test.example/id/clinical/trial/oncora_p3";
    assert.deepStrictEqual(
      [...crossRef.trialIriToPatientIris.get(trialIri)],
      [
        `https://test.example/id/clinical/patient/${PATIENT_A}`,
        `https://test.example/id/clinical/patient/${PATIENT_B}`,
        `https://test.example/id/clinical/patient/${PATIENT_C}`,
      ],
    );
  });
});

describe("renderFhirMicrodataHtml", () => {
  function basicInput() {
    const patients = [makePatient(PATIENT_A, "Jones", "Alice")];
    const conditions = [
      makeCondition(PATIENT_A, "diabetes_t2", "Type 2 Diabetes"),
    ];
    const procedures = [makeProcedure(PATIENT_A, "44608003", "Dialysis")];
    const medRequests = [makeMedRequest(PATIENT_A, "metformin", "Metformin")];
    const crossRef = buildFhirCrossRef({
      patients,
      conditions,
      clinical: makeClinical(),
      domain: "test.example",
    });
    return { patients, conditions, procedures, medRequests, crossRef };
  }

  test("file count equals patients.length + 1", () => {
    const patients = [
      makePatient(PATIENT_A, "Jones", "Alice"),
      makePatient(PATIENT_B, "Smith", "Bob"),
      makePatient(PATIENT_C, "Chen", "Carol"),
    ];
    const crossRef = buildFhirCrossRef({
      patients,
      conditions: [],
      clinical: makeClinical(),
      domain: "test.example",
    });
    const files = renderFhirMicrodataHtml(
      {
        patients,
        conditions: [],
        procedures: [],
        medRequests: [],
        crossRef,
        domain: "test.example",
      },
      { path: "data/patients" },
    );
    assert.strictEqual(files.size, 4);
    assert.ok(files.has(`data/patients/${PATIENT_A}.html`));
    assert.ok(files.has(`data/patients/${PATIENT_B}.html`));
    assert.ok(files.has(`data/patients/${PATIENT_C}.html`));
    assert.ok(files.has("data/patients/index.html"));
  });

  test("page emits IRI shape and Schema.org itemtypes", () => {
    const input = basicInput();
    const files = renderFhirMicrodataHtml(
      { ...input, domain: "test.example" },
      { path: "data/patients" },
    );
    const html = files.get(`data/patients/${PATIENT_A}.html`);
    assert.match(
      html,
      new RegExp(
        `itemid="https://test\\.example/id/clinical/patient/${PATIENT_A}"`,
      ),
    );
    assert.match(html, /itemtype="https:\/\/schema\.org\/Person"/);
    assert.match(html, /itemtype="https:\/\/schema\.org\/MedicalCondition"/);
    assert.match(html, /itemtype="https:\/\/schema\.org\/MedicalProcedure"/);
    assert.match(html, /itemtype="https:\/\/schema\.org\/DrugPrescription"/);
  });

  test("page has exactly one Person main item with the patient IRI", () => {
    const input = basicInput();
    const files = renderFhirMicrodataHtml(
      { ...input, domain: "test.example" },
      { path: "data/patients" },
    );
    const html = files.get(`data/patients/${PATIENT_A}.html`);
    // The libresource RDF assertions in libterrain cover full main-item
    // grouping; here we assert the Mustache output emits exactly one
    // `itemtype="https://schema.org/Person"` (the Patient main item) and
    // exactly one matching `itemid` attribute. Nested resource itemscopes
    // use different itemtypes and carry no itemid.
    const personMatches = html.match(
      /itemtype="https:\/\/schema\.org\/Person"/g,
    );
    assert.strictEqual(personMatches?.length, 1);
    const itemidMatches = html.match(/itemid=/g);
    assert.strictEqual(itemidMatches?.length, 1);
    assert.match(
      html,
      new RegExp(
        `itemid="https://test\\.example/id/clinical/patient/${PATIENT_A}"`,
      ),
    );
  });

  test("non-empty trialIriToPatientIris triggers enrolledIn link", () => {
    const input = basicInput();
    const files = renderFhirMicrodataHtml(
      { ...input, domain: "test.example" },
      { path: "data/patients" },
    );
    const html = files.get(`data/patients/${PATIENT_A}.html`);
    assert.match(
      html,
      /itemprop="https:\/\/www\.forwardimpact\.team\/schema\/rdf\/enrolledIn"/,
    );
    assert.match(
      html,
      /href="https:\/\/test\.example\/id\/clinical\/trial\/oncora_p3"/,
    );
  });

  test("throws on non-UUID patient.id", () => {
    const patients = [makePatient("not-a-uuid", "X", "Y")];
    const crossRef = buildFhirCrossRef({
      patients,
      conditions: [],
      clinical: makeClinical(),
      domain: "test.example",
    });
    assert.throws(
      () =>
        renderFhirMicrodataHtml(
          {
            patients,
            conditions: [],
            procedures: [],
            medRequests: [],
            crossRef,
            domain: "test.example",
          },
          { path: "data/patients" },
        ),
      /is not a UUID/,
    );
  });

  test("throws when config.path is missing or empty", () => {
    const input = basicInput();
    assert.throws(
      () =>
        renderFhirMicrodataHtml(
          { ...input, domain: "test.example" },
          { path: "" },
        ),
      /config\.path is required/,
    );
    assert.throws(
      () => renderFhirMicrodataHtml({ ...input, domain: "test.example" }, {}),
      /config\.path is required/,
    );
  });

  test("throws when input.patients is not an array", () => {
    const input = basicInput();
    assert.throws(
      () =>
        renderFhirMicrodataHtml(
          { ...input, patients: null, domain: "test.example" },
          { path: "data/patients" },
        ),
      /input\.patients must be an array/,
    );
  });

  test("throws when input.domain is missing or empty", () => {
    const input = basicInput();
    assert.throws(
      () =>
        renderFhirMicrodataHtml(
          { ...input, domain: "" },
          { path: "data/patients" },
        ),
      /input\.domain is required/,
    );
  });

  test("throws when input.crossRef is null", () => {
    const input = basicInput();
    assert.throws(
      () =>
        renderFhirMicrodataHtml(
          { ...input, crossRef: null, domain: "test.example" },
          { path: "data/patients" },
        ),
      /input\.crossRef is required/,
    );
  });

  test("itemprops on Patient → resource use absolute fit: URIs", () => {
    const input = basicInput();
    const files = renderFhirMicrodataHtml(
      { ...input, domain: "test.example" },
      { path: "data/patients" },
    );
    const html = files.get(`data/patients/${PATIENT_A}.html`);
    assert.match(
      html,
      /itemprop="https:\/\/www\.forwardimpact\.team\/schema\/rdf\/hasCondition"/,
    );
    assert.match(
      html,
      /itemprop="https:\/\/www\.forwardimpact\.team\/schema\/rdf\/hasProcedure"/,
    );
    assert.match(
      html,
      /itemprop="https:\/\/www\.forwardimpact\.team\/schema\/rdf\/hasMedicationRequest"/,
    );
  });
});
