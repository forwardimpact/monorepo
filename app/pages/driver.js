/**
 * Drivers pages
 */

import { render, div, h1, h2, p, section } from "../lib/render.js";
import { getState } from "../lib/state.js";
import { createCardList } from "../components/list.js";
import { createDetailHeader, createLinksList } from "../components/detail.js";
import { renderNotFound } from "../components/error-page.js";
import {
  prepareDriversList,
  prepareDriverDetail,
} from "../formatters/driver/shared.js";
import { driverToCardConfig } from "../lib/card-mappers.js";

/**
 * Render drivers list page
 */
export function renderDriversList() {
  const { data } = getState();
  const { framework } = data;

  // Transform data for list view
  const { items } = prepareDriversList(data.drivers);

  const page = div(
    { className: "drivers-page" },
    // Header
    div(
      { className: "page-header" },
      h1({ className: "page-title" }, framework.entityDefinitions.driver.title),
      p(
        { className: "page-description" },
        framework.entityDefinitions.driver.description.trim(),
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

  // Transform data for detail view
  const view = prepareDriverDetail(driver, {
    skills: data.skills,
    behaviours: data.behaviours,
  });

  const page = div(
    { className: "driver-detail" },
    createDetailHeader({
      title: view.name,
      description: view.description,
      backLink: "/driver",
      backText: "← Back to Drivers",
    }),

    // Contributing Skills and Contributing Behaviours in two columns
    view.contributingSkills.length > 0 || view.contributingBehaviours.length > 0
      ? section(
          { className: "section section-detail" },
          div(
            { className: "content-columns" },
            // Contributing Skills column
            view.contributingSkills.length > 0
              ? div(
                  { className: "column" },
                  h2({ className: "section-title" }, "Contributing Skills"),
                  createLinksList(view.contributingSkills, "/skill"),
                )
              : null,
            // Contributing Behaviours column
            view.contributingBehaviours.length > 0
              ? div(
                  { className: "column" },
                  h2({ className: "section-title" }, "Contributing Behaviours"),
                  createLinksList(view.contributingBehaviours, "/behaviour"),
                )
              : null,
          ),
        )
      : null,
  );

  render(page);
}
