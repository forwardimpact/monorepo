/**
 * Behaviour Slide View
 *
 * Printer-friendly view of a behaviour.
 */

import { div, h1, p } from "../lib/render.js";
import { behaviourToDOM } from "../formatters/index.js";

/**
 * Render behaviour slide
 * @param {Object} params
 * @param {Function} params.render
 * @param {Object} params.data
 * @param {Object} params.params
 */
export function renderBehaviourSlide({ render, data, params }) {
  const behaviour = data.behaviours.find((b) => b.id === params.id);

  if (!behaviour) {
    render(
      div(
        { className: "slide-error" },
        h1({}, "Behaviour Not Found"),
        p({}, `No behaviour found with ID: ${params.id}`),
      ),
    );
    return;
  }

  render(
    behaviourToDOM(behaviour, {
      drivers: data.drivers,
      framework: data.framework,
      showBackLink: false,
    }),
  );
}
