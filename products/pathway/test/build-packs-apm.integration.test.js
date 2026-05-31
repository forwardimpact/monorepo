/**
 * Tests for APM bundle generation — APM-Compatible Pack Distribution.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import { createDataLoader } from "@forwardimpact/map/loader";
import {
  getDisciplineAbbreviation,
  toKebabCase,
} from "@forwardimpact/libskill/agent";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { generatePacks } from "../src/commands/build-packs.js";
import { findValidCombinations } from "../src/commands/agent.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const starterDir = join(__dirname, "..", "..", "map", "starter");
const pathwayPkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
);

async function silent(fn) {
  const original = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = original;
  }
}

describe("APM bundles", () => {
  let workDir;
  let outputDir;
  let validCombinations;

  before(async () => {
    workDir = mkdtempSync(join(tmpdir(), "fit-pathway-apm-test-"));
    outputDir = join(workDir, "public");
    await mkdir(outputDir, { recursive: true });

    const loader = createDataLoader();
    const data = await loader.loadAllData(starterDir);
    const agentData = await loader.loadAgentData(starterDir);
    validCombinations = findValidCombinations(data, agentData);

    await silent(() =>
      generatePacks({
        outputDir,
        dataDir: starterDir,
        siteUrl: "https://example.test",
        standard: { title: "Engineering Pathway" },
        version: pathwayPkg.version,
        templatesDir: join(__dirname, "..", "templates"),
        runtime: createDefaultRuntime(),
      }),
    );
  });

  after(() => {
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  });

  test("each APM bundle uses deployed .claude/ layout with apm.lock.yaml", async () => {
    const apmDir = join(outputDir, "packs", "apm");
    const entries = await readdir(apmDir);
    const archive = entries.find((n) => n.endsWith(".tar.gz"));
    assert.ok(archive, "expected at least one APM archive");

    const extractDir = mkdtempSync(join(tmpdir(), "fit-pathway-apm-extract-"));
    try {
      execFileSync("tar", ["-xzf", join(apmDir, archive), "-C", extractDir]);

      // Deployed layout: .claude/skills/ and .claude/agents/
      assert.ok(existsSync(join(extractDir, ".claude", "skills")));
      assert.ok(existsSync(join(extractDir, ".claude", "agents")));

      // Enriched lock file required by apm unpack
      assert.ok(existsSync(join(extractDir, "apm.lock.yaml")));

      const lockContent = await readFile(
        join(extractDir, "apm.lock.yaml"),
        "utf8",
      );
      assert.match(lockContent, /^lockfile_version: '1'/m);
      assert.match(lockContent, /^pack:$/m);
      assert.match(lockContent, /^\s+format: apm$/m);
      assert.match(lockContent, /^\s+target: claude$/m);
      assert.match(lockContent, /^dependencies:$/m);
      assert.match(lockContent, /deployed_files:/m);

      // Must NOT contain .apm/ source layout or per-bundle apm.yml
      assert.strictEqual(
        existsSync(join(extractDir, ".apm")),
        false,
        "APM bundle must not contain .apm/ source directory",
      );
      assert.strictEqual(
        existsSync(join(extractDir, "apm.yml")),
        false,
        "APM bundle must not contain per-bundle apm.yml",
      );

      // CLAUDE.md (team instructions) must be present
      assert.ok(
        existsSync(join(extractDir, ".claude", "CLAUDE.md")),
        "APM bundle must contain CLAUDE.md",
      );

      // settings.json must not be present
      assert.strictEqual(
        existsSync(join(extractDir, ".claude", "settings.json")),
        false,
        "APM bundle must not contain settings.json",
      );
    } finally {
      rmSync(extractDir, { recursive: true, force: true });
    }
  });

  test("APM bundle skills and agents match raw bundle content", async () => {
    const { discipline, track } = validCombinations[0];
    const abbrev = getDisciplineAbbreviation(discipline.id);
    const packName = `${abbrev}-${toKebabCase(track.id)}`;

    const rawDir = mkdtempSync(join(tmpdir(), "fit-pathway-raw-"));
    const apmDir = mkdtempSync(join(tmpdir(), "fit-pathway-apm-"));
    try {
      execFileSync("tar", [
        "-xzf",
        join(outputDir, "packs", "raw", `${packName}.tar.gz`),
        "-C",
        rawDir,
      ]);
      execFileSync("tar", [
        "-xzf",
        join(outputDir, "packs", "apm", `${packName}.tar.gz`),
        "-C",
        apmDir,
      ]);

      // Skills must be identical between raw and APM bundles
      const rawSkills = await readdir(join(rawDir, ".claude", "skills"));
      const apmSkills = await readdir(join(apmDir, ".claude", "skills"));
      assert.deepStrictEqual(rawSkills.sort(), apmSkills.sort());

      for (const skill of rawSkills) {
        const rawContent = await readFile(
          join(rawDir, ".claude", "skills", skill, "SKILL.md"),
          "utf8",
        );
        const apmContent = await readFile(
          join(apmDir, ".claude", "skills", skill, "SKILL.md"),
          "utf8",
        );
        assert.strictEqual(
          rawContent,
          apmContent,
          `SKILL.md differs for ${skill}`,
        );
      }

      // Agents must be identical (same .md filenames, same content)
      const rawAgents = await readdir(join(rawDir, ".claude", "agents"));
      const apmAgents = await readdir(join(apmDir, ".claude", "agents"));
      assert.deepStrictEqual(rawAgents.sort(), apmAgents.sort());

      for (const file of rawAgents) {
        const rawContent = await readFile(
          join(rawDir, ".claude", "agents", file),
          "utf8",
        );
        const apmContent = await readFile(
          join(apmDir, ".claude", "agents", file),
          "utf8",
        );
        assert.strictEqual(
          rawContent,
          apmContent,
          `agent ${file} content differs`,
        );
      }

      // CLAUDE.md (team instructions) must be identical
      const rawClaude = await readFile(
        join(rawDir, ".claude", "CLAUDE.md"),
        "utf8",
      );
      const apmClaude = await readFile(
        join(apmDir, ".claude", "CLAUDE.md"),
        "utf8",
      );
      assert.strictEqual(rawClaude, apmClaude, "CLAUDE.md content differs");
    } finally {
      rmSync(rawDir, { recursive: true, force: true });
      rmSync(apmDir, { recursive: true, force: true });
    }
  });

  test("apm.lock.yaml deployed_files lists all bundle files", async () => {
    const { discipline, track } = validCombinations[0];
    const abbrev = getDisciplineAbbreviation(discipline.id);
    const packName = `${abbrev}-${toKebabCase(track.id)}`;

    const extractDir = mkdtempSync(join(tmpdir(), "fit-pathway-apm-lock-"));
    try {
      execFileSync("tar", [
        "-xzf",
        join(outputDir, "packs", "apm", `${packName}.tar.gz`),
        "-C",
        extractDir,
      ]);

      const lockContent = await readFile(
        join(extractDir, "apm.lock.yaml"),
        "utf8",
      );

      // Every .claude/ file in the bundle must appear in deployed_files
      const actualFiles = [];
      const walk = async (dir, prefix) => {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const rel = `${prefix}/${entry.name}`;
          if (entry.isDirectory()) {
            await walk(join(dir, entry.name), rel);
          } else {
            actualFiles.push(rel);
          }
        }
      };
      await walk(join(extractDir, ".claude"), ".claude");
      actualFiles.sort();

      for (const file of actualFiles) {
        assert.ok(
          lockContent.includes(`- ${file}`),
          `deployed_files should list ${file}`,
        );
      }
    } finally {
      rmSync(extractDir, { recursive: true, force: true });
    }
  });
});
