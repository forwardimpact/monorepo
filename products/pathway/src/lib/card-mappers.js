/**
 * Card Mapper Functions
 *
 * These reusable functions map entities to card configurations.
 * Regular pages and overview slides both use them.
 */

import { createBadge } from "../components/card.js";
import { formatLevel } from "./render.js";
import { getCapabilityEmoji } from "@forwardimpact/libskill/levels";

/**
 * Create an external link element with the badge style
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
  link.addEventListener("click", (e) => e.stopPropagation()); // Do not trigger the card click
  return link;
}

/**
 * Map a discipline to a card config
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
 * Map a skill to a card config
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
 * Map a behaviour to a card config
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
 * Map a driver to a card config
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
 * Map a level to a card config (for the timeline)
 * @param {Object} level
 * @returns {Object}
 */
export function levelToCardConfig(level) {
  return {
    title: level.displayName,
    description: level.scope || level.truncatedDescription,
    href: `/level/${level.id}`,
    badges: [createBadge(level.id, "default")],
    meta: [
      createBadge(
        `Core: ${formatLevel(level.baseSkillProficiencies?.core)}`,
        "primary",
      ),
      createBadge(
        `Supporting: ${formatLevel(level.baseSkillProficiencies?.supporting)}`,
        "secondary",
      ),
      createBadge(
        `Broad: ${formatLevel(level.baseSkillProficiencies?.broad)}`,
        "broad",
      ),
    ],
    yearsExperience: level.yearsExperience,
  };
}

/**
 * Map a track to a card config
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
 * Map a job combination to a card config
 * @param {Object} job
 * @returns {Object}
 */
export function jobToCardConfig(job) {
  const href = job.track
    ? `/job/${job.discipline.id}/${job.level.id}/${job.track.id}`
    : `/job/${job.discipline.id}/${job.level.id}`;
  return {
    title: job.title,
    description: job.track
      ? `${job.discipline.specialization || job.discipline.name} at ${job.level.professionalTitle} level on ${job.track.name} track`
      : `${job.discipline.specialization || job.discipline.name} at ${job.level.professionalTitle} level`,
    href,
    badges: [createBadge(job.level.id, "default")],
    meta: job.track ? [createBadge(job.track.name, "secondary")] : [],
  };
}

/**
 * Map a tool to a card config
 * @param {Object} tool - Aggregated tool with usages
 * @param {Array} capabilities - Capability entities to look up the emoji
 * @returns {Object}
 */
export function toolToCardConfig(tool, capabilities) {
  // Create the skills list as the card content
  const skillsList = createSkillsList(tool.usages, capabilities);

  // Create the icon element if the tool has one
  const icon = tool.simpleIcon
    ? createToolIcon(tool.simpleIcon, tool.name)
    : null;

  return {
    title: tool.name,
    description: tool.description,
    // Put the docs link in the header badges (upper right)
    badges: tool.url ? [createExternalLink("Docs ↗", tool.url)] : [],
    content: skillsList,
    icon,
  };
}

/**
 * Create a tool icon element from the Simple Icons CDN
 * @param {string} slug - Simple Icons slug (e.g., 'terraform', 'docker')
 * @param {string} name - Tool name for the alt text
 * @returns {HTMLElement}
 */
export function createToolIcon(slug, name) {
  const img = document.createElement("img");
  // Use the black color for a consistent monochrome appearance
  img.src = `https://cdn.simpleicons.org/${slug}/000000`;
  img.alt = `${name} icon`;
  img.className = "tool-icon";
  img.width = 28;
  img.height = 28;
  // Degrade gracefully when an icon does not load
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
 * Format a capability to show in a badge (short, tag-like)
 * @param {string} capabilityId
 * @param {Array} capabilities
 * @returns {string}
 */
function formatCapability(capabilityId, capabilities) {
  const emoji = getCapabilityEmoji(capabilities, capabilityId);
  return `${emoji} ${capabilityId.toUpperCase()}`;
}
