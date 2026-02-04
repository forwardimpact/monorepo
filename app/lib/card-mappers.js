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
 * Create an external link element styled as a badge
 * @param {string} text - Link text
 * @param {string} url - External URL
 * @returns {HTMLElement}
 */
function createExternalLink(text, url) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "badge badge-primary";
  link.textContent = text;
  link.addEventListener("click", (e) => e.stopPropagation()); // Don't trigger card click
  return link;
}

/**
 * Map discipline to card config
 * @param {Object} discipline
 * @returns {Object}
 */
export function disciplineToCardConfig(discipline) {
  const badges = [];
  if (discipline.isProfessional) {
    badges.push(createBadge("Professional", "secondary"));
  }
  if (discipline.isManagement) {
    badges.push(createBadge("Management", "primary"));
  }
  return {
    title: discipline.name,
    description: discipline.truncatedDescription,
    href: `/discipline/${discipline.id}`,
    badges,
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
  return {
    title: track.name,
    description: track.truncatedDescription,
    href: `/track/${track.id}`,
    meta: [],
  };
}

/**
 * Map job combination to card config
 * @param {Object} job
 * @returns {Object}
 */
export function jobToCardConfig(job) {
  const href = job.track
    ? `/job/${job.discipline.id}/${job.grade.id}/${job.track.id}`
    : `/job/${job.discipline.id}/${job.grade.id}`;
  return {
    title: job.title,
    description: job.track
      ? `${job.discipline.specialization || job.discipline.name} at ${job.grade.professionalTitle} level on ${job.track.name} track`
      : `${job.discipline.specialization || job.discipline.name} at ${job.grade.professionalTitle} level`,
    href,
    badges: [createBadge(job.grade.id, "default")],
    meta: job.track ? [createBadge(job.track.name, "secondary")] : [],
  };
}

/**
 * Map tool to card config
 * @param {Object} tool - Aggregated tool with usages
 * @param {Array} capabilities - Capability entities for emoji lookup
 * @returns {Object}
 */
export function toolToCardConfig(tool, capabilities) {
  // Create skills list as card content
  const skillsList = createSkillsList(tool.usages, capabilities);

  // Create icon element if available
  const icon = tool.simpleIcon
    ? createToolIcon(tool.simpleIcon, tool.name)
    : null;

  return {
    title: tool.name,
    description: tool.description,
    // Docs link in header badges (upper right)
    badges: tool.url ? [createExternalLink("Docs →", tool.url)] : [],
    content: skillsList,
    icon,
  };
}

/**
 * Create a tool icon element using Simple Icons CDN
 * @param {string} slug - Simple Icons slug (e.g., 'terraform', 'docker')
 * @param {string} name - Tool name for alt text
 * @returns {HTMLElement}
 */
export function createToolIcon(slug, name) {
  const img = document.createElement("img");
  // Use black color for consistent monochrome appearance
  img.src = `https://cdn.simpleicons.org/${slug}/000000`;
  img.alt = `${name} icon`;
  img.className = "tool-icon";
  img.width = 28;
  img.height = 28;
  // Gracefully handle missing icons
  img.onerror = () => {
    img.style.display = "none";
  };
  return img;
}

/**
 * Create an unordered list of skill links with capability emoji
 * @param {Array} usages - Tool usage objects with skillId, skillName, capabilityId
 * @param {Array} capabilities - Capability entities
 * @returns {HTMLElement}
 */
function createSkillsList(usages, capabilities) {
  const ul = document.createElement("ul");
  ul.className = "tool-skills-list";

  for (const usage of usages) {
    const emoji = getCapabilityEmoji(capabilities, usage.capabilityId);
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = `#/skill/${usage.skillId}`;
    link.textContent = `${emoji} ${usage.skillName}`;
    li.appendChild(link);
    ul.appendChild(li);
  }

  return ul;
}

/**
 * Format capability for badge display (short, tag-like)
 * @param {string} capabilityId
 * @param {Array} capabilities
 * @returns {string}
 */
function formatCapability(capabilityId, capabilities) {
  const emoji = getCapabilityEmoji(capabilities, capabilityId);
  return `${emoji} ${capabilityId.toUpperCase()}`;
}
