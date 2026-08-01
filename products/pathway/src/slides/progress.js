/**
 * Progress Slide View
 *
 * Printer-friendly view of career progression.
 */

import { div, h1, p } from "../lib/render.js";
import {
  prepareProgressDetail,
  getDefaultTargetLevel,
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
  const level = data.levels.find((g) => g.id === params.level);
  const track = params.track
    ? data.tracks.find((t) => t.id === params.track)
    : null;

  if (!discipline || !level) {
    render(
      div(
        { className: "slide-error" },
        h1({}, "Role Not Found"),
        p({}, "Invalid role combination."),
      ),
    );
    return;
  }

  // Get the compare level from the URL query. Default to the next level
  const urlParams = new URLSearchParams(window.location.search);
  const compareLevelId = urlParams.get("compare");

  let targetLevel;
  if (compareLevelId) {
    targetLevel = data.levels.find((g) => g.id === compareLevelId);
  } else {
    targetLevel = getDefaultTargetLevel(level, data.levels);
  }

  if (!targetLevel) {
    render(
      div(
        { className: "slide-error" },
        h1({}, "No Progression Available"),
        p({}, "No next level available for this role."),
      ),
    );
    return;
  }

  const view = prepareProgressDetail({
    fromDiscipline: discipline,
    fromLevel: level,
    fromTrack: track,
    toDiscipline: discipline,
    toLevel: targetLevel,
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
