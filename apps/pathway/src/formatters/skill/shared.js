/**
 * Skill presentation helpers
 *
 * Shared utilities for formatting skill data across DOM and markdown outputs.
 */

import {
  groupSkillsByCapability,
  getCapabilityEmoji,
} from "@forwardimpact/schema/levels";
import { getSkillTypeForDiscipline } from "@forwardimpact/libpathway/derivation";
import { truncate } from "../shared.js";

/**
 * Format capability name for display
 * @param {string} capabilityName - The capability name to display
 * @returns {string}
 */
export function formatCapability(capabilityName) {
  if (!capabilityName) return "";
  return capabilityName;
}

/**
 * @typedef {Object} SkillListItem
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} capability
 * @property {string} capabilityEmoji
 * @property {string} truncatedDescription
 */

/**
 * Transform skills for list view (grouped by capability)
 * @param {Array} skills - Raw skill entities
 * @param {Array} capabilities - Capability entities
 * @param {number} [descriptionLimit=120] - Maximum description length
 * @returns {{ groups: Object<string, SkillListItem[]>, groupOrder: string[] }}
 */
export function prepareSkillsList(
  skills,
  capabilities,
  descriptionLimit = 120,
) {
  const grouped = groupSkillsByCapability(skills, capabilities);

  const groups = {};
  for (const [capability, capabilitySkills] of Object.entries(grouped)) {
    groups[capability] = capabilitySkills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      capability: skill.capability,
      capabilityEmoji: getCapabilityEmoji(capabilities, skill.capability),
      truncatedDescription: truncate(skill.description, descriptionLimit),
    }));
  }

  return { groups, groupOrder: Object.keys(groups) };
}

/**
 * @typedef {Object} SkillDetailView
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} capability
 * @property {string} capabilityName
 * @property {boolean} isHumanOnly
 * @property {string} capabilityEmoji
 * @property {Object<string, string>} levelDescriptions
 * @property {Array<{id: string, name: string, skillType: string}>} relatedDisciplines
 * @property {Array<{id: string, name: string, modifier: number}>} relatedTracks
 * @property {Array<{id: string, name: string}>} relatedDrivers
 * @property {Array<{name: string, url?: string, description: string, useWhen: string}>} toolReferences
 * @property {string|null} installScript
 * @property {string|null} implementationReference
 */

/**
 * Transform skill for detail view
 * @param {Object} skill - Raw skill entity
 * @param {Object} context - Additional context
 * @param {Array} context.disciplines - All disciplines
 * @param {Array} context.tracks - All tracks
 * @param {Array} context.drivers - All drivers
 * @param {Array} context.capabilities - Capability entities
 * @returns {SkillDetailView|null}
 */
export function prepareSkillDetail(
  skill,
  { disciplines, tracks, drivers, capabilities },
) {
  if (!skill) return null;

  const relatedDisciplines = disciplines
    .filter((d) => getSkillTypeForDiscipline(d, skill.id) !== null)
    .map((d) => ({
      id: d.id,
      name: d.specialization || d.name,
      skillType: getSkillTypeForDiscipline(d, skill.id),
    }));

  const relatedTracks = tracks
    .filter((t) => t.skillModifiers?.[skill.id])
    .map((t) => ({
      id: t.id,
      name: t.name,
      modifier: t.skillModifiers[skill.id],
    }));

  const relatedDrivers = drivers
    .filter((d) => d.contributingSkills?.includes(skill.id))
    .map((d) => ({ id: d.id, name: d.name }));

  const capabilityEntity = capabilities.find((c) => c.id === skill.capability);

  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    capability: skill.capability,
    capabilityName: capabilityEntity?.name || skill.capability,
    isHumanOnly: skill.isHumanOnly || false,
    capabilityEmoji: getCapabilityEmoji(capabilities, skill.capability),
    levelDescriptions: skill.levelDescriptions,
    relatedDisciplines,
    relatedTracks,
    relatedDrivers,
    toolReferences: (skill.toolReferences || [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name)),
    installScript: skill.installScript || null,
    implementationReference: skill.implementationReference || null,
  };
}
