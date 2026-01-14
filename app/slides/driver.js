/**
 * Driver Slide View
 *
 * Printer-friendly view of a driver.
 */

import { div, h1, p } from "../lib/render.js";
import { driverToDOM } from "../formatters/index.js";

/**
 * Render driver slide
 * @param {Object} params
 * @param {Function} params.render
 * @param {Object} params.data
 * @param {Object} params.params
 */
export function renderDriverSlide({ render, data, params }) {
  const driver = data.drivers.find((d) => d.id === params.id);

  if (!driver) {
    render(
      div(
        { className: "slide-error" },
        h1({}, "Driver Not Found"),
        p({}, `No driver found with ID: ${params.id}`),
      ),
    );
    return;
  }

  render(
    driverToDOM(driver, {
      skills: data.skills,
      behaviours: data.behaviours,
      framework: data.framework,
      showBackLink: false,
    }),
  );
}
