/**
 * Baseline regression tests for `fit-pathway agent`.
 *
 * Case 1 (byte-identical-absent) reads a captured baseline fixture and
 * compares the generator's output against it, with the slot file removed.
 * This anchors the "absent slot produces output identical to baseline"
 * invariant to an empirical snapshot.
 *
 * Case 2 (populated-starter) runs against the unmodified starter (slot
 * present) and asserts the rendered file carries the placeholder values
 * verbatim — what the starter teaches new installers.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, cpSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createDataLoader } from "@forwardimpact/map/loader";
import { createTemplateLoader } from "@forwardimpact/libtemplate";
import { runAgentCommand } from "../src/commands/agent.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const starterDir = join(__dirname, "..", "..", "map", "starter");
const templatesDir = join(__dirname, "..", "templates");
const fixturePath = join(
  __dirname,
  "fixtures",
  "claude-md-baseline-se-platform.md",
);

function silent(fn) {
  const original = console.log;
  console.log = () => {};
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.log = original;
    });
}

async function runAgent(dataDir) {
  const outputDir = mkdtempSync(join(tmpdir(), "agent-baseline-out-"));
  const loader = createDataLoader();
  const templateLoader = createTemplateLoader(templatesDir);
  const data = await loader.loadAllData(dataDir);
  await silent(() =>
    runAgentCommand({
      data,
      args: ["software_engineering"],
      options: { track: "platform", output: outputDir },
      dataDir,
      templateLoader,
      loader,
    }),
  );
  return outputDir;
}

describe("agent baseline regression", () => {
  test("absent-slot output is byte-identical to the captured fixture", async () => {
    const work = mkdtempSync(join(tmpdir(), "agent-baseline-absent-"));
    let outputDir;
    try {
      const stagedData = join(work, "data");
      cpSync(starterDir, stagedData, { recursive: true });
      const slotPath = join(stagedData, "organizational-context.yaml");
      assert.ok(existsSync(slotPath), "starter ships the slot");
      rmSync(slotPath);

      outputDir = await runAgent(stagedData);
      const rendered = readFileSync(
        join(outputDir, ".claude", "CLAUDE.md"),
        "utf-8",
      );
      const fixture = readFileSync(fixturePath, "utf-8");
      assert.strictEqual(rendered, fixture);
    } finally {
      rmSync(work, { recursive: true, force: true });
      if (outputDir) rmSync(outputDir, { recursive: true, force: true });
    }
  });

  test("populated-starter output contains placeholder values verbatim", async () => {
    let outputDir;
    try {
      outputDir = await runAgent(starterDir);
      const rendered = readFileSync(
        join(outputDir, ".claude", "CLAUDE.md"),
        "utf-8",
      );

      const expectedSection = [
        "## Organizational Context",
        "",
        "- **Repositories:** molecularforge, data-lake-infra, api-gateway",
        "- **Team:** pharma-platform",
        "- **Manager:** athena",
        "- **Adjacent leads:** iris (DX), prometheus (DS/AI)",
        "- **Projects:** drug-discovery-pipeline, lab-data-portal",
        "- **Escalation paths:**",
        "  - production page after hours → pagerduty://pharma-platform-oncall",
        "  - security incident → security@pharma.example.com",
      ].join("\n");

      assert.ok(
        rendered.includes(expectedSection),
        "section must appear verbatim",
      );
      // YAML key form must not leak (the renderer emits prose bullets).
      assert.ok(!rendered.includes("manager: athena"));

      // Section is appended after the existing teamInstructions body.
      const tiAnchor = "Treat the platform as a"; // from starter's platform.yaml
      const tiIdx = rendered.indexOf(tiAnchor);
      const sectionIdx = rendered.indexOf("## Organizational Context");
      assert.ok(tiIdx >= 0, "teamInstructions anchor missing");
      assert.ok(sectionIdx > tiIdx, "section must follow teamInstructions");
    } finally {
      if (outputDir) rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
