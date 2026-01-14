/**
 * Card Mapper Functions
 *
 * Reusable functions that map entities to card configurations.
 * Used by both regular pages and overview slides.
 */

import { createBadge } from "../components/card.js";
import { formatLevel } from "./render.js";
import { getCapabilityEmoji } from "../model/levels.js";

/**
 * Map discipline to card config
 * @param {Object} discipline
 * @returns {Object}
 */
export function disciplineToCardConfig(discipline) {
  return {
    title: discipline.name,
    description: discipline.truncatedDescription,
    href: `/discipline/${discipline.id}`,
    meta: [
      createBadge(`${discipline.coreSkillsCount} core`, "primary"),
      createBadge(
        `${discipline.supportingSkillsCount} supporting`,
        "secondary",
      ),
      createBadge(`${discipline.broadSkillsCount} broad`, "broad"),
    ],
  };
}

/**
 * Map skill to card config
 * @param {Object} skill
 * @param {Array} capabilities
 * @returns {Object}
 */
export function skillToCardConfig(skill, capabilities) {
  return {
    title: skill.name,
    description: skill.truncatedDescription,
    href: `/skill/${skill.id}`,
    badges: [
      createBadge(
        formatCapability(skill.capability, capabilities),
        skill.capability,
      ),
    ],
  };
}

/**
 * Map behaviour to card config
 * @param {Object} behaviour
 * @returns {Object}
 */
export function behaviourToCardConfig(behaviour) {
  return {
    title: behaviour.name,
    description: behaviour.truncatedDescription,
    href: `/behaviour/${behaviour.id}`,
  };
}

/**
 * Map driver to card config
 * @param {Object} driver
 * @returns {Object}
 */
export function driverToCardConfig(driver) {
  return {
    title: driver.name,
    description: driver.truncatedDescription,
    href: `/driver/${driver.id}`,
    meta: [
      createBadge(`${driver.contributingSkillsCount} skills`, "default"),
      createBadge(
        `${driver.contributingBehavioursCount} behaviours`,
        "primary",
      ),
    ],
  };
}

/**
 * Map grade to card config (for timeline)
 * @param {Object} grade
 * @returns {Object}
 */
export function gradeToCardConfig(grade) {
  return {
    title: grade.displayName,
    description: grade.scope || grade.truncatedDescription,
    href: `/grade/${grade.id}`,
    badges: [createBadge(grade.id, "default")],
    meta: [
      createBadge(
        `Primary: ${formatLevel(grade.baseSkillLevels?.primary)}`,
        "primary",
      ),
      createBadge(
        `Secondary: ${formatLevel(grade.baseSkillLevels?.secondary)}`,
        "secondary",
      ),
      createBadge(
        `Broad: ${formatLevel(grade.baseSkillLevels?.broad)}`,
        "broad",
      ),
    ],
    yearsExperience: grade.yearsExperience,
  };
}

/**
 * Map track to card config
 * @param {Object} track
 * @returns {Object}
 */
export function trackToCardConfig(track) {
  const badges = [];
  if (track.isProfessional) {
    badges.push(createBadge("Professional", "secondary"));
  }
  if (track.isManagement) {
    badges.push(createBadge("Management", "default"));
  }

  return {
    title: track.name,
    description: track.truncatedDescription,
    href: `/track/${track.id}`,
    meta: badges,
  };
}

/**
 * Map job combination to card config
 * @param {Object} job
 * @returns {Object}
 */
export function jobToCardConfig(job) {
  return {
    title: job.title,
    description: `${job.discipline.specialization || job.discipline.name} at ${job.grade.professionalTitle} level on ${job.track.name} track`,
    href: `/job/${job.discipline.id}/${job.track.id}/${job.grade.id}`,
    badges: [createBadge(job.grade.id, "default")],
    meta: [createBadge(job.track.name, "secondary")],
  };
}

/**
 * Format capability for display
 * @param {string} capability
 * @param {Array} capabilities
 * @returns {string}
 */
function formatCapability(capability, capabilities) {
  const capabilityLabels = {
    delivery: "Delivery",
    scale: "Scale",
    reliability: "Reliability",
    data: "Data",
    ai: "AI",
    process: "Process",
    business: "Business",
    people: "People",
    documentation: "Documentation",
  };
  const label = capabilityLabels[capability] || formatLevel(capability);
  const emoji = getCapabilityEmoji(capabilities, capability);
  return `${emoji} ${label}`;
}
