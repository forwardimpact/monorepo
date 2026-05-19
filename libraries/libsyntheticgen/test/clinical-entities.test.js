import { describe, test } from "node:test";
import assert from "node:assert";
import { buildClinicalEntities } from "../src/engine/clinical-entities.js";
import { createSeededRNG } from "../src/engine/rng.js";

function makePeople() {
  return [
    {
      id: "thoth",
      name: "Thoth",
      email: "thoth@example.com",
      discipline: "data_science",
      is_manager: true,
      team_id: "research",
    },
    {
      id: "apollo",
      name: "Apollo",
      email: "apollo@example.com",
      discipline: "software_engineering",
      is_manager: true,
      team_id: "platform",
    },
  ];
}

function makeOrgs() {
  return [
    { id: "hq", name: "Headquarters", iri: "https://example.com/id/org/hq" },
  ];
}

function makeProjects() {
  return [
    {
      id: "oncora",
      name: "Oncora",
      iri: "https://example.com/id/project/oncora",
    },
  ];
}

function makeClinicalAst() {
  return {
    conditions: [
      {
        id: "diabetes_t2",
        name: "Type 2 Diabetes",
        icd10: ["E11"],
        synonyms: ["high blood sugar"],
        synthea_module: "diabetes",
        severity: "chronic",
        prose_topic: "diabetes for patients",
        prose_tone: "empathetic",
      },
      {
        id: "cardiovascular",
        name: "Cardiovascular Disease",
        icd10: ["I25", "I50"],
        synonyms: ["heart disease"],
        synthea_module: "cardiovascular",
        severity: "chronic",
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
        capacity: 500,
        specialties: ["oncology", "cardiology"],
      },
    ],
    trials: [
      {
        id: "oncora_p3",
        name: "ONCORA-301",
        protocol_id: "BNV-ONC-2024-301",
        project_ref: "oncora",
        phase: "phase_3",
        therapeutic_area: "oncology",
        conditions: ["diabetes_t2", "cardiovascular"],
        sites: ["cambridge"],
        principal_investigator: "thoth",
        sponsor: "BioNova",
        status: "recruiting",
        target_enrollment: 450,
        current_enrollment: 287,
        start_date: "2024-06",
        estimated_end_date: "2026-06",
        arms: ["mAb + SoC", "placebo + SoC"],
        prose_topic: "Phase 3 trial",
        prose_tone: "clinical, accessible",
        criteria: {
          inclusion: { age_min: 18, age_max: 75, ecog_max: 2 },
          exclusion: {
            conditions_excluded: ["cardiovascular"],
            active_autoimmune: true,
          },
        },
      },
    ],
    content: null,
  };
}

describe("clinical entity generation", () => {
  const domain = "example.com";
  const rng = createSeededRNG("test-seed");

  test("condition entities have correct fields and IRI", () => {
    const result = buildClinicalEntities(
      makeClinicalAst(),
      makePeople(),
      makeOrgs(),
      makeProjects(),
      domain,
      rng,
    );
    assert.strictEqual(result.conditions.length, 2);
    const c = result.conditions[0];
    assert.strictEqual(c.id, "diabetes_t2");
    assert.strictEqual(c.name, "Type 2 Diabetes");
    assert.deepStrictEqual(c.icd10, ["E11"]);
    assert.strictEqual(c.prose_topic, "diabetes for patients");
    assert.strictEqual(
      c.iri,
      "https://example.com/id/clinical/condition/diabetes_t2",
    );
  });

  test("site entities resolve org_ref", () => {
    const result = buildClinicalEntities(
      makeClinicalAst(),
      makePeople(),
      makeOrgs(),
      makeProjects(),
      domain,
      rng,
    );
    const site = result.sites[0];
    assert.strictEqual(site.id, "cambridge");
    assert.strictEqual(site.org_ref, "hq");
    assert.ok(site.org);
    assert.strictEqual(site.org.id, "hq");
    assert.strictEqual(site.org.name, "Headquarters");
    assert.strictEqual(site.org.iri, "https://example.com/id/org/hq");
  });

  test("trial entities resolve principal_investigator and project", () => {
    const result = buildClinicalEntities(
      makeClinicalAst(),
      makePeople(),
      makeOrgs(),
      makeProjects(),
      domain,
      rng,
    );
    const trial = result.trials[0];
    assert.strictEqual(trial.id, "oncora_p3");
    assert.strictEqual(trial.principal_investigator.ref, "thoth");
    assert.strictEqual(trial.principal_investigator.person.name, "Thoth");
    assert.ok(trial.project);
    assert.strictEqual(trial.project.id, "oncora");
    assert.strictEqual(trial.project.name, "Oncora");
  });

  test("bidirectional relationships link conditions and sites to trials", () => {
    const result = buildClinicalEntities(
      makeClinicalAst(),
      makePeople(),
      makeOrgs(),
      makeProjects(),
      domain,
      rng,
    );
    const diabetes = result.conditions.find((c) => c.id === "diabetes_t2");
    assert.deepStrictEqual(diabetes.trials, ["oncora_p3"]);
    const cardio = result.conditions.find((c) => c.id === "cardiovascular");
    assert.deepStrictEqual(cardio.trials, ["oncora_p3"]);
    const site = result.sites[0];
    assert.deepStrictEqual(site.trials, ["oncora_p3"]);
  });

  test("criteria entities are one per trial", () => {
    const result = buildClinicalEntities(
      makeClinicalAst(),
      makePeople(),
      makeOrgs(),
      makeProjects(),
      domain,
      rng,
    );
    assert.strictEqual(result.criteria.length, 1);
    const crit = result.criteria[0];
    assert.strictEqual(crit.trial_id, "oncora_p3");
    assert.strictEqual(crit.inclusion.age_min, 18);
    assert.strictEqual(crit.exclusion.active_autoimmune, true);
    assert.strictEqual(
      crit.iri,
      "https://example.com/id/clinical/criterion/oncora_p3",
    );
  });

  test("researcher entities generated from PI refs", () => {
    const result = buildClinicalEntities(
      makeClinicalAst(),
      makePeople(),
      makeOrgs(),
      makeProjects(),
      domain,
      rng,
    );
    assert.ok(result.researchers.length >= 1);
    const pi = result.researchers.find(
      (r) => r.role === "principal_investigator",
    );
    assert.ok(pi);
    assert.strictEqual(pi.name, "Thoth");
    assert.deepStrictEqual(pi.trial_ids, ["oncora_p3"]);
  });

  test("throws on unknown PI ref", () => {
    const ast = makeClinicalAst();
    ast.trials[0].principal_investigator = "nobody";
    assert.throws(
      () =>
        buildClinicalEntities(ast, makePeople(), makeOrgs(), makeProjects(), domain, rng),
      /unknown principal investigator '@nobody'/,
    );
  });

  test("throws on unknown condition ref in trial", () => {
    const ast = makeClinicalAst();
    ast.trials[0].conditions = ["nonexistent"];
    assert.throws(
      () =>
        buildClinicalEntities(ast, makePeople(), makeOrgs(), makeProjects(), domain, rng),
      /unknown condition 'nonexistent'/,
    );
  });

  test("null clinical block is not called", async () => {
    const { createEntityGenerator } = await import("../src/engine/tier0.js");
    const { tokenize } = await import("../src/dsl/tokenizer.js");
    const { parse } = await import("../src/dsl/parser.js");
    const { MINI_TERRAIN } = await import(
      "./fixtures/mini-terrain.fixture.js"
    );
    const logger = { warn: () => {} };
    const gen = createEntityGenerator(logger);
    const ast = parse(tokenize(MINI_TERRAIN));
    const result = gen.generate(ast);
    assert.strictEqual(result.clinical, null);
  });

  test("site with unresolved org_ref gets null org", () => {
    const ast = makeClinicalAst();
    ast.sites[0].org_ref = "nonexistent_org";
    const result = buildClinicalEntities(
      ast,
      makePeople(),
      makeOrgs(),
      makeProjects(),
      domain,
      rng,
    );
    assert.strictEqual(result.sites[0].org, null);
    assert.strictEqual(result.sites[0].org_ref, "nonexistent_org");
  });

  test("trial without project_ref gets null project", () => {
    const ast = makeClinicalAst();
    delete ast.trials[0].project_ref;
    const result = buildClinicalEntities(
      ast,
      makePeople(),
      makeOrgs(),
      makeProjects(),
      domain,
      rng,
    );
    assert.strictEqual(result.trials[0].project, null);
    assert.strictEqual(result.trials[0].project_ref, null);
  });
});
