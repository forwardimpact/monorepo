/**
 * Integration tests for SchemaValidator against the
 * organizational-context.yaml slot.
 *
 * Stages a temp data dir on disk, then invokes the real validator with
 * real fs/ajv dependencies — same approach as `bunx fit-map validate`
 * uses end-to-end. The slot has no referential integrity to other
 * entities, so we exercise only the schema branch.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSchemaValidator } from "../src/schema-validation.js";

function stageDataDir(files) {
  const dir = mkdtempSync(join(tmpdir(), "orgctx-validation-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, "utf-8");
  }
  return dir;
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

describe("SchemaValidator — organizational-context.yaml", () => {
  test("clean populated slot validates", async () => {
    const dir = stageDataDir({
      "organizational-context.yaml": [
        "repositories:",
        "  - molecularforge",
        "  - data-lake-infra",
        "team: pharma-platform",
        "manager: athena",
        "adjacentLeads:",
        "  - handle: iris",
        "    role: DX",
        "  - handle: prometheus",
        "    role: DS/AI",
        "projects:",
        "  - drug-discovery-pipeline",
        "  - lab-data-portal",
        "escalationPaths:",
        "  - trigger: prod page",
        "    destination: pagerduty://oncall",
        "  - trigger: security incident",
        "    destination: security@pharma.example.com",
        "",
      ].join("\n"),
    });
    try {
      const validator = createSchemaValidator();
      const result = await validator.validateDataDirectory(dir);
      const orgErrors = result.errors.filter((e) =>
        e.path?.includes("organizational-context.yaml"),
      );
      assert.deepStrictEqual(orgErrors, []);
      assert.strictEqual(result.valid, true);
    } finally {
      cleanup(dir);
    }
  });

  test("absent slot produces no MISSING_FILE warning", async () => {
    const dir = mkdtempSync(join(tmpdir(), "orgctx-absent-"));
    try {
      const validator = createSchemaValidator();
      const result = await validator.validateDataDirectory(dir);
      const missing = result.warnings.find(
        (w) =>
          w.type === "MISSING_FILE" &&
          w.message?.includes("organizational-context.yaml"),
      );
      assert.strictEqual(
        missing,
        undefined,
        "no MISSING_FILE warning expected",
      );
    } finally {
      cleanup(dir);
    }
  });

  test("malformed slot produces line-attributable errors", async () => {
    const dir = stageDataDir({
      "organizational-context.yaml": [
        "repositories: not-an-array",
        "unknownKey: surprise",
        "escalationPaths:",
        "  - trigger: incident",
        "",
      ].join("\n"),
    });
    try {
      const validator = createSchemaValidator();
      const result = await validator.validateDataDirectory(dir);
      const orgErrors = result.errors.filter((e) =>
        e.path?.includes("organizational-context.yaml"),
      );
      assert.ok(
        orgErrors.length >= 3,
        `expected ≥3 errors, got ${orgErrors.length}: ${JSON.stringify(orgErrors)}`,
      );
      for (const err of orgErrors) {
        assert.ok(
          typeof err.path === "string" && err.path.length > 0,
          `error path empty: ${JSON.stringify(err)}`,
        );
      }
      assert.strictEqual(result.valid, false);
    } finally {
      cleanup(dir);
    }
  });

  test("empty object slot is valid", async () => {
    const dir = stageDataDir({
      "organizational-context.yaml": "{}\n",
    });
    try {
      const validator = createSchemaValidator();
      const result = await validator.validateDataDirectory(dir);
      const orgErrors = result.errors.filter((e) =>
        e.path?.includes("organizational-context.yaml"),
      );
      assert.deepStrictEqual(orgErrors, []);
    } finally {
      cleanup(dir);
    }
  });
});
