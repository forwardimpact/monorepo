/**
 * Pack generation for Pathway distribution.
 *
 * Emits one pre-built agent/skill pack per valid discipline/track combination.
 * Each pack becomes its own `npx skills`-compatible repository at
 * `packs/{name}/.well-known/skills/`, with an aggregate repository at
 * `packs/.well-known/skills/` listing every skill from every pack.
 * An `apm.yml` for Microsoft APM is also written at the site root.
 *
 * See specs/320-pathway-ecosystem-distribution for context.
 *
 * Invoked from build.js after the distribution bundle has been generated.
 */

import { mkdir, rm, readFile, writeFile, readdir, cp } from "fs/promises";
import { utimesSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import { createHash } from "crypto";

import { createDataLoader } from "@forwardimpact/map/loader";
import { createTemplateLoader } from "@forwardimpact/libtemplate";
import {
  generateStageAgentProfile,
  deriveReferenceLevel,
  deriveAgentSkills,
  generateSkillMarkdown,
  interpolateTeamInstructions,
  getDisciplineAbbreviation,
  toKebabCase,
} from "@forwardimpact/libskill/agent";

import { formatAgentProfile } from "../formatters/agent/profile.js";
import {
  formatAgentSkill,
  formatInstallScript,
  formatReference,
} from "../formatters/agent/skill.js";
import { findValidCombinations } from "./agent.js";

/**
 * Slugify a string for use as a package name.
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Stringify a JSON value with object keys sorted recursively.
 * Produces deterministic output for digest stability.
 * @param {unknown} value
 * @returns {string}
 */
function stringifySorted(value) {
  const seen = new WeakSet();
  const sort = (v) => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v)) throw new Error("Cannot stringify circular structure");
    seen.add(v);
    if (Array.isArray(v)) return v.map(sort);
    const out = {};
    for (const key of Object.keys(v).sort()) out[key] = sort(v[key]);
    return out;
  };
  return JSON.stringify(sort(value), null, 2) + "\n";
}

/**
 * Escape a YAML scalar double-quoted value.
 * @param {string} text
 * @returns {string}
 */
function yamlQuote(text) {
  return `"${String(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Write a single pack's files to disk under the staging directory.
 * Calls the formatters directly (silent, no console output).
 * @param {Object} params
 * @returns {Promise<void>}
 */
async function writePackFiles({
  packDir,
  profiles,
  skillFiles,
  teamInstructions,
  agentTemplate,
  skillTemplates,
  claudeCodeSettings,
}) {
  const claudeDir = join(packDir, ".claude");
  const agentsDir = join(claudeDir, "agents");
  const skillsDir = join(claudeDir, "skills");

  await mkdir(agentsDir, { recursive: true });
  await mkdir(skillsDir, { recursive: true });

  for (const profile of profiles) {
    const profilePath = join(agentsDir, profile.filename);
    await writeFile(
      profilePath,
      formatAgentProfile(profile, agentTemplate),
      "utf-8",
    );
  }

  for (const skill of skillFiles) {
    const skillDir = join(skillsDir, skill.dirname);
    await mkdir(skillDir, { recursive: true });

    await writeFile(
      join(skillDir, "SKILL.md"),
      formatAgentSkill(skill, skillTemplates.skill),
      "utf-8",
    );

    if (skill.installScript) {
      const scriptsDir = join(skillDir, "scripts");
      await mkdir(scriptsDir, { recursive: true });
      await writeFile(
        join(scriptsDir, "install.sh"),
        formatInstallScript(skill, skillTemplates.install),
        { mode: 0o755 },
      );
    }

    if (skill.implementationReference) {
      const refsDir = join(skillDir, "references");
      await mkdir(refsDir, { recursive: true });
      await writeFile(
        join(refsDir, "REFERENCE.md"),
        formatReference(skill, skillTemplates.reference),
        "utf-8",
      );
    }
  }

  if (teamInstructions) {
    await writeFile(
      join(claudeDir, "CLAUDE.md"),
      teamInstructions.trim() + "\n",
      "utf-8",
    );
  }

  // Claude Code settings — matches the CLI path's generateClaudeCodeSettings
  // output format (no merge with existing files since the staging dir starts
  // empty).
  const settings = { ...(claudeCodeSettings || {}) };
  await writeFile(
    join(claudeDir, "settings.json"),
    JSON.stringify(settings, null, 2) + "\n",
    "utf-8",
  );
}

/**
 * Derive profiles, skills, and team instructions for a single combination.
 * @param {Object} params
 * @returns {{profiles: Array, skillFiles: Array, teamInstructions: string|null}}
 */
function derivePackContent({
  discipline,
  track,
  humanDiscipline,
  humanTrack,
  data,
  agentData,
  skillsWithAgent,
  level,
}) {
  const stageParams = {
    discipline: humanDiscipline,
    track: humanTrack,
    level,
    skills: skillsWithAgent,
    behaviours: data.behaviours,
    agentBehaviours: agentData.behaviours,
    agentDiscipline: discipline,
    agentTrack: track,
    stages: data.stages,
  };

  const profiles = data.stages.map((stage) =>
    generateStageAgentProfile({ ...stageParams, stage }),
  );

  const derivedSkills = deriveAgentSkills({
    discipline: humanDiscipline,
    track: humanTrack,
    level,
    skills: skillsWithAgent,
  });

  const skillFiles = derivedSkills
    .map((derived) => skillsWithAgent.find((s) => s.id === derived.skillId))
    .filter((skill) => skill?.agent)
    .map((skill) =>
      generateSkillMarkdown({ skillData: skill, stages: data.stages }),
    );

  const teamInstructions = interpolateTeamInstructions({
    agentTrack: track,
    humanDiscipline,
  });

  return { profiles, skillFiles, teamInstructions };
}

/**
 * Recursively collect all paths (files and directories) under `dir`,
 * relative to `dir`, in sorted order.
 */
async function collectPaths(dir, prefix = ".") {
  const entries = await readdir(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const rel = prefix + "/" + entry.name;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(rel);
      result.push(...(await collectPaths(abs, rel)));
    } else {
      result.push(rel);
    }
  }
  return result;
}

/**
 * Set mtime and atime to the Unix epoch for every entry under `dir`.
 */
async function resetTimestamps(dir) {
  const epoch = new Date(0);
  const paths = await collectPaths(dir);
  for (const rel of paths) {
    utimesSync(join(dir, rel), epoch, epoch);
  }
  utimesSync(dir, epoch, epoch);
}

/**
 * Archive a staged pack directory as a deterministic tar.gz and return its
 * sha256 digest.
 *
 * Determinism strategy (works on GNU tar and BSD tar):
 *  1. Reset all file timestamps to epoch via Node's utimesSync.
 *  2. Collect and sort the file list in JS — no reliance on --sort=name.
 *  3. Create an uncompressed tar to stdout with the sorted list.
 *  4. Pipe through `gzip -n` to suppress the gzip header timestamp.
 *
 * @param {string} packDir - Staging directory containing the pack files
 * @param {string} archivePath - Destination path for the tar.gz
 * @returns {Promise<string>} sha256 digest string (e.g. "sha256:abc...")
 */
async function archivePack(packDir, archivePath) {
  await resetTimestamps(packDir);

  const files = await collectPaths(packDir);
  files.sort();

  const tarBuf = execFileSync("tar", ["-cf", "-", "-C", packDir, ...files]);
  const gzBuf = execFileSync("gzip", ["-n"], { input: tarBuf });
  await writeFile(archivePath, gzBuf);

  const bytes = await readFile(archivePath);
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

/**
 * Collect all file paths under `dir`, relative to `dir`, for the manifest
 * `files` array. Returns sorted paths with forward slashes.
 * @param {string} dir
 * @param {string} [prefix]
 * @returns {Promise<string[]>}
 */
async function collectFileList(dir, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const rel = prefix ? prefix + "/" + entry.name : entry.name;
    if (entry.isDirectory()) {
      result.push(...(await collectFileList(join(dir, entry.name), rel)));
    } else {
      result.push(rel);
    }
  }
  return result.sort();
}

/**
 * Parse YAML frontmatter from a SKILL.md file. Returns an object with
 * the key/value pairs found between the `---` fences.
 * @param {string} content
 * @returns {Record<string, string>}
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return result;
}

/**
 * Build a single skill index entry from a staged skill directory.
 * @param {string} skillDir - Path containing SKILL.md and optional extras
 * @param {string} name - Skill name for the manifest
 * @returns {Promise<{name: string, description: string, files: string[]}>}
 */
async function buildSkillEntry(skillDir, name) {
  const skillMd = await readFile(join(skillDir, "SKILL.md"), "utf-8");
  const fm = parseFrontmatter(skillMd);
  const files = await collectFileList(skillDir);
  return { description: fm.description || "", files, name };
}

/**
 * Write a `npx skills`-compatible repository for a single pack.
 *
 * Each pack becomes its own skill repository at
 * `packs/{name}/.well-known/skills/` so that individual skills
 * within the pack can be discovered and installed independently:
 *
 *   npx skills add domain.org/packs/se-platform --all
 *   npx skills add domain.org/packs/se-platform -s architecture-design
 *
 * @param {string} packsOutputDir - The `packs/` output directory
 * @param {string} packStagingDir - Staging directory for this pack
 * @param {string} packName - Pack name (e.g. "se-platform")
 * @returns {Promise<Array<{name: string, description: string, files: string[]}>>}
 *   The skill entries written, for use in the aggregate manifest.
 */
async function writePackRepository(packsOutputDir, packStagingDir, packName) {
  const wellKnownDir = join(packsOutputDir, packName, ".well-known", "skills");
  await mkdir(wellKnownDir, { recursive: true });

  // Discover individual skills from the staged pack's .claude/skills/
  const skillsSrcDir = join(packStagingDir, ".claude", "skills");
  const skillDirs = (
    await readdir(skillsSrcDir, { withFileTypes: true })
  ).filter((e) => e.isDirectory());

  const entries = [];
  for (const dir of skillDirs) {
    const src = join(skillsSrcDir, dir.name);
    const dest = join(wellKnownDir, dir.name);
    await cp(src, dest, { recursive: true });
    entries.push(await buildSkillEntry(dest, dir.name));
  }

  const manifest = {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: entries,
  };
  await writeFile(
    join(wellKnownDir, "index.json"),
    stringifySorted(manifest),
    "utf-8",
  );

  return entries;
}

/**
 * Write an aggregate `npx skills` repository at `packs/` that lists every
 * unique skill across all packs. Skills with the same name produce identical
 * SKILL.md content regardless of discipline/track, so we deduplicate by name
 * and write one copy.
 *
 *   npx skills add domain.org/packs --list
 *
 * @param {string} packsOutputDir
 * @param {Array<{packName: string, entries: Array}>} allPackEntries
 */
async function writeAggregateRepository(packsOutputDir, allPackEntries) {
  const wellKnownDir = join(packsOutputDir, ".well-known", "skills");
  await mkdir(wellKnownDir, { recursive: true });

  // Deduplicate: first occurrence of each skill name wins (content is identical)
  const seen = new Map();
  for (const { packName, entries } of allPackEntries) {
    for (const entry of entries) {
      if (seen.has(entry.name)) continue;
      seen.set(entry.name, { packName, entry });
    }
  }

  const skills = [];
  for (const [, { packName, entry }] of seen) {
    const dest = join(wellKnownDir, entry.name);
    const src = join(
      packsOutputDir,
      packName,
      ".well-known",
      "skills",
      entry.name,
    );
    await cp(src, dest, { recursive: true });
    skills.push(entry);
  }

  const manifest = {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills,
  };
  await writeFile(
    join(wellKnownDir, "index.json"),
    stringifySorted(manifest),
    "utf-8",
  );
}

/**
 * Write the Microsoft APM manifest at the site root.
 * @param {string} outputDir
 * @param {Array<{name: string, description: string, url: string, digest: string}>} packs
 * @param {string} version
 * @param {string} frameworkTitle
 */
async function writeApmManifest(outputDir, packs, version, frameworkTitle) {
  const lines = [
    `name: ${slugify(frameworkTitle)}`,
    `version: ${version}`,
    `description: ${yamlQuote(`${frameworkTitle} agent teams for Claude Code`)}`,
    "",
    "skills:",
  ];
  for (const pack of packs) {
    lines.push(`  - name: ${pack.name}`);
    lines.push(`    description: ${yamlQuote(pack.description)}`);
    lines.push(`    version: ${version}`);
    lines.push(`    url: ${yamlQuote(pack.url)}`);
    lines.push(`    digest: ${yamlQuote(pack.digest)}`);
  }
  lines.push("");
  await writeFile(join(outputDir, "apm.yml"), lines.join("\n"), "utf-8");
}

/**
 * Generate pre-built agent/skill packs for installation through ecosystem
 * tools like `npx skills` and Microsoft APM. One pack per valid
 * discipline/track combination.
 *
 * @param {Object} params
 * @param {string} params.outputDir - Build output directory
 * @param {string} params.dataDir - Source data directory
 * @param {string} params.siteUrl - Base URL for the published site
 * @param {Object} params.framework - Framework configuration
 * @param {string} params.version - Pathway package version
 * @param {string} params.templatesDir - Absolute path to pathway/templates
 */
export async function generatePacks({
  outputDir,
  dataDir,
  siteUrl,
  framework,
  version,
  templatesDir,
}) {
  console.log("📦 Generating agent/skill packs...");

  const normalizedSiteUrl = siteUrl.replace(/\/$/, "");
  const frameworkTitle = framework.title || "Engineering Pathway";

  const loader = createDataLoader();
  const templateLoader = createTemplateLoader(templatesDir);

  const data = await loader.loadAllData(dataDir);
  const agentData = await loader.loadAgentData(dataDir);
  const skillsWithAgent = await loader.loadSkillsWithAgentData(dataDir);

  const level = deriveReferenceLevel(data.levels);

  const agentTemplate = templateLoader.load("agent.template.md", dataDir);
  const skillTemplates = {
    skill: templateLoader.load("skill.template.md", dataDir),
    install: templateLoader.load("skill-install.template.sh", dataDir),
    reference: templateLoader.load("skill-reference.template.md", dataDir),
  };

  const stagingDir = join(outputDir, "_packs");
  const packsDir = join(outputDir, "packs");
  await mkdir(stagingDir, { recursive: true });
  await mkdir(packsDir, { recursive: true });

  const combinations = findValidCombinations(data, agentData);
  if (combinations.length === 0) {
    console.log("   (no valid discipline/track combinations — skipping)");
    await rm(stagingDir, { recursive: true, force: true });
    return;
  }

  const packs = [];

  for (const combination of combinations) {
    const { discipline, track, humanDiscipline, humanTrack } = combination;
    const abbrev = getDisciplineAbbreviation(discipline.id);
    const agentName = `${abbrev}-${toKebabCase(track.id)}`;
    const specName = humanDiscipline.specialization || humanDiscipline.name;
    const description = `${specName} (${humanTrack.name}) — agent team`;

    const { profiles, skillFiles, teamInstructions } = derivePackContent({
      ...combination,
      data,
      agentData,
      skillsWithAgent,
      level,
    });

    const packDir = join(stagingDir, agentName);
    await writePackFiles({
      packDir,
      profiles,
      skillFiles,
      teamInstructions,
      agentTemplate,
      skillTemplates,
      claudeCodeSettings: agentData.claudeCodeSettings,
    });

    const archivePath = join(packsDir, `${agentName}.tar.gz`);
    const digest = await archivePack(packDir, archivePath);

    packs.push({
      name: agentName,
      description,
      url: `${normalizedSiteUrl}/packs/${agentName}.tar.gz`,
      digest,
    });

    console.log(`   ✓ packs/${agentName}.tar.gz`);
  }

  // Write per-pack skill repositories (one per discipline/track combination)
  const allPackEntries = [];
  for (const pack of packs) {
    const entries = await writePackRepository(
      packsDir,
      join(stagingDir, pack.name),
      pack.name,
    );
    allPackEntries.push({ packName: pack.name, entries });
    console.log(
      `   ✓ packs/${pack.name}/.well-known/skills/ (${entries.length} skills)`,
    );
  }

  // Write aggregate repository at packs/ level
  await writeAggregateRepository(packsDir, allPackEntries);
  console.log("   ✓ packs/.well-known/skills/index.json (aggregate)");

  await rm(stagingDir, { recursive: true, force: true });

  await writeApmManifest(outputDir, packs, version, frameworkTitle);
  console.log("   ✓ apm.yml");
}
