/**
 * Pack generation for Pathway distribution.
 *
 * Emits one pre-built agent/skill pack per valid discipline/track combination
 * across four distribution channels, organized by channel prefix:
 *  - Raw — `.claude/` layout archived as `raw/{name}.tar.gz` (curl | tar)
 *  - APM — deployed `.claude/` layout + `apm.lock.yaml` as `apm/{name}.tar.gz` (apm unpack)
 *  - APM git — bare git repo at `apm/{name}/` (apm install)
 *  - Skills — `.well-known/skills/` repository at `skills/{name}/` (`npx skills add`)
 *
 * An `apm.yml` project manifest for Microsoft APM is written at the site root.
 *
 * See specs/0520-apm-compatible-packs and specs/0700-git-installable-packs.
 *
 * Invoked from build.js after the distribution bundle has been generated.
 */

import { writeFile } from "fs/promises";
import { join } from "path";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDataLoader } from "@forwardimpact/map/loader";

const logger = createLogger("pathway");
import { createTemplateLoader } from "@forwardimpact/libtemplate";
import {
  generateAgentProfile,
  deriveReferenceLevel,
  deriveAgentSkills,
  generateSkillMarkdown,
  interpolateTeamInstructions,
  renderOrganizationalContext,
  getDisciplineAbbreviation,
  toKebabCase,
} from "@forwardimpact/libskill/agent";

import {
  PackBuilder,
  PackStager,
  TarEmitter,
  GitEmitter,
  DiscEmitter,
} from "@forwardimpact/libpack";
import { formatAgentProfile } from "../formatters/agent/profile.js";
import {
  formatAgentSkill,
  formatInstallScript,
  formatReference,
} from "../formatters/agent/skill.js";
import { formatTeamInstructions } from "../formatters/agent/team-instructions.js";
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
 * Escape a YAML scalar double-quoted value.
 * @param {string} text
 * @returns {string}
 */
function yamlQuote(text) {
  return `"${String(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
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
  const profile = generateAgentProfile({
    discipline: humanDiscipline,
    track: humanTrack,
    level,
    skills: skillsWithAgent,
    capabilities: data.capabilities,
    behaviours: data.behaviours,
    agentBehaviours: agentData.behaviours,
    agentDiscipline: discipline,
    agentTrack: track,
  });
  const profiles = [profile];

  const derivedSkills = deriveAgentSkills({
    discipline: humanDiscipline,
    track: humanTrack,
    level,
    skills: skillsWithAgent,
    capabilities: data.capabilities,
  });

  const skillFiles = derivedSkills
    .map((derived) => skillsWithAgent.find((s) => s.id === derived.skillId))
    .filter((skill) => skill?.agent)
    .map((skill) => generateSkillMarkdown({ skillData: skill }));

  const teamInstructions = interpolateTeamInstructions({
    agentTrack: track,
    humanDiscipline,
  });
  const orgSection = renderOrganizationalContext(
    agentData.organizationalContext,
  );

  return { profiles, skillFiles, teamInstructions, orgSection };
}

/**
 * Bridge Pathway formatters to libpack's PackStager.stageFull input shape.
 */
function formatContent(
  { profiles, skillFiles, teamInstructions, orgSection },
  templates,
  settings,
) {
  return {
    agents: profiles.map((p) => ({
      filename: p.filename,
      content: formatAgentProfile(p, templates.agent),
    })),
    skills: skillFiles.map((s) => ({
      dirname: s.dirname,
      files: [
        { path: "SKILL.md", content: formatAgentSkill(s, templates.skill) },
        ...(s.installScript
          ? [
              {
                path: "scripts/install.sh",
                content: formatInstallScript(s, templates.install),
                mode: 0o755,
              },
            ]
          : []),
        ...(s.references || []).map((ref) => ({
          path: `references/${ref.name}.md`,
          content: formatReference(ref, templates.reference),
        })),
      ],
    })),
    teamInstructions: formatTeamInstructions(
      teamInstructions,
      orgSection,
      templates.claude,
    ),
    claudeSettings: settings.claude,
    vscodeSettings: settings.vscode,
  };
}

/**
 * Write the Microsoft APM project manifest at the site root.
 * @param {string} outputDir
 * @param {Array<{name: string, description: string, url: string}>} packs
 * @param {string} version
 * @param {string} standardTitle
 */
async function writeApmManifest(outputDir, packs, version, standardTitle) {
  const lines = [
    `name: ${slugify(standardTitle)}`,
    `version: ${version}`,
    `description: ${yamlQuote(`${standardTitle} agent teams for Claude Code`)}`,
    "",
    "dependencies:",
    "  apm:",
  ];
  for (const pack of packs) {
    lines.push(`    - name: ${pack.name}`);
    lines.push(`      description: ${yamlQuote(pack.description)}`);
    lines.push(`      url: ${yamlQuote(pack.url)}`);
  }
  lines.push("");
  await writeFile(join(outputDir, "apm.yml"), lines.join("\n"), "utf-8");
}

/**
 * Generate pre-built agent/skill packs for installation through ecosystem
 * tools like `npx skills`, Microsoft APM, and `git clone`. One pack per
 * valid discipline/track combination.
 *
 * @param {Object} params
 * @param {string} params.outputDir - Build output directory
 * @param {string} params.dataDir - Source data directory
 * @param {string} params.siteUrl - Base URL for the published site
 * @param {Object} params.standard - Standard configuration
 * @param {string} params.version - Pathway package version
 * @param {string} params.templatesDir - Absolute path to pathway/templates
 */
export async function generatePacks({
  outputDir,
  dataDir,
  siteUrl,
  standard,
  version,
  templatesDir,
}) {
  logger.info("📦 Generating agent/skill packs...");

  const normalizedSiteUrl = siteUrl.replace(/\/$/, "");
  const standardTitle = standard.title || "Engineering Pathway";

  const loader = createDataLoader();
  const templateLoader = createTemplateLoader(templatesDir);

  const data = await loader.loadAndValidate(dataDir);
  const agentData = await loader.loadAgentData(dataDir);
  const skillsWithAgent = await loader.loadSkillsWithAgentData(dataDir);

  const level = deriveReferenceLevel(data.levels);

  const agentTemplate = templateLoader.load("agent.template.md", dataDir);
  const claudeTemplate = templateLoader.load("claude.template.md", dataDir);
  const skillTemplates = {
    skill: templateLoader.load("skill.template.md", dataDir),
    install: templateLoader.load("skill-install.template.sh", dataDir),
    reference: templateLoader.load("skill-reference.template.md", dataDir),
  };

  const validCombinations = findValidCombinations(data, agentData);
  if (validCombinations.length === 0) {
    logger.info("   (no valid discipline/track combinations — skipping)");
    return;
  }

  const combinations = validCombinations.map((combo) => {
    const { profiles, skillFiles, teamInstructions, orgSection } =
      derivePackContent({
        ...combo,
        data,
        agentData,
        skillsWithAgent,
        level,
      });
    return {
      name: `${getDisciplineAbbreviation(combo.discipline.id)}-${toKebabCase(combo.track.id)}`,
      description: `${combo.humanDiscipline.specialization || combo.humanDiscipline.name} (${combo.humanTrack.name}) — agent team`,
      content: formatContent(
        { profiles, skillFiles, teamInstructions, orgSection },
        {
          agent: agentTemplate,
          skill: skillTemplates.skill,
          install: skillTemplates.install,
          reference: skillTemplates.reference,
          claude: claudeTemplate,
        },
        {
          claude: agentData.claudeSettings,
          vscode: agentData.vscodeSettings,
        },
      ),
    };
  });

  const builder = new PackBuilder({
    stager: new PackStager(),
    emitters: {
      tar: new TarEmitter(),
      git: new GitEmitter(),
      disc: new DiscEmitter(),
    },
  });

  const { packs } = await builder.build({ combinations, outputDir, version });

  for (const pack of packs) {
    logger.info(`   ✓ packs/raw/${pack.name}.tar.gz`);
    logger.info(`   ✓ packs/apm/${pack.name}.tar.gz`);
    logger.info(`   ✓ packs/apm/${pack.name}/`);
    logger.info(`   ✓ packs/skills/${pack.name}/`);
  }
  logger.info("   ✓ packs/skills/.well-known/skills/index.json (aggregate)");

  await writeApmManifest(
    outputDir,
    packs.map((p) => ({
      ...p,
      url: `${normalizedSiteUrl}/packs/apm/${p.name}`,
    })),
    version,
    standardTitle,
  );
  logger.info("   ✓ apm.yml");
}
