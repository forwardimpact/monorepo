/**
 * Discipline Slide View
 *
 * Printer-friendly view of a discipline.
 */

import { div, h1, p } from "../lib/render.js";
import { disciplineToDOM } from "../formatters/index.js";

/**
 * Render discipline slide
 * @param {Object} params
 * @param {Function} params.render
 * @param {Object} params.data
 * @param {Object} params.params
 */
export function renderDisciplineSlide({ render, data, params }) {
  const discipline = data.disciplines.find((d) => d.id === params.id);

  if (!discipline) {
    render(
      div(
        { className: "slide-error" },
        h1({}, "Discipline Not Found"),
        p({}, `No discipline found with ID: ${params.id}`),
      ),
    );
    return;
  }

  render(
    disciplineToDOM(discipline, {
      skills: data.skills,
      behaviours: data.behaviours,
      framework: data.framework,
      showBackLink: false,
      showBehaviourModifiers: false,
    }),
  );
}
