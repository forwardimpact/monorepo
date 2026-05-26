/**
 * Tests for agent/skill pack generation in build.js — Pathway Ecosystem
 * Distribution. APM bundle tests are in build-packs-apm.test.js.
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
import { createTemplateLoader } from "@forwardimpact/libtemplate";
import {
  getDisciplineAbbreviation,
  toKebabCase,
} from "@forwardimpact/libskill/agent";
import { generateJobTitle } from "@forwardimpact/libskill/derivation";
import { generatePacks } from "../src/commands/build-packs.js";
import {
  findValidCombinations,
  runAgentCommand,
} from "../src/commands/agent.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const starterDir = join(__dirname, "..", "..", "map", "starter");
const pathwayPkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
);

const siteUrl = "https://example.test";
const standard = { title: "Engineering Pathway" };

/**
 * Silence console.log for the duration of a callback. generatePacks logs
 * progress lines; tests don't need to see them.
 */
async function silent(fn) {
  const original = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = original;
  }
}

/**
 * Recursively collect all files under `root` into a Map of relative-path to Buffer.
 */
async function walkDir(root, rel = "") {
  const out = new Map();
  const full = join(root, rel);
  const entries = await readdir(full, { withFileTypes: true });
  for (const entry of entries) {
    const relPath = rel ? join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) {
      for (const [k, v] of await walkDir(root, relPath)) out.set(k, v);
    } else {
      out.set(relPath, await readFile(join(root, relPath)));
    }
  }
  return out;
}

/**
 * Assert every file in `cliFiles` exists in `packFiles` with identical bytes.
 */
function assertFilesMatch(cliFiles, packFiles) {
  for (const [relPath, cliBytes] of cliFiles) {
    assert.ok(
      packFiles.has(relPath),
      `pack is missing ${relPath} produced by CLI`,
    );
    const packBytes = packFiles.get(relPath);
    assert.ok(
      packBytes.equals(cliBytes),
      `pack file ${relPath} differs from CLI output`,
    );
  }
}

describe("generatePacks", () => {
  let workDir;
  let outputDir;
  let validCombinations;
  let data;

  before(async () => {
    workDir = mkdtempSync(join(tmpdir(), "fit-pathway-packs-test-"));
    outputDir = join(workDir, "public");
    await mkdir(outputDir, { recursive: true });

    const loader = createDataLoader();
    data = await loader.loadAllData(starterDir);
    const agentData = await loader.loadAgentData(starterDir);
    validCombinations = findValidCombinations(data, agentData);

    await silent(() =>
      generatePacks({
        outputDir,
        dataDir: starterDir,
        siteUrl,
        standard,
        version: pathwayPkg.version,
        templatesDir: join(__dirname, "..", "templates"),
      }),
    );
  });

  after(() => {
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  });

  test("starter data has at least one valid combination", () => {
    assert.ok(
      validCombinations.length > 0,
      "expected starter data to produce valid combinations",
    );
  });

  test("starter renders software_engineering × J060 without duplicated role token or broken autonomy", () => {
    const swDiscipline = data.disciplines.find(
      (d) => d.id === "software_engineering",
    );
    const j060 = data.levels.find((l) => l.id === "J060");
    assert.ok(
      swDiscipline && j060,
      "starter must contain software_engineering + J060",
    );

    const title = generateJobTitle({ discipline: swDiscipline, level: j060 });
    const occurrences = title.split("Software Engineer").length - 1;
    assert.strictEqual(
      occurrences,
      1,
      `expected one role-title occurrence in ${JSON.stringify(title)}`,
    );

    const autonomy = j060.expectations.autonomyExpectation;
    const sentence = `You will ${autonomy.toLowerCase()}`;
    assert.doesNotMatch(
      sentence,
      /You will (works|owns|drives|leads|defines)/i,
      "no broken verb agreement",
    );
  });

  test("emits one raw and one APM archive per valid combination", async () => {
    const rawEntries = await readdir(join(outputDir, "packs", "raw"));
    const apmEntries = await readdir(join(outputDir, "packs", "apm"));
    const rawArchives = rawEntries.filter((n) => n.endsWith(".tar.gz"));
    const apmArchives = apmEntries.filter((n) => n.endsWith(".tar.gz"));
    assert.strictEqual(rawArchives.length, validCombinations.length);
    assert.strictEqual(apmArchives.length, validCombinations.length);
  });

  test("staging directory _packs/ is cleaned up", () => {
    assert.strictEqual(existsSync(join(outputDir, "_packs")), false);
  });

  test("each raw archive expands to the Claude Code file layout", async () => {
    const rawDir = join(outputDir, "packs", "raw");
    const entries = await readdir(rawDir);
    const archive = entries.find((n) => n.endsWith(".tar.gz"));
    assert.ok(archive, "expected at least one raw archive");

    const extractDir = mkdtempSync(join(tmpdir(), "fit-pathway-extract-"));
    try {
      execFileSync("tar", ["-xzf", join(rawDir, archive), "-C", extractDir]);
      assert.ok(existsSync(join(extractDir, ".claude", "agents")));
      assert.ok(existsSync(join(extractDir, ".claude", "skills")));
      assert.ok(existsSync(join(extractDir, ".claude", "settings.json")));
    } finally {
      rmSync(extractDir, { recursive: true, force: true });
    }
  });

  test("each pack has its own skill repository with individual skills", async () => {
    const skillsDir = join(outputDir, "packs", "skills");
    const { discipline, track } = validCombinations[0];
    const abbrev = getDisciplineAbbreviation(discipline.id);
    const packName = `${abbrev}-${toKebabCase(track.id)}`;

    // Per-pack index must exist
    const manifestPath = join(
      skillsDir,
      packName,
      ".well-known",
      "skills",
      "index.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

    assert.strictEqual(
      manifest.$schema,
      "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    );
    assert.ok(Array.isArray(manifest.skills));
    assert.ok(
      manifest.skills.length > 0,
      "pack must contain at least one skill",
    );

    for (const entry of manifest.skills) {
      assert.strictEqual(typeof entry.name, "string");
      assert.strictEqual(typeof entry.description, "string");
      assert.ok(Array.isArray(entry.files), "entry must have files array");
      assert.ok(
        entry.files.includes("SKILL.md"),
        "files must include SKILL.md",
      );

      // Each file must exist in the per-pack well-known directory
      const skillDir = join(
        skillsDir,
        packName,
        ".well-known",
        "skills",
        entry.name,
      );
      for (const file of entry.files) {
        assert.ok(
          existsSync(join(skillDir, file)),
          `file ${file} missing for ${entry.name}`,
        );
      }

      // SKILL.md must have valid frontmatter
      const skillMd = await readFile(join(skillDir, "SKILL.md"), "utf8");
      assert.match(skillMd, /^---\nname: /);
      assert.match(skillMd, /\ndescription: /);
    }
  });

  test("every pack has a per-pack skill repository", async () => {
    for (const { discipline, track } of validCombinations) {
      const abbrev = getDisciplineAbbreviation(discipline.id);
      const packName = `${abbrev}-${toKebabCase(track.id)}`;
      const manifestPath = join(
        outputDir,
        "packs",
        "skills",
        packName,
        ".well-known",
        "skills",
        "index.json",
      );
      assert.ok(
        existsSync(manifestPath),
        `per-pack manifest missing for ${packName}`,
      );
    }
  });

  test("aggregate repository at packs/skills/ lists deduplicated skills", async () => {
    const manifestPath = join(
      outputDir,
      "packs",
      "skills",
      ".well-known",
      "skills",
      "index.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

    assert.strictEqual(
      manifest.$schema,
      "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    );
    assert.ok(Array.isArray(manifest.skills));
    assert.ok(manifest.skills.length > 0);

    // Entries use plain skill names (no pack prefix)
    for (const entry of manifest.skills) {
      assert.doesNotMatch(
        entry.name,
        /--/,
        `aggregate entry ${entry.name} must not be prefixed`,
      );
      assert.ok(Array.isArray(entry.files));
      assert.ok(entry.files.includes("SKILL.md"));

      // File must exist in the aggregate well-known directory
      const skillDir = join(
        outputDir,
        "packs",
        "skills",
        ".well-known",
        "skills",
        entry.name,
      );
      assert.ok(
        existsSync(join(skillDir, "SKILL.md")),
        `SKILL.md missing for aggregate entry ${entry.name}`,
      );
    }

    // Names must be unique (deduplicated)
    const names = manifest.skills.map((s) => s.name);
    assert.strictEqual(names.length, new Set(names).size, "duplicate names");

    // Count must be <= sum of per-pack skills (deduplicated ≤ total)
    let totalAcrossPacks = 0;
    for (const { discipline, track } of validCombinations) {
      const abbrev = getDisciplineAbbreviation(discipline.id);
      const packName = `${abbrev}-${toKebabCase(track.id)}`;
      const packManifest = JSON.parse(
        await readFile(
          join(
            outputDir,
            "packs",
            "skills",
            packName,
            ".well-known",
            "skills",
            "index.json",
          ),
          "utf8",
        ),
      );
      totalAcrossPacks += packManifest.skills.length;
    }
    assert.ok(
      manifest.skills.length <= totalAcrossPacks,
      "aggregate must have ≤ total per-pack skills",
    );
    assert.ok(
      manifest.skills.length < totalAcrossPacks,
      "deduplication should reduce the count",
    );
  });

  test("apm.yml is well-formed and lists every pack", async () => {
    const apm = await readFile(join(outputDir, "apm.yml"), "utf8");
    assert.match(apm, /^name: /m);
    assert.match(apm, /^dependencies:$/m);
    assert.match(apm, /^ {2}apm:$/m);
    assert.ok(
      apm.includes(`\nversion: ${pathwayPkg.version}\n`),
      "apm.yml must include pathway version",
    );

    const nameCount = (apm.match(/^ {4}- name: /gm) || []).length;
    assert.strictEqual(nameCount, validCombinations.length);

    const urlCount = (apm.match(/^ {6}url: "https:\/\/example\.test/gm) || [])
      .length;
    assert.strictEqual(urlCount, validCombinations.length);
  });

  test("pack contents match CLI agent output for the same combination", async () => {
    // Generate agent files via the CLI path into a tmp dir
    const loader = createDataLoader();
    const templateLoader = createTemplateLoader(
      join(__dirname, "..", "templates"),
    );
    const data = await loader.loadAllData(starterDir);

    const { discipline, track } = validCombinations[0];
    const agentName = `${getDisciplineAbbreviation(discipline.id)}-${toKebabCase(track.id)}`;

    const cliOutputDir = mkdtempSync(join(tmpdir(), "fit-pathway-cli-"));
    try {
      await silent(() =>
        runAgentCommand({
          data,
          args: [discipline.id],
          options: { track: track.id, output: cliOutputDir },
          dataDir: starterDir,
          templateLoader,
          loader,
        }),
      );

      // Extract the matching pack archive
      const extractDir = mkdtempSync(join(tmpdir(), "fit-pathway-pack-"));
      try {
        execFileSync("tar", [
          "-xzf",
          join(outputDir, "packs", "raw", `${agentName}.tar.gz`),
          "-C",
          extractDir,
        ]);

        const cliFiles = await walkDir(join(cliOutputDir, ".claude"));
        const packFiles = await walkDir(join(extractDir, ".claude"));

        assertFilesMatch(cliFiles, packFiles);
      } finally {
        rmSync(extractDir, { recursive: true, force: true });
      }
    } finally {
      rmSync(cliOutputDir, { recursive: true, force: true });
    }
  });

  test("emits one APM git repo per combination", async () => {
    const apmDir = join(outputDir, "packs", "apm");
    const entries = await readdir(apmDir);
    const gitRepos = entries.filter((n) => !n.endsWith(".tar.gz"));
    assert.strictEqual(gitRepos.length, validCombinations.length);
  });

  test("APM git repo clones and yields APM bundle layout", async () => {
    const { discipline, track } = validCombinations[0];
    const abbrev = getDisciplineAbbreviation(discipline.id);
    const packName = `${abbrev}-${toKebabCase(track.id)}`;
    const repoPath = join(outputDir, "packs", "apm", packName);
    const cloneDir = mkdtempSync(join(tmpdir(), "fit-pathway-apm-clone-"));

    const cleanEnv = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
    );

    try {
      execFileSync("git", ["clone", repoPath, cloneDir], { env: cleanEnv });
      assert.ok(existsSync(join(cloneDir, "skills")));
      assert.ok(existsSync(join(cloneDir, ".apm", "agents")));
      assert.ok(existsSync(join(cloneDir, "apm.yml")));
    } finally {
      rmSync(cloneDir, { recursive: true, force: true });
    }
  });

  test("git repos have version tag", async () => {
    const { discipline, track } = validCombinations[0];
    const abbrev = getDisciplineAbbreviation(discipline.id);
    const packName = `${abbrev}-${toKebabCase(track.id)}`;
    const repoPath = join(outputDir, "packs", "apm", packName);

    const cleanEnv = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
    );

    const tags = execFileSync("git", ["ls-remote", "--tags", repoPath], {
      env: cleanEnv,
    }).toString();
    assert.ok(tags.includes(`refs/tags/v${pathwayPkg.version}`));
  });

  test("second build produces byte-identical archives and manifests", async () => {
    const secondDir = join(workDir, "public2");
    await mkdir(secondDir, { recursive: true });
    await silent(() =>
      generatePacks({
        outputDir: secondDir,
        dataDir: starterDir,
        siteUrl,
        standard,
        version: pathwayPkg.version,
        templatesDir: join(__dirname, "..", "templates"),
      }),
    );

    // Raw archives must be identical
    const firstRaw = (await readdir(join(outputDir, "packs", "raw"))).sort();
    const secondRaw = (await readdir(join(secondDir, "packs", "raw"))).sort();
    assert.deepStrictEqual(firstRaw, secondRaw);

    for (const name of firstRaw) {
      const a = await readFile(join(outputDir, "packs", "raw", name));
      const b = await readFile(join(secondDir, "packs", "raw", name));
      assert.ok(a.equals(b), `raw/${name} differs between builds`);
    }

    // APM archives must be identical
    const firstApmEntries = (
      await readdir(join(outputDir, "packs", "apm"))
    ).sort();
    const secondApmEntries = (
      await readdir(join(secondDir, "packs", "apm"))
    ).sort();
    const firstApmTar = firstApmEntries.filter((n) => n.endsWith(".tar.gz"));
    const secondApmTar = secondApmEntries.filter((n) => n.endsWith(".tar.gz"));
    assert.deepStrictEqual(firstApmTar, secondApmTar);

    for (const name of firstApmTar) {
      const a = await readFile(join(outputDir, "packs", "apm", name));
      const b = await readFile(join(secondDir, "packs", "apm", name));
      assert.ok(a.equals(b), `apm/${name} differs between builds`);
    }

    // Aggregate manifest must be identical
    const firstAggregate = await readFile(
      join(outputDir, "packs", "skills", ".well-known", "skills", "index.json"),
      "utf8",
    );
    const secondAggregate = await readFile(
      join(secondDir, "packs", "skills", ".well-known", "skills", "index.json"),
      "utf8",
    );
    assert.strictEqual(firstAggregate, secondAggregate);

    // Per-pack skill manifests must be identical
    const firstSkillPacks = (
      await readdir(join(outputDir, "packs", "skills"))
    ).filter((n) => n !== ".well-known");
    for (const packName of firstSkillPacks) {
      const first = await readFile(
        join(
          outputDir,
          "packs",
          "skills",
          packName,
          ".well-known",
          "skills",
          "index.json",
        ),
        "utf8",
      );
      const second = await readFile(
        join(
          secondDir,
          "packs",
          "skills",
          packName,
          ".well-known",
          "skills",
          "index.json",
        ),
        "utf8",
      );
      assert.strictEqual(first, second, `manifest for ${packName} differs`);
    }

    // APM git repos must be byte-identical
    const gitRepos = firstApmEntries.filter((n) => !n.endsWith(".tar.gz"));
    for (const repo of gitRepos) {
      const firstFiles = await walkDir(join(outputDir, "packs", "apm", repo));
      const secondFiles = await walkDir(join(secondDir, "packs", "apm", repo));
      const firstKeys = [...firstFiles.keys()].sort();
      const secondKeys = [...secondFiles.keys()].sort();
      assert.deepStrictEqual(
        firstKeys,
        secondKeys,
        `git repo apm/${repo} file list differs`,
      );
      for (const key of firstKeys) {
        assert.ok(
          firstFiles.get(key).equals(secondFiles.get(key)),
          `git repo apm/${repo}/${key} differs between builds`,
        );
      }
    }

    const firstApmYml = await readFile(join(outputDir, "apm.yml"), "utf8");
    const secondApmYml = await readFile(join(secondDir, "apm.yml"), "utf8");
    assert.strictEqual(firstApmYml, secondApmYml);
  });
});
