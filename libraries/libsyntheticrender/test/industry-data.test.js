import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  generateDrugs,
  generatePlatforms,
} from "../src/render/industry-data.js";

const DOMAIN = "test.example";

describe("generateDrugs", () => {
  test("returns an array of drug objects", () => {
    const drugs = generateDrugs(DOMAIN);
    assert.ok(Array.isArray(drugs));
    assert.ok(drugs.length > 0);
  });

  test("each drug has required fields", () => {
    const drugs = generateDrugs(DOMAIN);
    for (const drug of drugs) {
      assert.ok(drug.id, "drug missing id");
      assert.ok(drug.name, "drug missing name");
      assert.ok(drug.iri, "drug missing iri");
      assert.ok(drug.drugClass, "drug missing drugClass");
      assert.ok(drug.phase, "drug missing phase");
    }
  });

  test("drug IRIs use the /id/drug/ prefix", () => {
    const drugs = generateDrugs(DOMAIN);
    for (const drug of drugs) {
      assert.ok(
        drug.iri.includes("/id/drug/"),
        `Drug IRI missing /id/drug/: ${drug.iri}`,
      );
    }
  });

  test("drug IDs are unique", () => {
    const drugs = generateDrugs(DOMAIN);
    const ids = drugs.map((d) => d.id);
    assert.strictEqual(ids.length, new Set(ids).size);
  });
});

describe("generatePlatforms", () => {
  test("returns an array of platform objects", () => {
    const platforms = generatePlatforms(DOMAIN);
    assert.ok(Array.isArray(platforms));
    assert.ok(platforms.length > 0);
  });

  test("each platform has required fields", () => {
    const platforms = generatePlatforms(DOMAIN);
    for (const p of platforms) {
      assert.ok(p.id, "platform missing id");
      assert.ok(p.name, "platform missing name");
      assert.ok(p.iri, "platform missing iri");
      assert.ok(p.category, "platform missing category");
      assert.ok(Array.isArray(p.dependencies), "platform missing dependencies");
    }
  });

  test("platform IRIs use the /id/platform/ prefix", () => {
    const platforms = generatePlatforms(DOMAIN);
    for (const p of platforms) {
      assert.ok(
        p.iri.includes("/id/platform/"),
        `Platform IRI missing /id/platform/: ${p.iri}`,
      );
    }
  });

  test("platform IDs are unique", () => {
    const platforms = generatePlatforms(DOMAIN);
    const ids = platforms.map((p) => p.id);
    assert.strictEqual(ids.length, new Set(ids).size);
  });

  test("platform dependencies reference valid IDs", () => {
    const platforms = generatePlatforms(DOMAIN);
    const ids = new Set(platforms.map((p) => p.id));
    for (const p of platforms) {
      for (const dep of p.dependencies) {
        assert.ok(ids.has(dep), `Platform ${p.id} depends on unknown ${dep}`);
      }
    }
  });
});
