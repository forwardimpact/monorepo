/**
 * Drivers pages
 */

import { render, div, h1, p } from "../lib/render.js";
import { getState } from "../lib/state.js";
import { createCardList } from "../components/list.js";
import { renderNotFound } from "../components/error-page.js";
import { prepareDriversList } from "../formatters/driver/shared.js";
import { driverToDOM } from "../formatters/driver/dom.js";
import { driverToCardConfig } from "../lib/card-mappers.js";
import { getConceptEmoji } from "@forwardimpact/libskill/levels";

/**
 * Render drivers list page
 */
export function renderDriversList() {
  const { data } = getState();
  const { standard } = data;
  const driverEmoji = getConceptEmoji(standard, "driver");

  // Transform data for list view
  const { items } = prepareDriversList(data.drivers);

  const page = div(
    { className: "drivers-page" },
    // Header
    div(
      { className: "page-header" },
      h1(
        { className: "page-title" },
        `${driverEmoji} ${standard.entityDefinitions.driver.title}`,
      ),
      p(
        { className: "page-description" },
        standard.entityDefinitions.driver.description.trim(),
      ),
    ),

    // Drivers list
    createCardList(items, driverToCardConfig, "No drivers found."),
  );

  render(page);
}

/**
 * Render driver detail page
 * @param {Object} params - Route params
 */
export function renderDriverDetail(params) {
  const { data } = getState();
  const driver = data.drivers.find((d) => d.id === params.id);

  if (!driver) {
    renderNotFound({
      entityType: "Driver",
      entityId: params.id,
      backPath: "/driver",
      backText: "← Back to Drivers",
    });
    return;
  }

  // Use DOM formatter - it handles transformation internally
  render(
    driverToDOM(driver, {
      skills: data.skills,
      behaviours: data.behaviours,
      standard: data.standard,
    }),
  );
}
