import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildFhirCrossRef,
  PATIENT_A,
  PATIENT_B,
  PATIENT_C,
  makePatient,
  makeCondition,
  makeClinical,
} from "./fhir-microdata-helpers.js";

describe("buildFhirCrossRef", () => {
  test("links patient to trial via condition match", () => {
    const patients = [makePatient(PATIENT_A, "Jones", "Alice")];
    const conditions = [
      makeCondition(PATIENT_A, "diabetes-t2", "Type 2 Diabetes"),
    ];
    const crossRef = buildFhirCrossRef({
      patients,
      conditions,
      clinical: makeClinical(),
      domain: "test.example",
    });

    const patientIri = `https://test.example/id/clinical/patient/${PATIENT_A}`;
    const trialIri = "https://test.example/id/clinical/trial/oncora-p3";
    assert.deepStrictEqual(
      [...(crossRef.patientToTrialIris.get(patientIri) ?? [])],
      [trialIri],
    );
    assert.deepStrictEqual(
      [...(crossRef.conditionIdToPatientIris.get("diabetes-t2") ?? [])],
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
      makeCondition(PATIENT_A, "diabetes-t2", "Type 2 Diabetes"),
      makeCondition(PATIENT_B, "diabetes-t2", "Type 2 Diabetes"),
      makeCondition(PATIENT_C, "diabetes-t2", "Type 2 Diabetes"),
    ];
    const crossRef = buildFhirCrossRef({
      patients,
      conditions,
      clinical: makeClinical(),
      domain: "test.example",
    });
    const trialIri = "https://test.example/id/clinical/trial/oncora-p3";
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
