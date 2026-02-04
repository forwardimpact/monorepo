/**
 * Skill Slide View
 *
 * Printer-friendly view of a skill.
 */

import { div, h1, p } from "../lib/render.js";
import { skillToDOM } from "../formatters/index.js";

/**
 * Render skill slide
 * @param {Object} params
 * @param {Function} params.render
 * @param {Object} params.data
 * @param {Object} params.params
 */
export function renderSkillSlide({ render, data, params }) {
  const skill = data.skills.find((s) => s.id === params.id);

  if (!skill) {
    render(
      div(
        { className: "slide-error" },
        h1({}, "Skill Not Found"),
        p({}, `No skill found with ID: ${params.id}`),
      ),
    );
    return;
  }

  render(
    skillToDOM(skill, {
      disciplines: data.disciplines,
      tracks: data.tracks,
      drivers: data.drivers,
      capabilities: data.capabilities,
      showBackLink: false,
      showToolsAndPatterns: false,
    }),
  );
}
