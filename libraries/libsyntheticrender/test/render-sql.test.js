import { describe, test } from "node:test";
import assert from "node:assert";
import { renderSql } from "../src/render/render-sql.js";

function makeClinical() {
  return {
    conditions: [
      {
        id: "diabetes-t2",
        name: "Type 2 Diabetes",
        icd10: ["E11"],
        synonyms: ["high blood sugar"],
        synthea_module: "diabetes",
        severity: "chronic",
        prose_topic: "diabetes",
        prose_tone: "empathetic",
        trials: ["oncora-p3"],
        iri: "https://example.com/id/clinical/condition/diabetes-t2",
      },
      {
        id: "cardio",
        name: "Cardiovascular Disease",
        icd10: ["I25"],
        synonyms: ["heart disease"],
        synthea_module: "cardiovascular",
        severity: "chronic",
        prose_topic: null,
        prose_tone: null,
        trials: ["oncora-p3"],
        iri: "https://example.com/id/clinical/condition/cardio",
      },
    ],
    sites: [
      {
        id: "cambridge",
        name: "Cambridge Center",
        address: "200 Park Dr",
        city: "Cambridge",
        state: "MA",
        country: "US",
        org_ref: "hq",
        org: { id: "hq", name: "HQ", iri: "https://example.com/id/org/hq" },
        capacity: 500,
        specialties: ["oncology"],
        trials: ["oncora-p3"],
        iri: "https://example.com/id/clinical/site/cambridge",
      },
    ],
    researchers: [
      {
        id: "thoth",
        person_ref: "thoth",
        name: 'Thoth\'s "Lab"', // contains quotes
        email: "thoth@example.com",
        role: "principal_investigator",
        trial_ids: ["oncora-p3"],
        specialty: "data-science",
        iri: "https://example.com/id/clinical/researcher/thoth",
      },
    ],
    trials: [
      {
        id: "oncora-p3",
        name: "ONCORA-301",
        protocol_id: "BNV-ONC-2024-301",
        phase: "phase_3",
        therapeutic_area: "oncology",
        conditions: ["diabetes-t2", "cardio"],
        sites: ["cambridge"],
        principal_investigator: {
          ref: "thoth",
          person: { id: "thoth", name: "Thoth" },
        },
        project_ref: "oncora",
        project: { id: "oncora", name: "Oncora" },
        sponsor: "BioNova",
        status: "recruiting",
        target_enrollment: 450,
        current_enrollment: 287,
        start_date: "2024-06",
        estimated_end_date: "2026-06",
        arms: ["mAb + SoC", "placebo + SoC"],
        prose_topic: null,
        prose_tone: null,
        criteria: { inclusion: {}, exclusion: {} },
        iri: "https://example.com/id/clinical/trial/oncora-p3",
      },
    ],
    criteria: [
      {
        trial_id: "oncora-p3",
        inclusion: { age_min: 18, age_max: 75 },
        exclusion: { active_autoimmune: true },
        iri: "https://example.com/id/clinical/criterion/oncora-p3",
      },
    ],
  };
}

const ALL_ENTITIES = [
  "clinical.conditions",
  "clinical.sites",
  "clinical.researchers",
  "clinical.trials",
  "clinical.criteria",
];

describe("renderSql", () => {
  test("emits 8 files without include_embeddings, 9 with", () => {
    const out = renderSql(makeClinical(), {
      prefix: "bn",
      entities: ALL_ENTITIES,
    });
    assert.strictEqual(out.size, 8);

    const withEmb = renderSql(makeClinical(), {
      prefix: "bn",
      entities: ALL_ENTITIES,
      include_embeddings: true,
    });
    assert.strictEqual(withEmb.size, 9);
  });

  test("files are numbered in dependency order", () => {
    const out = renderSql(makeClinical(), {
      prefix: "bn",
      entities: ALL_ENTITIES,
      include_embeddings: true,
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
      "bn_008_rls.sql",
      "bn_009_condition_embeddings.sql",
    ]);
  });

  test("each entity file contains CREATE TABLE IF NOT EXISTS", () => {
    const out = renderSql(makeClinical(), {
      prefix: "bn",
      entities: ALL_ENTITIES,
    });
    for (const [path, content] of out) {
      if (path.endsWith("_rls.sql")) continue;
      assert.ok(
        content.includes("CREATE TABLE IF NOT EXISTS"),
        `${path} missing CREATE TABLE`,
      );
    }
  });

  test("INSERT statements include each entity record", () => {
    const out = renderSql(makeClinical(), {
      prefix: "bn",
      entities: ALL_ENTITIES,
    });
    const conditions = out.get("bn_001_conditions.sql");
    assert.ok(conditions.includes('INSERT INTO "conditions"'));
    assert.ok(conditions.includes("diabetes-t2"));
    assert.ok(conditions.includes("cardio"));
  });

  test("text array columns use ARRAY[...] literal", () => {
    const out = renderSql(makeClinical(), {
      prefix: "bn",
      entities: ALL_ENTITIES,
    });
    const conditions = out.get("bn_001_conditions.sql");
    assert.ok(conditions.includes('"icd10" text[]'));
    assert.ok(conditions.includes("ARRAY['E11']"));
  });

  test("junction tables generated for trial.sites and trial.conditions", () => {
    const out = renderSql(makeClinical(), {
      prefix: "bn",
      entities: ALL_ENTITIES,
    });
    const trialSites = out.get("bn_006_trial_sites.sql");
    assert.ok(trialSites.includes('CREATE TABLE IF NOT EXISTS "trial_sites"'));
    assert.ok(trialSites.includes("trial_id"));
    assert.ok(trialSites.includes("site_id"));
    assert.ok(trialSites.includes("$$oncora-p3$$"));
    assert.ok(trialSites.includes("$$cambridge$$"));

    const trialConditions = out.get("bn_007_trial_conditions.sql");
    assert.ok(trialConditions.includes("condition_id"));
    assert.ok(trialConditions.includes("$$diabetes-t2$$"));
  });

  test("RLS file enables row level security on every table", () => {
    const out = renderSql(makeClinical(), {
      prefix: "bn",
      entities: ALL_ENTITIES,
    });
    const rls = out.get("bn_008_rls.sql");
    for (const t of [
      "conditions",
      "sites",
      "researchers",
      "trials",
      "criteria",
      "trial_sites",
      "trial_conditions",
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

  test("embeddings table uses vector(384) and has RLS", () => {
    const out = renderSql(makeClinical(), {
      prefix: "bn",
      entities: ALL_ENTITIES,
      include_embeddings: true,
    });
    const emb = out.get("bn_009_condition_embeddings.sql");
    assert.ok(emb.includes("CREATE EXTENSION IF NOT EXISTS vector"));
    assert.ok(emb.includes("vector(384)"));
    assert.ok(!emb.includes("INSERT INTO"));
    assert.ok(
      emb.includes(
        'ALTER TABLE "condition_embeddings" ENABLE ROW LEVEL SECURITY',
      ),
    );
    assert.ok(
      emb.includes('CREATE POLICY "public_read" ON "condition_embeddings"'),
    );
  });

  test("strings with single quotes are dollar-quoted safely", () => {
    const out = renderSql(makeClinical(), {
      prefix: "bn",
      entities: ["clinical.researchers"],
    });
    const researchers = out.get("bn_001_researchers.sql");
    assert.ok(researchers.includes('$$Thoth\'s "Lab"$$'));
  });

  test("integer columns use plain numeric literals", () => {
    const out = renderSql(makeClinical(), {
      prefix: "bn",
      entities: ["clinical.sites"],
    });
    const sites = out.get("bn_001_sites.sql");
    assert.ok(sites.includes('"capacity" integer'));
    assert.ok(/VALUES[\s\S]*500/.test(sites));
  });

  test("object fields serialize as jsonb", () => {
    const out = renderSql(makeClinical(), {
      prefix: "bn",
      entities: ["clinical.criteria"],
    });
    const criteria = out.get("bn_001_criteria.sql");
    assert.ok(criteria.includes('"inclusion" jsonb'));
    assert.ok(criteria.includes("::jsonb"));
  });

  test("foreign keys declared on dependent tables", () => {
    const out = renderSql(makeClinical(), {
      prefix: "bn",
      entities: ALL_ENTITIES,
    });
    const trials = out.get("bn_004_trials.sql");
    assert.ok(trials.includes('"principal_investigator_id" text'));
    assert.ok(
      trials.includes(
        'FOREIGN KEY ("principal_investigator_id") REFERENCES researchers(id)',
      ),
    );

    const criteria = out.get("bn_005_criteria.sql");
    assert.ok(
      criteria.includes('FOREIGN KEY ("trial_id") REFERENCES trials(id)'),
    );
  });

  test("project_id reads from project.id not project_ref", () => {
    const clinical = makeClinical();
    clinical.trials[0].project_ref = "oncora";
    clinical.trials[0].project = { id: "oncora_resolved", name: "Oncora" };
    const out = renderSql(clinical, {
      prefix: "bn",
      entities: ["clinical.trials"],
    });
    const trials = out.get("bn_001_trials.sql");
    assert.ok(
      trials.includes("oncora_resolved"),
      "project_id should use project.id",
    );
  });

  test("date-pattern strings infer as date columns", () => {
    const out = renderSql(makeClinical(), {
      prefix: "bn",
      entities: ["clinical.trials"],
    });
    const trials = out.get("bn_001_trials.sql");
    assert.ok(
      trials.includes('"start_date" date'),
      "start_date should be date type",
    );
    assert.ok(
      trials.includes('"estimated_end_date" date'),
      "estimated_end_date should be date type",
    );
    assert.ok(
      trials.includes("'2024-06-01'"),
      "YYYY-MM dates should be padded to YYYY-MM-01",
    );
  });

  test("subset of entities produces fewer files and skips junctions", () => {
    const out = renderSql(makeClinical(), {
      prefix: "bn",
      entities: ["clinical.conditions"],
    });
    // 1 conditions file + 1 RLS file
    assert.strictEqual(out.size, 2);
    assert.ok(out.has("bn_001_conditions.sql"));
    assert.ok(out.has("bn_002_rls.sql"));
  });

  test("path config prefixes every emitted filename", () => {
    const out = renderSql(makeClinical(), {
      path: "supabase/migrations/",
      prefix: "bn",
      entities: ["clinical.conditions"],
    });
    assert.strictEqual(out.size, 2);
    assert.ok(out.has("supabase/migrations/bn_001_conditions.sql"));
    assert.ok(out.has("supabase/migrations/bn_002_rls.sql"));
  });

  test("path config normalizes trailing slash", () => {
    const out = renderSql(makeClinical(), {
      path: "supabase/migrations",
      prefix: "bn",
      entities: ["clinical.conditions"],
    });
    assert.ok(out.has("supabase/migrations/bn_001_conditions.sql"));
  });

  test("no path config keeps bare filenames (backwards compatible)", () => {
    const out = renderSql(makeClinical(), {
      prefix: "bn",
      entities: ["clinical.conditions"],
    });
    assert.ok(out.has("bn_001_conditions.sql"));
  });
});
