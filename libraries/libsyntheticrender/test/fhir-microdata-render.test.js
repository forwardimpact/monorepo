import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  renderFhirMicrodataHtml,
  buildFhirCrossRef,
  PATIENT_A,
  PATIENT_B,
  PATIENT_C,
  makePatient,
  makeCondition,
  makeProcedure,
  makeMedRequest,
  makeClinical,
} from "./fhir-microdata-helpers.js";

describe("renderFhirMicrodataHtml", () => {
  function basicInput() {
    const patients = [makePatient(PATIENT_A, "Jones", "Alice")];
    const conditions = [
      makeCondition(PATIENT_A, "diabetes-t2", "Type 2 Diabetes"),
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
      /href="https:\/\/test\.example\/id\/clinical\/trial\/oncora-p3"/,
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
