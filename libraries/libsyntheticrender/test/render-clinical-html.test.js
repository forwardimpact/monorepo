import { describe, test } from "node:test";
import assert from "node:assert";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TemplateLoader } from "@forwardimpact/libtemplate/loader";
import { renderHTML } from "../src/render/html.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, "..", "templates");

function makeTemplates() {
  return new TemplateLoader(TEMPLATE_DIR);
}

function makeMinimalEntities(overrides = {}) {
  const base = {
    domain: "example.com",
    industry: "healthcare",
    orgs: [
      { id: "org1", name: "BioNova", iri: "https://example.com/id/org/org1" },
    ],
    departments: [],
    teams: [],
    people: [],
    projects: [],
    scenarios: [],
    snapshots: [],
    standard: {},
    content: [],
    activity: {},
  };
  return { ...base, ...overrides };
}

function makeClinicalFixture() {
  return {
    conditions: [
      {
        id: "diabetes_t2",
        name: "Type 2 Diabetes",
        icd10: ["E11"],
        synonyms: ["high blood sugar"],
        severity: "chronic",
        trials: ["oncora_p3"],
        iri: "https://example.com/id/clinical/condition/diabetes_t2",
      },
      {
        id: "lung_cancer",
        name: "Lung Cancer",
        icd10: ["C34"],
        synonyms: [],
        severity: "severe",
        trials: [],
        iri: "https://example.com/id/clinical/condition/lung_cancer",
      },
    ],
    sites: [
      {
        id: "cambridge",
        name: "Cambridge Center",
        address: "100 Main St",
        city: "Cambridge",
        state: "MA",
        country: "USA",
        specialties: ["oncology"],
        trials: ["oncora_p3"],
        iri: "https://example.com/id/clinical/site/cambridge",
      },
    ],
    trials: [
      {
        id: "oncora_p3",
        name: "ONCORA-301",
        protocol_id: "ONC-301",
        phase: "phase_3",
        therapeutic_area: "oncology",
        status: "recruiting",
        sponsor: "BioNova",
        conditions: ["diabetes_t2"],
        sites: ["cambridge"],
        iri: "https://example.com/id/clinical/trial/oncora_p3",
      },
    ],
    criteria: [
      {
        trial_id: "oncora_p3",
        inclusion: { age_min: 18, age_max: 75 },
        exclusion: {},
        iri: "https://example.com/id/clinical/criterion/oncora_p3",
      },
    ],
    researchers: [],
    content: {
      patient_stories: 2,
      patient_story_conditions: ["diabetes_t2"],
      therapy_topics: ["immunotherapy"],
    },
  };
}

describe("renderClinicalPages", () => {
  test("produces 7 clinical HTML files", () => {
    const entities = makeMinimalEntities({ clinical: makeClinicalFixture() });
    const { files } = renderHTML(entities, new Map(), makeTemplates());

    const clinicalFiles = [
      "condition-explainers.html",
      "therapy-descriptions.html",
      "trial-faqs.html",
      "consent-summaries.html",
      "site-descriptions.html",
      "patient-stories.html",
      "trial-cards.html",
    ];
    for (const name of clinicalFiles) {
      assert.ok(files.has(name), `expected ${name} in output`);
    }
  });

  test("Schema.org microdata uses correct itemtype URLs", () => {
    const entities = makeMinimalEntities({ clinical: makeClinicalFixture() });
    const { files } = renderHTML(entities, new Map(), makeTemplates());

    assert.match(
      files.get("condition-explainers.html"),
      /itemtype="https:\/\/schema\.org\/MedicalCondition"/,
    );
    assert.match(
      files.get("therapy-descriptions.html"),
      /itemtype="https:\/\/schema\.org\/MedicalTherapy"/,
    );
    assert.match(
      files.get("trial-faqs.html"),
      /itemtype="https:\/\/schema\.org\/MedicalTrial"/,
    );
    assert.match(
      files.get("consent-summaries.html"),
      /itemtype="https:\/\/schema\.org\/MedicalTrial"/,
    );
    assert.match(
      files.get("site-descriptions.html"),
      /itemtype="https:\/\/schema\.org\/MedicalClinic"/,
    );
    assert.match(
      files.get("patient-stories.html"),
      /itemtype="https:\/\/schema\.org\/MedicalCondition"/,
    );
    assert.match(
      files.get("trial-cards.html"),
      /itemtype="https:\/\/schema\.org\/MedicalTrial"/,
    );
  });

  test("data-enrich keys follow clinical_ prefix pattern", () => {
    const entities = makeMinimalEntities({ clinical: makeClinicalFixture() });
    const { files } = renderHTML(entities, new Map(), makeTemplates());

    assert.match(
      files.get("condition-explainers.html"),
      /data-enrich="clinical_condition_explainer_diabetes_t2"/,
    );
    assert.match(
      files.get("therapy-descriptions.html"),
      /data-enrich="clinical_therapy_description_immunotherapy"/,
    );
    assert.match(
      files.get("trial-faqs.html"),
      /data-enrich="clinical_trial_faq_oncora_p3"/,
    );
    assert.match(
      files.get("consent-summaries.html"),
      /data-enrich="clinical_consent_summary_oncora_p3"/,
    );
    assert.match(
      files.get("site-descriptions.html"),
      /data-enrich="clinical_site_description_cambridge"/,
    );
    assert.match(
      files.get("patient-stories.html"),
      /data-enrich="clinical_patient_story_diabetes_t2_0"/,
    );
  });

  test("empty prose cache falls back to placeholder strings", () => {
    const entities = makeMinimalEntities({ clinical: makeClinicalFixture() });
    const { files } = renderHTML(entities, new Map(), makeTemplates());

    assert.match(
      files.get("condition-explainers.html"),
      /Type 2 Diabetes — patient-facing overview\./,
    );
    assert.match(files.get("trial-faqs.html"), /FAQ for ONCORA-301\./);
  });

  test("populated prose cache replaces fallback in output", () => {
    const entities = makeMinimalEntities({ clinical: makeClinicalFixture() });
    const prose = new Map([
      [
        "clinical_condition_explainer_diabetes_t2",
        "Diabetes affects how your body uses sugar.",
      ],
      ["clinical_trial_faq_oncora_p3", "Common questions about ONCORA-301."],
    ]);
    const { files } = renderHTML(entities, prose, makeTemplates());

    assert.match(
      files.get("condition-explainers.html"),
      /Diabetes affects how your body uses sugar\./,
    );
    assert.match(
      files.get("trial-faqs.html"),
      /Common questions about ONCORA-301\./,
    );
  });

  test("trial-cards has no data-enrich attribute", () => {
    const entities = makeMinimalEntities({ clinical: makeClinicalFixture() });
    const { files } = renderHTML(entities, new Map(), makeTemplates());

    assert.doesNotMatch(files.get("trial-cards.html"), /data-enrich/);
  });

  test("no clinical block produces zero clinical files, leaves others unaffected", () => {
    const entities = makeMinimalEntities({ clinical: null });
    const { files } = renderHTML(entities, new Map(), makeTemplates());

    const clinicalFiles = [
      "condition-explainers.html",
      "therapy-descriptions.html",
      "trial-faqs.html",
      "consent-summaries.html",
      "site-descriptions.html",
      "patient-stories.html",
      "trial-cards.html",
    ];
    for (const name of clinicalFiles) {
      assert.ok(!files.has(name), `did not expect ${name} in output`);
    }
    // Existing structural pages still emit.
    assert.ok(files.has("organization-leadership.html"));
  });

  test("condition study link points to trial IRIs", () => {
    const entities = makeMinimalEntities({ clinical: makeClinicalFixture() });
    const { files } = renderHTML(entities, new Map(), makeTemplates());

    assert.match(
      files.get("condition-explainers.html"),
      /<link itemprop="study" href="https:\/\/example\.com\/id\/clinical\/trial\/oncora_p3"/,
    );
  });

  test("fhirCrossRef option: spec 1140 pages emit reverse patient links", () => {
    const entities = makeMinimalEntities({ clinical: makeClinicalFixture() });
    const patientIri = "https://example.com/id/clinical/patient/abc";
    const trialIri = "https://example.com/id/clinical/trial/oncora_p3";
    const fhirCrossRef = {
      patientToTrialIris: new Map([[patientIri, new Set([trialIri])]]),
      conditionIdToPatientIris: new Map([
        ["diabetes_t2", new Set([patientIri])],
      ]),
      siteIdToPatientIris: new Map([["cambridge", new Set([patientIri])]]),
      trialIriToPatientIris: new Map([[trialIri, new Set([patientIri])]]),
    };
    const { files } = renderHTML(entities, new Map(), makeTemplates(), {
      fhirCrossRef,
    });
    assert.match(
      files.get("trial-cards.html"),
      /itemprop="https:\/\/www\.forwardimpact\.team\/schema\/rdf\/enrolledPatient"/,
    );
    assert.match(
      files.get("condition-explainers.html"),
      /itemprop="https:\/\/www\.forwardimpact\.team\/schema\/rdf\/affectedPatient"/,
    );
    assert.match(
      files.get("site-descriptions.html"),
      /itemprop="https:\/\/www\.forwardimpact\.team\/schema\/rdf\/servedPatient"/,
    );
  });

  test("no fhirCrossRef option: spec 1190 reverse-link strings absent (criterion 7)", () => {
    const entities = makeMinimalEntities({ clinical: makeClinicalFixture() });
    const { files } = renderHTML(entities, new Map(), makeTemplates());

    for (const page of [
      "trial-cards.html",
      "condition-explainers.html",
      "site-descriptions.html",
    ]) {
      const out = files.get(page);
      assert.strictEqual(
        out.includes("enrolledPatient"),
        false,
        `${page} unexpectedly contains 'enrolledPatient'`,
      );
      assert.strictEqual(
        out.includes("affectedPatient"),
        false,
        `${page} unexpectedly contains 'affectedPatient'`,
      );
      assert.strictEqual(
        out.includes("servedPatient"),
        false,
        `${page} unexpectedly contains 'servedPatient'`,
      );
    }
  });

  test("site availableService link includes only recruiting trials", () => {
    const clinical = makeClinicalFixture();
    clinical.trials.push({
      id: "completed_trial",
      name: "Completed Trial",
      protocol_id: "X",
      phase: "phase_2",
      therapeutic_area: "oncology",
      status: "completed",
      sponsor: "BioNova",
      conditions: [],
      sites: ["cambridge"],
      iri: "https://example.com/id/clinical/trial/completed_trial",
    });
    clinical.sites[0].trials.push("completed_trial");

    const entities = makeMinimalEntities({ clinical });
    const { files } = renderHTML(entities, new Map(), makeTemplates());

    const siteHtml = files.get("site-descriptions.html");
    assert.match(
      siteHtml,
      /<link itemprop="availableService" href="https:\/\/example\.com\/id\/clinical\/trial\/oncora_p3"/,
    );
    assert.doesNotMatch(
      siteHtml,
      /availableService" href="https:\/\/example\.com\/id\/clinical\/trial\/completed_trial"/,
    );
  });
});
