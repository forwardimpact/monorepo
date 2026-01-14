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
import { getCapabilityEmoji } from "../model/levels.js";

/**
 * Render skills list page
 */
export function renderSkillsList() {
  const { data } = getState();
  const { framework } = data;

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
      h1({ className: "page-title" }, framework.entityDefinitions.skill.title),
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
export function renderSkillDetail(params) {
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

  // Use DOM formatter - it handles transformation internally
  render(
    skillToDOM(skill, {
      disciplines: data.disciplines,
      tracks: data.tracks,
      drivers: data.drivers,
      capabilities: data.capabilities,
    }),
  );
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
  const label =
    capabilityLabels[capability] ||
    capability.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const emoji = getCapabilityEmoji(capabilities, capability);
  return `${emoji} ${label}`;
}
