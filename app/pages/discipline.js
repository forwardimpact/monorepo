/**
 * Disciplines pages
 */

import { render, div, h1, p } from "../lib/render.js";
import { getState } from "../lib/state.js";
import { createCardList } from "../components/list.js";
import { renderNotFound } from "../components/error-page.js";
import { prepareDisciplinesList } from "../formatters/discipline/shared.js";
import { disciplineToDOM } from "../formatters/discipline/dom.js";
import { disciplineToCardConfig } from "../lib/card-mappers.js";

/**
 * Render disciplines list page
 */
export function renderDisciplinesList() {
  const { data } = getState();
  const { framework } = data;

  // Transform data for list view
  const { items } = prepareDisciplinesList(data.disciplines);

  const page = div(
    { className: "disciplines-page" },
    // Header
    div(
      { className: "page-header" },
      h1(
        { className: "page-title" },
        framework.entityDefinitions.discipline.title,
      ),
      p(
        { className: "page-description" },
        framework.entityDefinitions.discipline.description.trim(),
      ),
    ),

    // Disciplines list
    createCardList(items, disciplineToCardConfig, "No disciplines found."),
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
      framework: data.framework,
    }),
  );
}
