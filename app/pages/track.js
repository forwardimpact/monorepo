/**
 * Tracks pages
 */

import { render, div, h1, p } from "../lib/render.js";
import { getState } from "../lib/state.js";
import { createCardList } from "../components/list.js";
import { renderNotFound } from "../components/error-page.js";
import { prepareTracksList } from "../formatters/track/shared.js";
import { trackToDOM } from "../formatters/track/dom.js";
import { trackToCardConfig } from "../lib/card-mappers.js";

/**
 * Render tracks list page
 */
export function renderTracksList() {
  const { data } = getState();
  const { framework } = data;

  // Transform data for list view
  const { items } = prepareTracksList(data.tracks);

  const page = div(
    { className: "tracks-page" },
    // Header
    div(
      { className: "page-header" },
      h1({ className: "page-title" }, framework.entityDefinitions.track.title),
      p(
        { className: "page-description" },
        framework.entityDefinitions.track.description.trim(),
      ),
    ),

    // Tracks list
    createCardList(items, trackToCardConfig, "No tracks found."),
  );

  render(page);
}

/**
 * Render track detail page
 * @param {Object} params - Route params
 */
export function renderTrackDetail(params) {
  const { data } = getState();
  const track = data.tracks.find((t) => t.id === params.id);

  if (!track) {
    renderNotFound({
      entityType: "Track",
      entityId: params.id,
      backPath: "/track",
      backText: "← Back to Tracks",
    });
    return;
  }

  // Use DOM formatter - it handles transformation internally
  render(
    trackToDOM(track, {
      skills: data.skills,
      behaviours: data.behaviours,
      disciplines: data.disciplines,
      framework: data.framework,
    }),
  );
}
