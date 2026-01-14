/**
 * Behaviours pages
 */

import { render, div, h1, p } from "../lib/render.js";
import { getState } from "../lib/state.js";
import { createCardList } from "../components/list.js";
import { renderNotFound } from "../components/error-page.js";
import { prepareBehavioursList } from "../formatters/behaviour/shared.js";
import { behaviourToDOM } from "../formatters/behaviour/dom.js";
import { behaviourToCardConfig } from "../lib/card-mappers.js";

/**
 * Render behaviours list page
 */
export function renderBehavioursList() {
  const { data } = getState();
  const { framework } = data;

  // Transform data for list view
  const { items } = prepareBehavioursList(data.behaviours);

  const page = div(
    { className: "behaviours-page" },
    // Header
    div(
      { className: "page-header" },
      h1(
        { className: "page-title" },
        framework.entityDefinitions.behaviour.title,
      ),
      p(
        { className: "page-description" },
        framework.entityDefinitions.behaviour.description.trim(),
      ),
    ),

    // Behaviours list
    createCardList(items, behaviourToCardConfig, "No behaviours found."),
  );

  render(page);
}

/**
 * Render behaviour detail page
 * @param {Object} params - Route params
 */
export function renderBehaviourDetail(params) {
  const { data } = getState();
  const behaviour = data.behaviours.find((b) => b.id === params.id);

  if (!behaviour) {
    renderNotFound({
      entityType: "Behaviour",
      entityId: params.id,
      backPath: "/behaviour",
      backText: "← Back to Behaviours",
    });
    return;
  }

  // Use DOM formatter - it handles transformation internally
  render(
    behaviourToDOM(behaviour, {
      drivers: data.drivers,
      framework: data.framework,
    }),
  );
}
