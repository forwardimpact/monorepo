/**
 * Grade Slide View
 *
 * Printer-friendly view of a grade.
 */

import { div, h1, p } from "../lib/render.js";
import { gradeToDOM } from "../formatters/index.js";

/**
 * Render grade slide
 * @param {Object} params
 * @param {Function} params.render
 * @param {Object} params.data
 * @param {Object} params.params
 */
export function renderGradeSlide({ render, data, params }) {
  const grade = data.grades.find((g) => g.id === params.id);

  if (!grade) {
    render(
      div(
        { className: "slide-error" },
        h1({}, "Grade Not Found"),
        p({}, `No grade found with ID: ${params.id}`),
      ),
    );
    return;
  }

  render(gradeToDOM(grade, { framework: data.framework, showBackLink: false }));
}
