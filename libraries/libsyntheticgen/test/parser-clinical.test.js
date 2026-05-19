import { describe, test } from "node:test";
import assert from "node:assert";
import { tokenize } from "../src/dsl/tokenizer.js";
import { parse } from "../src/dsl/parser.js";
import { assertThrowsMessage } from "@forwardimpact/libharness";

function parseDsl(source) {
  return parse(tokenize(source));
}

describe("clinical block", () => {
  test("parses minimal clinical block", () => {
    const ast = parseDsl(`terrain test {
      clinical {
        condition c1 {
          name "Condition One"
          icd10 ["C01"]
          synonyms ["cond one"]
          synthea_module "module_c1"
          severity "mild"
        }
        site s1 {
          name "Site One"
          address "123 Main St"
          city "Boston"
          state "MA"
          country "US"
          org hq
          capacity 100
          specialties [oncology]
        }
        trial t1 {
          name "Trial One"
          protocol_id "T-001"
          phase "phase_1"
          therapeutic_area "oncology"
          conditions [c1]
          sites [s1]
          principal_investigator @doc1
          sponsor "Sponsor Inc"
          status "recruiting"
          target_enrollment 100
          current_enrollment 50
          start_date 2024-01
          estimated_end_date 2025-12
          arms ["arm A", "arm B"]
          criteria {
            inclusion {
              age_min 18
              age_max 65
            }
            exclusion {
              conditions_excluded [c2]
            }
          }
        }
      }
    }`);

    assert.strictEqual(ast.clinical.conditions.length, 1);
    assert.strictEqual(ast.clinical.sites.length, 1);
    assert.strictEqual(ast.clinical.trials.length, 1);
    assert.strictEqual(ast.clinical.content, null);

    const cond = ast.clinical.conditions[0];
    assert.strictEqual(cond.id, "c1");
    assert.strictEqual(cond.name, "Condition One");
    assert.deepStrictEqual(cond.icd10, ["C01"]);
    assert.deepStrictEqual(cond.synonyms, ["cond one"]);
    assert.strictEqual(cond.synthea_module, "module_c1");
    assert.strictEqual(cond.severity, "mild");

    const site = ast.clinical.sites[0];
    assert.strictEqual(site.id, "s1");
    assert.strictEqual(site.name, "Site One");
    assert.strictEqual(site.address, "123 Main St");
    assert.strictEqual(site.city, "Boston");
    assert.strictEqual(site.state, "MA");
    assert.strictEqual(site.country, "US");
    assert.strictEqual(site.org_ref, "hq");
    assert.strictEqual(site.capacity, 100);
    assert.deepStrictEqual(site.specialties, ["oncology"]);

    const trial = ast.clinical.trials[0];
    assert.strictEqual(trial.id, "t1");
    assert.strictEqual(trial.name, "Trial One");
    assert.strictEqual(trial.protocol_id, "T-001");
    assert.strictEqual(trial.phase, "phase_1");
    assert.strictEqual(trial.therapeutic_area, "oncology");
    assert.deepStrictEqual(trial.conditions, ["c1"]);
    assert.deepStrictEqual(trial.sites, ["s1"]);
    assert.strictEqual(trial.principal_investigator, "doc1");
    assert.strictEqual(trial.sponsor, "Sponsor Inc");
    assert.strictEqual(trial.status, "recruiting");
    assert.strictEqual(trial.target_enrollment, 100);
    assert.strictEqual(trial.current_enrollment, 50);
    assert.strictEqual(trial.start_date, "2024-01");
    assert.strictEqual(trial.estimated_end_date, "2025-12");
    assert.deepStrictEqual(trial.arms, ["arm A", "arm B"]);
    assert.deepStrictEqual(trial.criteria.inclusion, {
      age_min: 18,
      age_max: 65,
    });
    assert.deepStrictEqual(trial.criteria.exclusion, {
      conditions_excluded: ["c2"],
    });
  });

  test("parses full clinical block with content", () => {
    const ast = parseDsl(`terrain test {
      clinical {
        condition diabetes_t2 {
          name "Type 2 Diabetes"
          icd10 ["E11"]
          synonyms ["high blood sugar", "insulin resistance"]
          synthea_module "diabetes"
          severity "chronic"
          prose_topic "diabetes for patients"
          prose_tone "empathetic"
        }
        condition cardiovascular {
          name "Cardiovascular Disease"
          icd10 ["I25", "I50"]
          synonyms ["heart disease"]
          synthea_module "cardiovascular"
          severity "chronic"
        }
        site cambridge {
          name "Cambridge Center"
          address "200 Park Dr"
          city "Cambridge"
          state "MA"
          country "US"
          org headquarters
          capacity 500
          specialties [oncology, cardiology]
        }
        site boston {
          name "Boston Unit"
          address "75 Francis St"
          city "Boston"
          state "MA"
          country "US"
          org headquarters
          capacity 200
          specialties [neurology]
        }
        trial oncora_p3 {
          name "ONCORA-301"
          protocol_id "BNV-ONC-2024-301"
          project oncora
          phase "phase_3"
          therapeutic_area "oncology"
          conditions [diabetes_t2, cardiovascular]
          sites [cambridge, boston]
          principal_investigator @thoth
          sponsor "BioNova"
          status "recruiting"
          target_enrollment 450
          current_enrollment 287
          start_date 2024-06
          estimated_end_date 2026-06
          arms ["mAb + SoC", "placebo + SoC"]
          prose_topic "Phase 3 trial"
          prose_tone "clinical, accessible"
          criteria {
            inclusion {
              age_min 18
              age_max 75
              conditions_required [diabetes_t2]
              prior_treatments_allowed ["chemotherapy", "radiation"]
              ecog_max 2
              custom ["Measurable disease per RECIST 1.1"]
            }
            exclusion {
              conditions_excluded [cardiovascular]
              active_autoimmune true
              prior_immunotherapy true
              custom ["Known brain metastases"]
            }
          }
        }
        content {
          condition_explainers per_condition
          therapy_descriptions 6
          therapy_topics [mab_therapy, immunotherapy]
          trial_faqs per_trial
          consent_summaries per_trial
          site_descriptions per_site
          patient_stories 10
          patient_story_conditions [diabetes_t2, cardiovascular]
        }
      }
    }`);

    assert.strictEqual(ast.clinical.conditions.length, 2);
    assert.strictEqual(ast.clinical.sites.length, 2);
    assert.strictEqual(ast.clinical.trials.length, 1);

    const cond0 = ast.clinical.conditions[0];
    assert.strictEqual(cond0.id, "diabetes_t2");
    assert.strictEqual(cond0.prose_topic, "diabetes for patients");
    assert.strictEqual(cond0.prose_tone, "empathetic");

    const cond1 = ast.clinical.conditions[1];
    assert.strictEqual(cond1.id, "cardiovascular");
    assert.deepStrictEqual(cond1.icd10, ["I25", "I50"]);

    const trial = ast.clinical.trials[0];
    assert.strictEqual(trial.project_ref, "oncora");
    assert.strictEqual(trial.principal_investigator, "thoth");
    assert.strictEqual(trial.prose_topic, "Phase 3 trial");
    assert.deepStrictEqual(trial.criteria.inclusion.conditions_required, [
      "diabetes_t2",
    ]);
    assert.deepStrictEqual(trial.criteria.inclusion.prior_treatments_allowed, [
      "chemotherapy",
      "radiation",
    ]);
    assert.strictEqual(trial.criteria.inclusion.ecog_max, 2);
    assert.deepStrictEqual(trial.criteria.inclusion.custom, [
      "Measurable disease per RECIST 1.1",
    ]);
    assert.strictEqual(trial.criteria.exclusion.active_autoimmune, true);
    assert.strictEqual(trial.criteria.exclusion.prior_immunotherapy, true);
    assert.deepStrictEqual(trial.criteria.exclusion.custom, [
      "Known brain metastases",
    ]);

    const content = ast.clinical.content;
    assert.ok(content);
    assert.strictEqual(content.condition_explainers, "per_condition");
    assert.strictEqual(content.therapy_descriptions, 6);
    assert.deepStrictEqual(content.therapy_topics, [
      "mab_therapy",
      "immunotherapy",
    ]);
    assert.strictEqual(content.trial_faqs, "per_trial");
    assert.strictEqual(content.consent_summaries, "per_trial");
    assert.strictEqual(content.site_descriptions, "per_site");
    assert.strictEqual(content.patient_stories, 10);
    assert.deepStrictEqual(content.patient_story_conditions, [
      "diabetes_t2",
      "cardiovascular",
    ]);
  });

  test("per_* sentinels parse as strings, not numbers", () => {
    const ast = parseDsl(`terrain test {
      clinical {
        content {
          condition_explainers per_condition
          therapy_descriptions 3
          trial_faqs per_trial
          consent_summaries per_trial
          site_descriptions per_site
          patient_stories 5
        }
      }
    }`);
    const c = ast.clinical.content;
    assert.strictEqual(c.condition_explainers, "per_condition");
    assert.strictEqual(typeof c.condition_explainers, "string");
    assert.strictEqual(c.trial_faqs, "per_trial");
    assert.strictEqual(c.site_descriptions, "per_site");
    assert.strictEqual(c.therapy_descriptions, 3);
    assert.strictEqual(typeof c.therapy_descriptions, "number");
  });

  test("parses cross-domain references", () => {
    const ast = parseDsl(`terrain test {
      clinical {
        trial t1 {
          name "Trial"
          protocol_id "P-001"
          project oncora
          phase "phase_2"
          therapeutic_area "oncology"
          conditions [c1]
          sites [s1]
          principal_investigator @thoth
          sponsor "Sponsor"
          status "active"
          target_enrollment 200
          current_enrollment 100
          start_date 2024-01
          estimated_end_date 2025-06
          arms ["arm1"]
          criteria {
            inclusion {
              age_min 18
              age_max 70
            }
          }
        }
      }
    }`);
    const trial = ast.clinical.trials[0];
    assert.strictEqual(trial.project_ref, "oncora");
    assert.strictEqual(trial.principal_investigator, "thoth");
  });

  test("throws on unknown keyword in condition", () => {
    assertThrowsMessage(
      () =>
        parseDsl(`terrain test {
          clinical {
            condition c1 {
              name "C"
              icd10 ["X"]
              synonyms ["x"]
              synthea_module "m"
              severity "mild"
              unknown_field "oops"
            }
          }
        }`),
      /Unexpected 'unknown_field' in condition/,
    );
  });

  test("throws on unknown keyword in trial", () => {
    assertThrowsMessage(
      () =>
        parseDsl(`terrain test {
          clinical {
            trial t1 {
              name "T"
              bogus_field "oops"
            }
          }
        }`),
      /Unexpected 'bogus_field' in trial/,
    );
  });

  test("clinical block is optional", () => {
    const ast = parseDsl("terrain test {}");
    assert.strictEqual(ast.clinical, null);
  });

  test("exclusion boolean false parses correctly", () => {
    const ast = parseDsl(`terrain test {
      clinical {
        trial t1 {
          name "Trial"
          protocol_id "P-001"
          phase "phase_1"
          therapeutic_area "oncology"
          conditions [c1]
          sites [s1]
          principal_investigator @doc
          sponsor "S"
          status "recruiting"
          target_enrollment 50
          current_enrollment 10
          start_date 2024-01
          estimated_end_date 2025-01
          arms ["a"]
          criteria {
            exclusion {
              active_autoimmune false
              prior_immunotherapy false
            }
          }
        }
      }
    }`);
    const exc = ast.clinical.trials[0].criteria.exclusion;
    assert.strictEqual(exc.active_autoimmune, false);
    assert.strictEqual(exc.prior_immunotherapy, false);
  });
});
