/**
 * Job Slide View
 *
 * Printer-friendly view of a job definition.
 */

import { div, h1, p } from "../lib/render.js";
import { prepareJobDetail } from "@forwardimpact/libpathway/job";
import { jobToDOM } from "../formatters/index.js";

/**
 * Render job slide
 * @param {Object} params
 * @param {Function} params.render
 * @param {Object} params.data
 * @param {Object} params.params
 */
export function renderJobSlide({ render, data, params }) {
  const discipline = data.disciplines.find((d) => d.id === params.discipline);
  const grade = data.grades.find((g) => g.id === params.grade);
  const track = data.tracks.find((t) => t.id === params.track);

  const view = prepareJobDetail({
    discipline,
    grade,
    track,
    skills: data.skills,
    behaviours: data.behaviours,
    drivers: data.drivers,
    capabilities: data.capabilities,
    stages: data.stages,
  });

  if (!view) {
    render(
      div(
        { className: "slide-error" },
        h1({}, "Job Not Found"),
        p({}, "Invalid job combination."),
      ),
    );
    return;
  }

  render(
    jobToDOM(view, {
      showBackLink: false,
      showTables: false,
      showJobDescriptionHtml: true,
      showJobDescriptionMarkdown: false,
      discipline,
      grade,
      track,
    }),
  );
}
