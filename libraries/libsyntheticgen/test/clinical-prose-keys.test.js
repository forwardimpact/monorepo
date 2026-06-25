import { describe, test } from "node:test";
import assert from "node:assert";
import { clinicalProseKeys } from "../src/engine/clinical-prose-keys.js";
import { collectProseKeys } from "../src/engine/prose-keys.js";
import { PromptLoader } from "@forwardimpact/libprompt";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const promptDir = join(
  __dirname,
  "..",
  "..",
  "libsyntheticprose",
  "src",
  "prompts",
);

function makePromptLoader() {
  return new PromptLoader(promptDir, createDefaultRuntime());
}

function makeClinicalEntities() {
  return {
    conditions: [
      {
        id: "diabetes-t2",
        name: "Type 2 Diabetes",
        icd10: ["E11"],
        synonyms: ["high blood sugar"],
        severity: "chronic",
        prose_topic: "diabetes for patients",
        prose_tone: "empathetic",
        trials: ["oncora-p3"],
      },
      {
        id: "cardiovascular",
        name: "Cardiovascular Disease",
        icd10: ["I25", "I50"],
        synonyms: ["heart disease"],
        severity: "chronic",
        prose_topic: null,
        prose_tone: null,
        trials: ["oncora-p3"],
      },
    ],
    sites: [
      {
        id: "cambridge",
        name: "Cambridge Center",
        city: "Cambridge",
        state: "MA",
        specialties: ["oncology", "cardiology"],
        trials: ["oncora-p3"],
      },
    ],
    trials: [
      {
        id: "oncora-p3",
        name: "ONCORA-301",
        phase: "phase_3",
        therapeutic_area: "oncology",
        conditions: ["diabetes-t2", "cardiovascular"],
        sites: ["cambridge"],
        sponsor: "BioNova",
        status: "recruiting",
        target_enrollment: 450,
        current_enrollment: 287,
        arms: ["mAb + SoC", "placebo + SoC"],
        prose_topic: "Phase 3 trial",
        prose_tone: "clinical",
      },
    ],
    criteria: [
      {
        trial_id: "oncora-p3",
        inclusion: {
          age_min: 18,
          age_max: 75,
          ecog_max: 2,
          conditions_required: ["diabetes-t2"],
        },
        exclusion: {
          conditions_excluded: ["cardiovascular"],
          active_autoimmune: true,
        },
      },
    ],
    researchers: [],
    content: {
      patient_stories: 4,
      patient_story_conditions: ["diabetes-t2", "cardiovascular"],
      therapy_topics: ["immunotherapy", "biologics"],
    },
  };
}

describe("clinical prose key generation", () => {
  const loader = makePromptLoader();
  const clinical = makeClinicalEntities();

  test("yields expected number of keys", () => {
    const keys = Array.from(
      clinicalProseKeys(clinical, "example.com", "BioNova", loader),
    );
    const byPrefix = (p) => keys.filter(([k]) => k.startsWith(p));

    assert.strictEqual(byPrefix("clinical_condition_explainer_").length, 2);
    assert.strictEqual(byPrefix("clinical_trial_faq_").length, 1);
    assert.strictEqual(byPrefix("clinical_consent_summary_").length, 1);
    assert.strictEqual(byPrefix("clinical_site_description_").length, 1);
    assert.strictEqual(byPrefix("clinical_patient_story_").length, 4);
    assert.strictEqual(byPrefix("clinical_therapy_description_").length, 2);
    assert.strictEqual(keys.length, 11);
  });

  test("all keys start with clinical_ prefix", () => {
    const keys = Array.from(
      clinicalProseKeys(clinical, "example.com", "BioNova", loader),
    );
    for (const [key] of keys) {
      assert.ok(key.startsWith("clinical_"), `Key '${key}' missing prefix`);
    }
  });

  test("each context has a clinical sub-object", () => {
    const keys = Array.from(
      clinicalProseKeys(clinical, "example.com", "BioNova", loader),
    );
    for (const [key, ctx] of keys) {
      assert.ok(ctx.clinical, `Key '${key}' missing clinical context`);
    }
  });

  test("each context has a messages array with system + user roles", () => {
    const keys = Array.from(
      clinicalProseKeys(clinical, "example.com", "BioNova", loader),
    );
    for (const [key, ctx] of keys) {
      assert.ok(Array.isArray(ctx.messages), `Key '${key}' missing messages`);
      assert.strictEqual(
        ctx.messages.length,
        2,
        `Key '${key}' needs 2 messages`,
      );
      assert.strictEqual(ctx.messages[0].role, "system");
      assert.strictEqual(ctx.messages[1].role, "user");
      assert.ok(ctx.messages[0].content.length > 0);
      assert.ok(ctx.messages[1].content.length > 0);
    }
  });

  test("condition explainer uses entity prose_topic when set", () => {
    const keys = Array.from(
      clinicalProseKeys(clinical, "example.com", "BioNova", loader),
    );
    const [, ctx] = keys.find(([k]) => k.includes("diabetes-t2"));
    assert.strictEqual(ctx.topic, "diabetes for patients");
    assert.strictEqual(ctx.tone, "empathetic");
  });

  test("condition explainer falls back when prose_topic is null", () => {
    const keys = Array.from(
      clinicalProseKeys(clinical, "example.com", "BioNova", loader),
    );
    const [, ctx] = keys.find(
      ([k]) =>
        k.startsWith("clinical_condition_explainer_") &&
        k.includes("cardiovascular"),
    );
    assert.ok(ctx.topic.includes("Cardiovascular Disease"));
    assert.strictEqual(ctx.tone, "empathetic, accessible");
  });

  test("per-entity cardinality: one explainer per condition", () => {
    const keys = Array.from(
      clinicalProseKeys(clinical, "example.com", "BioNova", loader),
    );
    const explainers = keys.filter(([k]) =>
      k.startsWith("clinical_condition_explainer_"),
    );
    assert.strictEqual(explainers.length, clinical.conditions.length);
  });

  test("patient stories distribute across conditions", () => {
    const keys = Array.from(
      clinicalProseKeys(clinical, "example.com", "BioNova", loader),
    );
    const stories = keys.filter(([k]) =>
      k.startsWith("clinical_patient_story_"),
    );
    const diabetesStories = stories.filter(([k]) => k.includes("diabetes-t2"));
    const cardioStories = stories.filter(([k]) => k.includes("cardiovascular"));
    assert.strictEqual(diabetesStories.length, 2);
    assert.strictEqual(cardioStories.length, 2);
  });

  test("site description includes active recruiting trials", () => {
    const keys = Array.from(
      clinicalProseKeys(clinical, "example.com", "BioNova", loader),
    );
    const [, ctx] = keys.find(([k]) => k.includes("site_description"));
    assert.deepStrictEqual(ctx.clinical.site.active_trials, ["ONCORA-301"]);
  });

  test("trial FAQ includes criteria context", () => {
    const keys = Array.from(
      clinicalProseKeys(clinical, "example.com", "BioNova", loader),
    );
    const [, ctx] = keys.find(([k]) => k.includes("trial_faq"));
    assert.ok(ctx.clinical.criteria);
    assert.strictEqual(ctx.clinical.criteria.inclusion.age_min, 18);
  });
});

describe("collectProseKeys with clinical entities", () => {
  test("returns zero clinical keys when entities.clinical is null", () => {
    const entities = {
      orgs: [{ name: "BioNova" }],
      domain: "example.com",
      projects: [],
      content: [],
      activity: {},
      clinical: null,
    };
    const keys = collectProseKeys(entities, {
      promptLoader: makePromptLoader(),
    });
    const clinicalKeys = Array.from(keys.keys()).filter((k) =>
      k.startsWith("clinical_"),
    );
    assert.strictEqual(clinicalKeys.length, 0);
  });

  test("returns zero clinical keys when promptLoader is absent", () => {
    const entities = {
      orgs: [{ name: "BioNova" }],
      domain: "example.com",
      projects: [],
      content: [],
      activity: {},
      clinical: makeClinicalEntities(),
    };
    const keys = collectProseKeys(entities);
    const clinicalKeys = Array.from(keys.keys()).filter((k) =>
      k.startsWith("clinical_"),
    );
    assert.strictEqual(clinicalKeys.length, 0);
  });

  test("includes clinical keys when both clinical and promptLoader are present", () => {
    const entities = {
      orgs: [{ name: "BioNova" }],
      domain: "example.com",
      projects: [],
      content: [],
      activity: {},
      clinical: makeClinicalEntities(),
    };
    const keys = collectProseKeys(entities, {
      promptLoader: makePromptLoader(),
    });
    const clinicalKeys = Array.from(keys.keys()).filter((k) =>
      k.startsWith("clinical_"),
    );
    assert.ok(clinicalKeys.length > 0);
  });
});
