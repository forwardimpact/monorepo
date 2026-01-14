/**
 * Interview Slide View
 *
 * Printer-friendly view of interview questions.
 */

import { div, h1, p } from "../lib/render.js";
import {
  prepareInterviewDetail,
  INTERVIEW_TYPES,
} from "../formatters/interview/shared.js";
import { interviewToDOM } from "../formatters/index.js";

/**
 * Render interview slide
 * @param {Object} params
 * @param {Function} params.render
 * @param {Object} params.data
 * @param {Object} params.params
 */
export function renderInterviewSlide({ render, data, params }) {
  const discipline = data.disciplines.find((d) => d.id === params.discipline);
  const grade = data.grades.find((g) => g.id === params.grade);
  const track = data.tracks.find((t) => t.id === params.track);

  // Get interview type from URL query or default to full
  const urlParams = new URLSearchParams(window.location.search);
  const interviewType = urlParams.get("type") || "full";

  const view = prepareInterviewDetail({
    discipline,
    grade,
    track,
    skills: data.skills,
    behaviours: data.behaviours,
    questions: data.questions,
    interviewType,
  });

  if (!view) {
    render(
      div(
        { className: "slide-error" },
        h1({}, "Interview Not Found"),
        p({}, "Invalid job combination or no questions available."),
      ),
    );
    return;
  }

  const typeConfig = INTERVIEW_TYPES[interviewType];
  render(
    interviewToDOM(view, typeConfig, {
      framework: data.framework,
      showBackLink: false,
    }),
  );
}
