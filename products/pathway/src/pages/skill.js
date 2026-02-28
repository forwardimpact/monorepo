/**
 * Skills pages
 */

import { render, div, h1, h2, p } from "../lib/render.js";
import { getState } from "../lib/state.js";
import { createBadge } from "../components/card.js";
import { createGroupedList } from "../components/list.js";
import { renderNotFound } from "../components/error-page.js";
import { prepareSkillsList } from "../formatters/skill/shared.js";
import { skillToDOM } from "../formatters/skill/dom.js";
import { skillToCardConfig } from "../lib/card-mappers.js";
import { getCapabilityEmoji, getConceptEmoji } from "@forwardimpact/map/levels";
import { generateSkillMarkdown } from "@forwardimpact/libskill";
import { formatAgentSkill } from "../formatters/agent/skill.js";

/** @type {string|null} Cached skill template */
let skillTemplateCache = null;

/**
 * Load skill Mustache template with caching
 * @returns {Promise<string>}
 */
async function getSkillTemplate() {
  if (!skillTemplateCache) {
    const res = await fetch("./templates/skill.template.md");
    skillTemplateCache = await res.text();
  }
  return skillTemplateCache;
}

/**
 * Render skills list page
 */
export function renderSkillsList() {
  const { data } = getState();
  const { framework } = data;
  const skillEmoji = getConceptEmoji(framework, "skill");

  // Transform data for list view
  const { groups, groupOrder } = prepareSkillsList(
    data.skills,
    data.capabilities,
  );

  const page = div(
    { className: "skills-page" },
    // Header
    div(
      { className: "page-header" },
      h1(
        { className: "page-title" },
        `${skillEmoji} ${framework.entityDefinitions.skill.title}`,
      ),
      p(
        { className: "page-description" },
        framework.entityDefinitions.skill.description.trim(),
      ),
    ),

    // Skills list
    groupOrder.length > 0
      ? createGroupedList(
          groups,
          (skill) => skillToCardConfig(skill, data.capabilities),
          (capability, count) =>
            div(
              { className: "capability-header" },
              h2(
                { className: "capability-title" },
                formatCapability(capability, data.capabilities),
              ),
              createBadge(`${count} skills`, "default"),
            ),
        )
      : div({ className: "empty-state" }, p({}, "No skills found.")),
  );

  render(page);
}

/**
 * Render skill detail page
 * @param {Object} params - Route params
 */
export async function renderSkillDetail(params) {
  const { data } = getState();
  const skill = data.skills.find((s) => s.id === params.id);

  if (!skill) {
    renderNotFound({
      entityType: "Skill",
      entityId: params.id,
      backPath: "/skill",
      backText: "← Back to Skills",
    });
    return;
  }

  // Generate SKILL.md content if skill has an agent section
  let agentSkillContent;
  if (skill.agent) {
    const template = await getSkillTemplate();
    const skillData = generateSkillMarkdown(skill, data.stages);
    agentSkillContent = formatAgentSkill(skillData, template);
  }

  // Use DOM formatter - it handles transformation internally
  render(
    skillToDOM(skill, {
      disciplines: data.disciplines,
      tracks: data.tracks,
      drivers: data.drivers,
      capabilities: data.capabilities,
      agentSkillContent,
    }),
  );
}

/**
 * Format capability for display
 * @param {string} capabilityId
 * @param {Array} capabilities
 * @returns {string}
 */
function formatCapability(capabilityId, capabilities) {
  const capability = capabilities.find((c) => c.id === capabilityId);
  const label = capability?.name || capabilityId;
  const emoji = getCapabilityEmoji(capabilities, capabilityId);
  return `${emoji} ${label}`;
}
