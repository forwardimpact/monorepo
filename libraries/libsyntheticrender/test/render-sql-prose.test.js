import { describe, test } from "node:test";
import assert from "node:assert";
import { renderSql } from "../src/render/render-sql.js";

// Minimal clinical graph plus the `content` block the prose tables iterate.
// perCondition for patient stories = ceil(patient_stories / conditions) =
// ceil(4 / 2) = 2, so two stories per listed condition.
function makeClinical() {
  return {
    conditions: [
      { id: "c1", name: "Condition One" },
      { id: "c2", name: "Condition Two" },
    ],
    sites: [{ id: "s1", name: "Site One" }],
    researchers: [],
    trials: [{ id: "t1", name: "Trial One" }],
    criteria: [],
    content: {
      patient_story_conditions: ["c1", "c2"],
      patient_stories: 4,
      therapy_topics: ["immunotherapy", "chemo"],
    },
  };
}

function makeProse() {
  return new Map([
    ["clinical_condition_explainer_c1", "Explainer for c1."],
    ["clinical_condition_explainer_c2", "Explainer for c2."],
    ["clinical_trial_faq_t1", "FAQ for t1."],
    ["clinical_consent_summary_t1", "Consent summary for t1."],
    ["clinical_site_description_s1", "Description for s1."],
    ["clinical_patient_story_c1_0", "Story c1 0."],
    ["clinical_patient_story_c1_1", "Story c1 1."],
    ["clinical_patient_story_c2_0", "Story c2 0."],
    ["clinical_patient_story_c2_1", "Story c2 1."],
    ["clinical_therapy_description_immunotherapy", "Immunotherapy overview."],
    ["clinical_therapy_description_chemo", "Chemo overview."],
  ]);
}

const PROSE_ENTITIES = [
  "clinical.condition_explainers",
  "clinical.trial_faqs",
  "clinical.consent_summaries",
  "clinical.site_descriptions",
  "clinical.patient_stories",
  "clinical.therapy_descriptions",
];

const ALL_ENTITIES = [
  "clinical.conditions",
  "clinical.sites",
  "clinical.researchers",
  "clinical.trials",
  "clinical.criteria",
  ...PROSE_ENTITIES,
];

describe("renderSql prose tables", () => {
  test("emits a file per requested prose entity with resolved text", () => {
    const out = renderSql(
      makeClinical(),
      { prefix: "bn", entities: ALL_ENTITIES },
      makeProse(),
    );

    const explainers = out.get("bn_008_condition_explainers.sql");
    assert.ok(
      explainers.includes('CREATE TABLE IF NOT EXISTS "condition_explainers"'),
    );
    assert.ok(explainers.includes('"condition_id" text PRIMARY KEY'));
    assert.ok(explainers.includes('"explainer" text'));
    assert.ok(
      explainers.includes(
        'FOREIGN KEY ("condition_id") REFERENCES conditions(id)',
      ),
    );
    assert.ok(explainers.includes("$$Explainer for c1.$$"));

    assert.ok(out.get("bn_009_trial_faqs.sql").includes("$$FAQ for t1.$$"));
    assert.ok(
      out
        .get("bn_010_consent_summaries.sql")
        .includes("$$Consent summary for t1.$$"),
    );
    assert.ok(
      out
        .get("bn_011_site_descriptions.sql")
        .includes("$$Description for s1.$$"),
    );
    const therapy = out.get("bn_013_therapy_descriptions.sql");
    assert.ok(therapy.includes('"topic" text PRIMARY KEY'));
    assert.ok(therapy.includes("$$Immunotherapy overview.$$"));
    assert.ok(therapy.includes("$$Chemo overview.$$"));
  });

  test("patient_stories fans out perCondition rows with matching ids", () => {
    const out = renderSql(
      makeClinical(),
      { prefix: "bn", entities: ALL_ENTITIES },
      makeProse(),
    );
    const stories = out.get("bn_012_patient_stories.sql");
    assert.ok(stories.includes('"id" text PRIMARY KEY'));
    assert.ok(stories.includes('"condition_id" text'));
    assert.ok(stories.includes('"story_index" integer'));
    assert.ok(
      stories.includes(
        'FOREIGN KEY ("condition_id") REFERENCES conditions(id)',
      ),
    );
    for (const id of ["c1_0", "c1_1", "c2_0", "c2_1"]) {
      assert.ok(stories.includes(`$$${id}$$`), `missing story id ${id}`);
    }
    // Four story rows: count the dollar-quoted ids in the VALUES list.
    const idMatches = stories.match(/\$\$c\d_\d\$\$/g) ?? [];
    assert.strictEqual(idMatches.length, 4);
  });

  test("prose tables get public_read RLS alongside base tables", () => {
    const out = renderSql(makeClinical(), {
      prefix: "bn",
      entities: ALL_ENTITIES,
    });
    const rls = out.get("bn_014_rls.sql");
    for (const t of [
      "condition_explainers",
      "trial_faqs",
      "consent_summaries",
      "site_descriptions",
      "patient_stories",
      "therapy_descriptions",
    ]) {
      assert.ok(
        rls.includes(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`),
        `RLS missing ALTER for ${t}`,
      );
      assert.ok(
        rls.includes(`CREATE POLICY "public_read" ON "${t}"`),
        `RLS missing policy for ${t}`,
      );
    }
  });

  test("prose tables render after base tables (FK-apply order)", () => {
    const out = renderSql(makeClinical(), {
      prefix: "bn",
      entities: ALL_ENTITIES,
    });
    const paths = [...out.keys()];
    assert.deepStrictEqual(paths, [
      "bn_001_conditions.sql",
      "bn_002_sites.sql",
      "bn_003_researchers.sql",
      "bn_004_trials.sql",
      "bn_005_criteria.sql",
      "bn_006_trial_sites.sql",
      "bn_007_trial_conditions.sql",
      "bn_008_condition_explainers.sql",
      "bn_009_trial_faqs.sql",
      "bn_010_consent_summaries.sql",
      "bn_011_site_descriptions.sql",
      "bn_012_patient_stories.sql",
      "bn_013_therapy_descriptions.sql",
      "bn_014_rls.sql",
    ]);
  });

  test("omitting prose refs keeps the base 5-table output unchanged", () => {
    const baseEntities = [
      "clinical.conditions",
      "clinical.sites",
      "clinical.researchers",
      "clinical.trials",
      "clinical.criteria",
    ];
    const out = renderSql(makeClinical(), {
      prefix: "bn",
      entities: baseEntities,
    });
    const paths = [...out.keys()];
    assert.ok(!paths.some((p) => p.includes("condition_explainers")));
    assert.ok(!paths.some((p) => p.includes("patient_stories")));
    // conditions..criteria + trial_sites + trial_conditions + rls = 8
    assert.strictEqual(out.size, 8);
  });

  test("missing prose resolves to NULL, not a thrown error", () => {
    const out = renderSql(makeClinical(), {
      prefix: "bn",
      entities: ["clinical.condition_explainers"],
    }); // no prose cache passed at all
    const explainers = out.get("bn_001_condition_explainers.sql");
    assert.ok(explainers.includes("NULL"));
  });

  test("render is byte-identical across repeated runs (determinism)", () => {
    const a = renderSql(
      makeClinical(),
      {
        prefix: "bn",
        entities: ALL_ENTITIES,
      },
      makeProse(),
    );
    const b = renderSql(
      makeClinical(),
      {
        prefix: "bn",
        entities: ALL_ENTITIES,
      },
      makeProse(),
    );
    assert.deepStrictEqual([...a.entries()], [...b.entries()]);
  });
});
