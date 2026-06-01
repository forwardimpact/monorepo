/**
 * FHIR microdata HTML renderer — emits one `Person` main-item HTML file per
 * Synthea-generated Patient (with inline `MedicalCondition` /
 * `MedicalProcedure` / `DrugPrescription` items) plus a single `index.html`.
 *
 * Pure module: no filesystem I/O, no logger. Pipeline wiring lives in
 * `libterrain/src/nodes.js`. Vocabulary splits across the Schema.org and
 * fit: namespaces.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TemplateLoader } from "@forwardimpact/libtemplate/loader";
import { normalizePatientRef } from "@forwardimpact/libsyntheticgen/tools/synthea";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, "..", "..", "templates");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PRED = {
  hasCondition: "https://www.forwardimpact.team/schema/rdf/hasCondition",
  hasProcedure: "https://www.forwardimpact.team/schema/rdf/hasProcedure",
  hasMedicationRequest:
    "https://www.forwardimpact.team/schema/rdf/hasMedicationRequest",
  enrolledIn: "https://www.forwardimpact.team/schema/rdf/enrolledIn",
};

/**
 * @typedef {object} CrossRefIndex
 * @property {Map<string, Set<string>>} patientToTrialIris
 * @property {Map<string, Set<string>>} conditionIdToPatientIris
 * @property {Map<string, Set<string>>} siteIdToPatientIris
 * @property {Map<string, Set<string>>} trialIriToPatientIris
 *
 * Immutability contract: the returned object is frozen with
 * `Object.freeze`. The inner Maps and Sets are not frozen (JS provides no
 * shallow path), so consumers must read-only — never `.set`/`.add` into
 * them. `skeleton` and `fhir-microdata-html` both consume the same
 * instance per pipeline run.
 */

/**
 * Normalize a Condition.code.display to the DSL `clinical.conditions[].id`
 * shape: lowercase, whitespace replaced by underscore. Mirrors
 * `filterByConditions` in synthea.js so matching stays consistent.
 */
function normalizeConditionDisplay(display) {
  if (!display) return "";
  return display.toLowerCase().replace(/\s+/g, "_");
}

function addToSetMap(map, key, value) {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(value);
}

function indexTrialsByCondition(trials) {
  const trialsByConditionId = new Map();
  for (const trial of trials) {
    for (const condId of trial.conditions || []) {
      if (!trialsByConditionId.has(condId)) {
        trialsByConditionId.set(condId, []);
      }
      trialsByConditionId.get(condId).push(trial);
    }
  }
  return trialsByConditionId;
}

function matchDslConditionIds(condition, dslConditionIds) {
  const matched = new Set();
  for (const coding of condition.code?.coding || []) {
    if (coding.code && dslConditionIds.has(coding.code)) {
      matched.add(coding.code);
    }
  }
  const displayNorm = normalizeConditionDisplay(condition.code?.text);
  if (displayNorm && dslConditionIds.has(displayNorm)) {
    matched.add(displayNorm);
  }
  return matched;
}

function recordTrialMatch(maps, patientIri, trial) {
  addToSetMap(maps.patientToTrialIris, patientIri, trial.iri);
  for (const siteId of trial.sites || []) {
    addToSetMap(maps.siteIdToPatientIris, siteId, patientIri);
  }
}

function invertPatientToTrials(patientToTrialIris) {
  const trialIriToPatientIris = new Map();
  for (const [patientIri, trialIris] of patientToTrialIris) {
    for (const trialIri of trialIris) {
      addToSetMap(trialIriToPatientIris, trialIri, patientIri);
    }
  }
  return trialIriToPatientIris;
}

/**
 * Build the cross-ref index linking FHIR Patient records to DSL-declared
 * trials, conditions, and sites. Pure function.
 *
 * @param {{ patients: object[], conditions: object[], clinical: object, domain: string }} args
 * @returns {CrossRefIndex}
 */
export function buildFhirCrossRef({ patients, conditions, clinical, domain }) {
  const maps = {
    patientToTrialIris: new Map(),
    conditionIdToPatientIris: new Map(),
    siteIdToPatientIris: new Map(),
  };
  const dslConditionIds = new Set(
    (clinical?.conditions || []).map((c) => c.id),
  );
  const trialsByConditionId = indexTrialsByCondition(clinical?.trials || []);
  const patientIriById = new Map(
    patients.map((p) => [
      p.id,
      `https://${domain}/id/clinical/patient/${p.id}`,
    ]),
  );

  for (const condition of conditions) {
    const patientId = normalizePatientRef(condition.subject?.reference);
    const patientIri = patientId && patientIriById.get(patientId);
    if (!patientIri) continue;

    for (const dslId of matchDslConditionIds(condition, dslConditionIds)) {
      addToSetMap(maps.conditionIdToPatientIris, dslId, patientIri);
      for (const trial of trialsByConditionId.get(dslId) || []) {
        recordTrialMatch(maps, patientIri, trial);
      }
    }
  }

  return Object.freeze({
    ...maps,
    trialIriToPatientIris: invertPatientToTrials(maps.patientToTrialIris),
  });
}

function pickName(name) {
  if (!Array.isArray(name) || name.length === 0) return "Unknown";
  const official = name.find((n) => n.use === "official") || name[0];
  const given = (official.given || []).join(" ");
  return [given, official.family].filter(Boolean).join(" ") || "Unknown";
}

function pickCodingDisplay(code) {
  if (!code) return "";
  const coding = (code.coding || [])[0];
  return coding?.display || code.text || "";
}

function pickResourceCode(code) {
  if (!code) return "";
  const coding = (code.coding || [])[0];
  return coding?.code || "";
}

function buildConditionItems(records, patientId) {
  return records
    .filter((r) => normalizePatientRef(r.subject?.reference) === patientId)
    .map((r) => ({
      name: pickCodingDisplay(r.code),
      code: pickResourceCode(r.code),
      onset: r.onsetDateTime || "",
    }));
}

function buildProcedureItems(records, patientId) {
  return records
    .filter((r) => normalizePatientRef(r.subject?.reference) === patientId)
    .map((r) => ({
      name: pickCodingDisplay(r.code),
      code: pickResourceCode(r.code),
      performed: r.performedDateTime || r.performedPeriod?.start || "",
    }));
}

function buildMedicationItems(records, patientId) {
  return records
    .filter((r) => normalizePatientRef(r.subject?.reference) === patientId)
    .map((r) => ({
      name: pickCodingDisplay(r.medicationCodeableConcept),
      code: pickResourceCode(r.medicationCodeableConcept),
      authored: r.authoredOn || "",
    }));
}

function summarizeConditions(items) {
  const names = items.map((c) => c.name).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} (+${names.length - 3} more)`;
}

/** Guard the boundary contract for `renderFhirMicrodataHtml`. */
function validateFhirInput(input, config) {
  if (!config || typeof config.path !== "string" || config.path.length === 0) {
    throw new Error("renderFhirMicrodataHtml: config.path is required");
  }
  if (!input || typeof input !== "object") {
    throw new Error("renderFhirMicrodataHtml: input is required");
  }
  if (!Array.isArray(input.patients)) {
    throw new Error("renderFhirMicrodataHtml: input.patients must be an array");
  }
  if (typeof input.domain !== "string" || input.domain.length === 0) {
    throw new Error("renderFhirMicrodataHtml: input.domain is required");
  }
  if (!input.crossRef || typeof input.crossRef !== "object") {
    throw new Error("renderFhirMicrodataHtml: input.crossRef is required");
  }
}

/**
 * Render one HTML file per FHIR Patient plus an `index.html` aggregator.
 *
 * @param {object} input
 * @param {object[]} input.patients - FHIR Patient records (`dataset.records`)
 * @param {object[]} input.conditions - FHIR Condition records
 * @param {object[]} input.procedures - FHIR Procedure records
 * @param {object[]} input.medRequests - FHIR MedicationRequest records
 * @param {CrossRefIndex} input.crossRef - Non-null cross-ref index
 * @param {string} input.domain - Domain for patient IRIs
 * @param {object} config
 * @param {string} config.path - Output directory (required, non-empty)
 * @returns {Map<string, string>}
 */
export function renderFhirMicrodataHtml(input, config, runtime) {
  validateFhirInput(input, config);
  const templates = new TemplateLoader(TEMPLATE_DIR, runtime);
  const { patients, conditions, procedures, medRequests, crossRef, domain } =
    input;

  const files = new Map();
  const indexEntries = [];

  for (const patient of patients) {
    if (!patient.id || !UUID_RE.test(patient.id)) {
      throw new Error(
        `renderFhirMicrodataHtml: patient.id '${patient.id}' is not a UUID`,
      );
    }
    const patientId = patient.id;
    const patientIri = `https://${domain}/id/clinical/patient/${patientId}`;
    const name = pickName(patient.name);
    const conditionItems = buildConditionItems(conditions, patientId);
    const procedureItems = buildProcedureItems(procedures, patientId);
    const medicationItems = buildMedicationItems(medRequests, patientId);
    const trialLinks = [
      ...(crossRef.patientToTrialIris.get(patientIri) ?? []),
    ].map((iri) => ({ iri }));

    const html = templates.render("fhir-patient.html", {
      patientIri,
      name,
      gender: patient.gender || "",
      birthDate: patient.birthDate || "",
      hasCondition: PRED.hasCondition,
      hasProcedure: PRED.hasProcedure,
      hasMedicationRequest: PRED.hasMedicationRequest,
      enrolledIn: PRED.enrolledIn,
      conditions: conditionItems,
      procedures: procedureItems,
      medications: medicationItems,
      trialLinks,
    });

    files.set(`${config.path}/${patientId}.html`, html);
    indexEntries.push({
      patientHtmlPath: `${patientId}.html`,
      patientIri,
      name,
      conditionSummary: summarizeConditions(conditionItems),
    });
  }

  const indexHtml = templates.render("fhir-patient-index.html", {
    patients: indexEntries,
    count: indexEntries.length,
  });
  files.set(`${config.path}/index.html`, indexHtml);

  return files;
}
