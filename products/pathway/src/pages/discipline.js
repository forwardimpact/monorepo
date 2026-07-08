/**
 * Disciplines pages
 */

import { render, div, h1, h2, p } from "../lib/render.js";
import { getState } from "../lib/state.js";
import { createGroupedList } from "../components/list.js";
import { createBadge } from "../components/card.js";
import { renderNotFound } from "../components/error-page.js";
import { prepareDisciplinesList } from "../formatters/discipline/shared.js";
import { disciplineToDOM } from "../formatters/discipline/dom.js";
import { disciplineToCardConfig } from "../lib/card-mappers.js";
import { getConceptEmoji } from "@forwardimpact/libskill/levels";

/**
 * Format discipline group name for display
 * @param {string} groupName - Group name (professional/management)
 * @returns {string}
 */
function formatDisciplineGroupName(groupName) {
  if (groupName === "professional") return "Professional";
  if (groupName === "management") return "Management";
  return groupName.charAt(0).toUpperCase() + groupName.slice(1);
}

/**
 * Render discipline group header
 * @param {string} groupName - Group name
 * @param {number} count - Number of items in group
 * @returns {HTMLElement}
 */
function renderDisciplineGroupHeader(groupName, count) {
  return div(
    { className: "capability-header" },
    h2({ className: "capability-title" }, formatDisciplineGroupName(groupName)),
    createBadge(`${count}`, "default"),
  );
}

/**
 * Render disciplines list page
 */
export function renderDisciplinesList() {
  const { data } = getState();
  const { standard } = data;
  const disciplineEmoji = getConceptEmoji(standard, "discipline");

  // Transform data for list view (grouped by professional/management)
  const { groups } = prepareDisciplinesList(data.disciplines);

  const page = div(
    { className: "disciplines-page" },
    // Header
    div(
      { className: "page-header" },
      h1(
        { className: "page-title" },
        `${disciplineEmoji} ${standard.entityDefinitions.discipline.title}`,
      ),
      p(
        { className: "page-description" },
        standard.entityDefinitions.discipline.description.trim(),
      ),
    ),

    // Disciplines list (grouped by type)
    createGroupedList(
      groups,
      disciplineToCardConfig,
      renderDisciplineGroupHeader,
    ),
  );

  render(page);
}

/**
 * Render discipline detail page
 * @param {Object} params - Route params
 */
export function renderDisciplineDetail(params) {
  const { data } = getState();
  const discipline = data.disciplines.find((d) => d.id === params.id);

  if (!discipline) {
    renderNotFound({
      entityType: "Discipline",
      entityId: params.id,
      backPath: "/discipline",
      backText: "← Back to Disciplines",
    });
    return;
  }

  // Use DOM formatter - it handles transformation internally
  render(
    disciplineToDOM(discipline, {
      skills: data.skills,
      behaviours: data.behaviours,
      standard: data.standard,
    }),
  );
}
