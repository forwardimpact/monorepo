/**
 * Grades pages
 */

import { render, div, h1, h3, p, formatLevel } from "../lib/render.js";
import { getState } from "../lib/state.js";
import { createBadge } from "../components/card.js";
import { renderNotFound } from "../components/error-page.js";
import { prepareGradesList } from "../formatters/grade/shared.js";
import { gradeToDOM } from "../formatters/grade/dom.js";

/**
 * Render grades list page
 */
export function renderGradesList() {
  const { data } = getState();
  const { framework } = data;

  // Transform data for list view
  const { items } = prepareGradesList(data.grades);

  const page = div(
    { className: "grades-page" },
    // Header
    div(
      { className: "page-header" },
      h1({ className: "page-title" }, framework.entityDefinitions.grade.title),
      p(
        { className: "page-description" },
        framework.entityDefinitions.grade.description.trim(),
      ),
    ),

    // Grades timeline
    div(
      { className: "grades-timeline" },
      ...items.map((grade) => createGradeTimelineItem(grade)),
    ),
  );

  render(page);
}

/**
 * Create a grade timeline item
 * @param {Object} grade
 * @returns {HTMLElement}
 */
function createGradeTimelineItem(grade) {
  const item = div(
    { className: "grade-timeline-item" },
    div({ className: "grade-level-marker" }, String(grade.ordinalRank)),
    div(
      { className: "grade-timeline-content card card-clickable" },
      div(
        { className: "card-header" },
        h3({ className: "card-title" }, grade.displayName),
        createBadge(grade.id, "default"),
      ),
      grade.typicalExperienceRange
        ? p(
            { className: "text-muted", style: "margin: 0.25rem 0" },
            `${grade.typicalExperienceRange} experience`,
          )
        : null,
      div(
        { className: "card-meta", style: "margin-top: 0.5rem" },
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
      ),
      grade.scope
        ? p(
            { className: "card-description", style: "margin-top: 0.75rem" },
            `Scope: ${grade.scope}`,
          )
        : null,
    ),
  );

  item.querySelector(".card").addEventListener("click", () => {
    window.location.hash = `/grade/${grade.id}`;
  });

  return item;
}

/**
 * Render grade detail page
 * @param {Object} params - Route params
 */
export function renderGradeDetail(params) {
  const { data } = getState();
  const grade = data.grades.find((g) => g.id === params.id);

  if (!grade) {
    renderNotFound({
      entityType: "Grade",
      entityId: params.id,
      backPath: "/grade",
      backText: "← Back to Grades",
    });
    return;
  }

  // Use DOM formatter - it handles transformation internally
  render(gradeToDOM(grade, { framework: data.framework }));
}
