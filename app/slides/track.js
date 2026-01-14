/**
 * Track Slide View
 *
 * Printer-friendly view of a track.
 */

import { div, h1, p } from "../lib/render.js";
import { trackToDOM } from "../formatters/index.js";

/**
 * Render track slide
 * @param {Object} params
 * @param {Function} params.render
 * @param {Object} params.data
 * @param {Object} params.params
 */
export function renderTrackSlide({ render, data, params }) {
  const track = data.tracks.find((t) => t.id === params.id);

  if (!track) {
    render(
      div(
        { className: "slide-error" },
        h1({}, "Track Not Found"),
        p({}, `No track found with ID: ${params.id}`),
      ),
    );
    return;
  }

  render(
    trackToDOM(track, {
      skills: data.skills,
      behaviours: data.behaviours,
      disciplines: data.disciplines,
      framework: data.framework,
    }),
  );
}
