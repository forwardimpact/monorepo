import { describe, test } from "node:test";
import assert from "node:assert";
import { renderEmbeddings } from "../src/render/render-embeddings.js";

function makeClinical() {
  return {
    conditions: [
      {
        id: "diabetes-t2",
        name: "Type 2 Diabetes",
        synonyms: ["high blood sugar", "T2D"],
        prose_topic: "diabetes",
      },
      {
        id: "cardio",
        name: "Cardiovascular Disease",
        synonyms: ["heart disease"],
      },
    ],
    trials: [
      {
        id: "oncora-p3",
        name: "ONCORA-301",
        therapeutic_area: "oncology",
        arms: ["mAb + SoC", "placebo + SoC"],
      },
    ],
  };
}

describe("renderEmbeddings", () => {
  test("produces one JSONL line per entity", () => {
    const out = renderEmbeddings(makeClinical(), new Map(), {
      path: "out/embed.jsonl",
      entities: ["clinical.conditions", "clinical.trials"],
      text_fields: {
        "clinical.conditions": ["name"],
        "clinical.trials": ["name"],
      },
    });
    const content = out.get("out/embed.jsonl");
    const lines = content.trim().split("\n");
    assert.strictEqual(lines.length, 3);
    for (const l of lines) {
      const parsed = JSON.parse(l);
      assert.ok(parsed.id);
      assert.ok(parsed.table);
      assert.ok(parsed.text);
    }
  });

  test("each line has id, table, and text fields", () => {
    const out = renderEmbeddings(makeClinical(), new Map(), {
      path: "out/embed.jsonl",
      entities: ["clinical.conditions"],
      text_fields: { "clinical.conditions": ["name"] },
    });
    const first = JSON.parse(out.get("out/embed.jsonl").trim().split("\n")[0]);
    assert.strictEqual(first.id, "diabetes-t2");
    assert.strictEqual(first.table, "conditions");
    assert.strictEqual(first.text, "Type 2 Diabetes");
  });

  test("arrays are space-joined", () => {
    const out = renderEmbeddings(makeClinical(), new Map(), {
      path: "out/embed.jsonl",
      entities: ["clinical.conditions"],
      text_fields: { "clinical.conditions": ["name", "synonyms"] },
    });
    const first = JSON.parse(out.get("out/embed.jsonl").trim().split("\n")[0]);
    assert.strictEqual(first.text, "Type 2 Diabetes high blood sugar T2D");
  });

  test("synthetic prose-explainer resolves against cache", () => {
    const cache = new Map([
      [
        "clinical_condition_explainer_diabetes-t2",
        "Diabetes happens when your body cannot use sugar well.",
      ],
    ]);
    const out = renderEmbeddings(makeClinical(), cache, {
      path: "out/embed.jsonl",
      entities: ["clinical.conditions"],
      text_fields: {
        "clinical.conditions": ["name", "prose-explainer"],
      },
    });
    const lines = out.get("out/embed.jsonl").trim().split("\n").map(JSON.parse);
    const diabetes = lines.find((l) => l.id === "diabetes-t2");
    assert.ok(diabetes.text.includes("Diabetes happens"));
  });

  test("synthetic prose-description resolves against consent summary key", () => {
    const cache = new Map([
      ["clinical_consent_summary_oncora-p3", "Consent summary text."],
    ]);
    const out = renderEmbeddings(makeClinical(), cache, {
      path: "out/embed.jsonl",
      entities: ["clinical.trials"],
      text_fields: {
        "clinical.trials": ["name", "prose-description"],
      },
    });
    const trial = JSON.parse(out.get("out/embed.jsonl").trim().split("\n")[0]);
    assert.strictEqual(trial.text, "ONCORA-301 Consent summary text.");
  });

  test("missing cache entries are silently omitted", () => {
    const out = renderEmbeddings(makeClinical(), new Map(), {
      path: "out/embed.jsonl",
      entities: ["clinical.conditions"],
      text_fields: {
        "clinical.conditions": ["name", "prose-explainer"],
      },
    });
    const lines = out.get("out/embed.jsonl").trim().split("\n").map(JSON.parse);
    for (const l of lines) {
      // text should still contain the name
      assert.ok(l.text.length > 0);
    }
  });

  test("accepts plain object as prose cache", () => {
    const out = renderEmbeddings(
      makeClinical(),
      { clinical_condition_explainer_cardio: "Heart disease prose." },
      {
        path: "out/embed.jsonl",
        entities: ["clinical.conditions"],
        text_fields: {
          "clinical.conditions": ["name", "prose-explainer"],
        },
      },
    );
    const lines = out.get("out/embed.jsonl").trim().split("\n").map(JSON.parse);
    const cardio = lines.find((l) => l.id === "cardio");
    assert.ok(cardio.text.includes("Heart disease prose."));
  });

  test("empty entities list yields empty file", () => {
    const out = renderEmbeddings(makeClinical(), new Map(), {
      path: "out/embed.jsonl",
      entities: [],
      text_fields: {},
    });
    assert.strictEqual(out.get("out/embed.jsonl"), "");
  });
});
