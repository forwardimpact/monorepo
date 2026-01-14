/**
 * Progress Slide View
 *
 * Printer-friendly view of career progression.
 */

import { div, h1, p } from "../lib/render.js";
import {
  prepareProgressDetail,
  getDefaultTargetGrade,
} from "../formatters/progress/shared.js";
import { progressToDOM } from "../formatters/index.js";

/**
 * Render progress slide
 * @param {Object} params
 * @param {Function} params.render
 * @param {Object} params.data
 * @param {Object} params.params
 */
export function renderProgressSlide({ render, data, params }) {
  const discipline = data.disciplines.find((d) => d.id === params.discipline);
  const grade = data.grades.find((g) => g.id === params.grade);
  const track = data.tracks.find((t) => t.id === params.track);

  if (!discipline || !grade || !track) {
    render(
      div(
        { className: "slide-error" },
        h1({}, "Role Not Found"),
        p({}, "Invalid role combination."),
      ),
    );
    return;
  }

  // Get compare grade from URL query or default to next grade
  const urlParams = new URLSearchParams(window.location.search);
  const compareGradeId = urlParams.get("compare");

  let targetGrade;
  if (compareGradeId) {
    targetGrade = data.grades.find((g) => g.id === compareGradeId);
  } else {
    targetGrade = getDefaultTargetGrade(grade, data.grades);
  }

  if (!targetGrade) {
    render(
      div(
        { className: "slide-error" },
        h1({}, "No Progression Available"),
        p({}, "No next grade available for this role."),
      ),
    );
    return;
  }

  const view = prepareProgressDetail({
    fromDiscipline: discipline,
    fromGrade: grade,
    fromTrack: track,
    toDiscipline: discipline,
    toGrade: targetGrade,
    toTrack: track,
    skills: data.skills,
    behaviours: data.behaviours,
    capabilities: data.capabilities,
  });

  if (!view) {
    render(
      div(
        { className: "slide-error" },
        h1({}, "Progression Error"),
        p({}, "Unable to analyze progression."),
      ),
    );
    return;
  }

  render(progressToDOM(view, { showBackLink: false }));
}
