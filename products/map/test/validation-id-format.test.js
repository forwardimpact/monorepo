/**
 * Negative-case schema tests for the kebab-case migration.
 *
 * The simplified standard enforces one delimiter (kebab-case) for every
 * lowercase identifier, drops `skill.agent.name`, and renames the
 * `role_modeling` maturity to `role-modeling`. These tests stage a temp data
 * dir and run the real SchemaValidator (same path as `fit-map validate`) to
 * prove each old shape is now rejected.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSchemaValidator } from "../src/schema-validation.js";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

const runtime = createDefaultRuntime();

function stageDir() {
  return mkdtempSync(join(tmpdir(), "id-format-validation-"));
}

function write(dir, name, content) {
  const full = join(dir, name);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content, "utf-8");
}

function errorsFor(result, fileFragment) {
  return result.errors.filter((e) => e.path?.includes(fileFragment));
}

describe("kebab-case schema enforcement", () => {
  test("snake_case driver id is rejected by the id pattern", async () => {
    const dir = stageDir();
    write(
      dir,
      "drivers.yaml",
      "- id: task_completion\n  name: Task Completion\n",
    );
    try {
      const result =
        await createSchemaValidator(runtime).validateDataDirectory(dir);
      const errs = errorsFor(result, "drivers.yaml");
      assert.ok(
        errs.some((e) => /pattern/i.test(e.message)),
        `expected a pattern error, got: ${JSON.stringify(errs)}`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("kebab-case driver id passes the id pattern", async () => {
    const dir = stageDir();
    write(
      dir,
      "drivers.yaml",
      "- id: task-completion\n  name: Task Completion\n",
    );
    try {
      const result =
        await createSchemaValidator(runtime).validateDataDirectory(dir);
      assert.deepStrictEqual(errorsFor(result, "drivers.yaml"), []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("role_modeling maturity is rejected by the enum", async () => {
    const dir = stageDir();
    write(
      dir,
      "levels.yaml",
      [
        "- id: J040",
        "  professionalTitle: Level I",
        "  managementTitle: Associate",
        "  ordinalRank: 1",
        "  baseSkillProficiencies:",
        "    core: working",
        "    supporting: foundational",
        "    broad: awareness",
        "  baseBehaviourMaturity: role_modeling",
        "",
      ].join("\n"),
    );
    try {
      const result =
        await createSchemaValidator(runtime).validateDataDirectory(dir);
      const errs = errorsFor(result, "levels.yaml");
      assert.ok(
        errs.some((e) => /enum/i.test(e.message) || /allowed/i.test(e.message)),
        `expected an enum error, got: ${JSON.stringify(errs)}`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("skill.agent.name is rejected (additionalProperties)", async () => {
    const dir = stageDir();
    write(
      dir,
      "capabilities/delivery.yaml",
      [
        "name: Delivery",
        "skills:",
        "  - id: task-completion",
        "    name: Task Completion",
        "    human:",
        "      description: Completes work items.",
        "      proficiencyDescriptions:",
        "        awareness: a",
        "        foundational: b",
        "        working: c",
        "        practitioner: d",
        "        expert: e",
        "    agent:",
        "      name: task-completion",
        "      description: Completes work items.",
        "      useWhen: implementing features",
        "      focus: Implement with tests.",
        "      readChecklist:",
        "        - Read the requirements",
        "      confirmChecklist:",
        "        - Tests pass",
        "",
      ].join("\n"),
    );
    try {
      const result =
        await createSchemaValidator(runtime).validateDataDirectory(dir);
      const errs = errorsFor(result, "delivery.yaml");
      assert.ok(
        errs.some(
          (e) => /additional/i.test(e.message) && /name/.test(e.message),
        ),
        `expected an additionalProperties 'name' error, got: ${JSON.stringify(errs)}`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
