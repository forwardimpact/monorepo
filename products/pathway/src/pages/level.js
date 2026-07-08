/**
 * Levels pages
 */

import { render, div, h1, h3, p, formatLevel } from "../lib/render.js";
import { getState } from "../lib/state.js";
import { createBadge } from "../components/card.js";
import { renderNotFound } from "../components/error-page.js";
import { prepareLevelsList } from "../formatters/level/shared.js";
import { levelToDOM } from "../formatters/level/dom.js";
import { getConceptEmoji } from "@forwardimpact/libskill/levels";

/**
 * Render levels list page
 */
export function renderLevelsList() {
  const { data } = getState();
  const { standard } = data;
  const levelEmoji = getConceptEmoji(standard, "level");

  // Transform data for list view
  const { items } = prepareLevelsList(data.levels);

  const page = div(
    { className: "levels-page" },
    // Header
    div(
      { className: "page-header" },
      h1(
        { className: "page-title" },
        `${levelEmoji} ${standard.entityDefinitions.level.title}`,
      ),
      p(
        { className: "page-description" },
        standard.entityDefinitions.level.description.trim(),
      ),
    ),

    // Levels timeline
    div(
      { className: "levels-timeline" },
      ...items.map((level) => createLevelTimelineItem(level)),
    ),
  );

  render(page);
}

/**
 * Create a level timeline item
 * @param {Object} level
 * @returns {HTMLElement}
 */
function createLevelTimelineItem(level) {
  const item = div(
    { className: "level-timeline-item" },
    div({ className: "level-level-marker" }, String(level.ordinalRank)),
    div(
      { className: "level-timeline-content card card-clickable" },
      div(
        { className: "card-header" },
        h3({ className: "card-title" }, level.displayName),
        createBadge(level.id, "default"),
      ),
      level.typicalExperienceRange
        ? p(
            { className: "text-muted", style: "margin: 0.25rem 0" },
            `${level.typicalExperienceRange} experience`,
          )
        : null,
      div(
        { className: "card-meta", style: "margin-top: 0.5rem" },
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
      ),
      level.scope
        ? p(
            { className: "card-description", style: "margin-top: 0.75rem" },
            `Scope: ${level.scope}`,
          )
        : null,
    ),
  );

  item.querySelector(".card").addEventListener("click", () => {
    window.location.hash = `/level/${level.id}`;
  });

  return item;
}

/**
 * Render level detail page
 * @param {Object} params - Route params
 */
export function renderLevelDetail(params) {
  const { data } = getState();
  const level = data.levels.find((g) => g.id === params.id);

  if (!level) {
    renderNotFound({
      entityType: "Level",
      entityId: params.id,
      backPath: "/level",
      backText: "← Back to Levels",
    });
    return;
  }

  // Use DOM formatter - it handles transformation internally
  render(levelToDOM(level, { standard: data.standard }));
}
