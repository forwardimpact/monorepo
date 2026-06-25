import {
  renderFhirMicrodataHtml as _renderFhirMicrodataHtml,
  buildFhirCrossRef,
} from "../src/render/fhir-microdata.js";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

export { buildFhirCrossRef };

// Thread a real runtime (the renderer reads bundled templates via fsSync).
const _fhirRuntime = createDefaultRuntime();
export const renderFhirMicrodataHtml = (input, config) =>
  _renderFhirMicrodataHtml(input, config, _fhirRuntime);

export const PATIENT_A = "11111111-1111-4111-8111-111111111111";
export const PATIENT_B = "22222222-2222-4222-8222-222222222222";
export const PATIENT_C = "33333333-3333-4333-8333-333333333333";

/** Build a FHIR Patient resource. */
export function makePatient(id, family, given) {
  return {
    resourceType: "Patient",
    id,
    name: [{ use: "official", family, given: [given] }],
    gender: "female",
    birthDate: "1980-01-01",
  };
}

/** Build a FHIR Condition resource for a patient. */
export function makeCondition(patientId, code, display) {
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

/** Build a FHIR Procedure resource for a patient. */
export function makeProcedure(patientId, code, display) {
  return {
    resourceType: "Procedure",
    subject: { reference: `Patient/${patientId}` },
    code: { coding: [{ code, display }] },
    performedDateTime: "2021-01-01",
  };
}

/** Build a FHIR MedicationRequest resource for a patient. */
export function makeMedRequest(patientId, code, display) {
  return {
    resourceType: "MedicationRequest",
    subject: { reference: `urn:uuid:${patientId}` },
    medicationCodeableConcept: { coding: [{ code, display }] },
    authoredOn: "2022-01-01",
  };
}

/** Build a minimal clinical block with one condition, trial, and site. */
export function makeClinical() {
  return {
    conditions: [
      {
        id: "diabetes-t2",
        name: "Type 2 Diabetes",
        iri: "https://test.example/id/clinical/condition/diabetes-t2",
      },
    ],
    trials: [
      {
        id: "oncora-p3",
        name: "ONCORA-301",
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
  };
}
