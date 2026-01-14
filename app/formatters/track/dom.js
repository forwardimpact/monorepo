/**
 * Track formatting for DOM/web output
 */

import { div, h1, p } from "../../lib/render.js";
import { createBackLink } from "../../components/nav.js";
import { createBadge, createStatCard } from "../../components/card.js";
import { createStatsGrid } from "../../components/grid.js";
import {
  createDetailSection,
  createLinksList,
} from "../../components/detail.js";
import {
  createJobBuilderButton,
  createInterviewPrepButton,
} from "../../components/action-buttons.js";
import {
  createBehaviourModifierTable,
  createSkillModifierTableWithCapabilities,
} from "../../components/modifier-table.js";
import { getConceptEmoji } from "../../model/levels.js";
import { prepareTrackDetail } from "./shared.js";

/**
 * Get track type badge(s)
 * @param {Object} view
 * @returns {HTMLElement[]}
 */
function getTrackTypeBadges(view) {
  const badges = [];
  if (view.isProfessional) {
    badges.push(createBadge("Professional", "secondary"));
  }
  if (view.isManagement) {
    badges.push(createBadge("Management", "default"));
  }
  return badges;
}

/**
 * Format track detail as DOM elements
 * @param {Object} track - Raw track entity
 * @param {Object} context - Additional context
 * @param {Array} context.skills - All skills
 * @param {Array} context.behaviours - All behaviours
 * @param {Array} context.disciplines - All disciplines
 * @param {Object} [context.framework] - Framework data for emoji lookup
 * @returns {HTMLElement}
 */
export function trackToDOM(
  track,
  { skills, behaviours, disciplines, framework },
) {
  const view = prepareTrackDetail(track, { skills, behaviours, disciplines });
  const emoji = getConceptEmoji(framework, "track");
  // Build modifier sections - group them together for print layout
  const hasSkillModifiers = view.skillModifiers.length > 0;
  const hasBehaviourModifiers = view.behaviourModifiers.length > 0;

  const modifiersSection =
    hasSkillModifiers || hasBehaviourModifiers
      ? div(
          { className: "print-columns" },
          hasSkillModifiers
            ? createDetailSection({
                title: "Skill Modifiers",
                content: createSkillModifierTableWithCapabilities(
                  view.skillModifiers,
                ),
              })
            : null,
          hasBehaviourModifiers
            ? createDetailSection({
                title: "Behaviour Modifiers",
                content: createBehaviourModifierTable(view.behaviourModifiers),
              })
            : null,
        )
      : null;

  return div(
    { className: "detail-page track-detail" },
    // Header
    div(
      { className: "page-header" },
      createBackLink("/track", "← Back to Tracks"),
      h1({ className: "page-title" }, `${emoji} `, view.name),
      div({ className: "page-meta" }, ...getTrackTypeBadges(view)),
      p(
        { className: "text-muted", style: "margin-top: 0.5rem" },
        view.description,
      ),
      div(
        { className: "page-actions" },
        createJobBuilderButton({ paramName: "track", paramValue: track.id }),
        createInterviewPrepButton({ paramName: "track", paramValue: track.id }),
      ),
    ),

    // Valid disciplines (if restricted)
    view.validDisciplines.length > 0
      ? createDetailSection({
          title: "Valid Disciplines",
          content: createLinksList(view.validDisciplines, "/discipline"),
        })
      : null,

    // Matching weights (stat cards)
    track.matchingWeights
      ? createDetailSection({
          title: "Matching Weights",
          content: createStatsGrid([
            createStatCard({
              value: `${(track.matchingWeights.skills * 100).toFixed(0)}%`,
              label: "Skills Weight",
            }),
            createStatCard({
              value: `${(track.matchingWeights.behaviours * 100).toFixed(0)}%`,
              label: "Behaviours Weight",
            }),
          ]),
        })
      : null,

    // Skill and Behaviour modifiers in columns for print
    modifiersSection,
  );
}
