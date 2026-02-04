/**
 * Skill formatting for DOM output
 */

import {
  div,
  heading1,
  heading2,
  p,
  span,
  a,
  table,
  tbody,
  thead,
  tr,
  th,
  td,
} from "../../lib/render.js";
import { createBackLink } from "../../components/nav.js";
import { createLevelCell } from "../../components/detail.js";
import { createCodeDisplay } from "../../components/code-display.js";
import { SKILL_LEVEL_ORDER } from "../../model/levels.js";
import { prepareSkillDetail } from "./shared.js";
import { createJsonLdScript, skillToJsonLd } from "../json-ld.js";

/**
 * Format skill detail as DOM elements
 * @param {Object} skill - Raw skill entity
 * @param {Object} context - Additional context and options
 * @param {Array} context.disciplines - All disciplines
 * @param {Array} context.tracks - All tracks
 * @param {Array} context.drivers - All drivers
 * @param {Array} context.capabilities - Capability entities
 * @param {boolean} [context.showBackLink=true] - Whether to show back navigation link
 * @param {boolean} [context.showToolsAndPatterns=true] - Whether to show recommended tools and implementation patterns
 * @returns {HTMLElement}
 */
export function skillToDOM(
  skill,
  {
    disciplines,
    tracks,
    drivers,
    capabilities,
    showBackLink = true,
    showToolsAndPatterns = true,
  } = {},
) {
  const view = prepareSkillDetail(skill, {
    disciplines,
    tracks,
    drivers,
    capabilities,
  });
  return div(
    { className: "detail-page skill-detail" },
    // JSON-LD structured data
    createJsonLdScript(skillToJsonLd(skill, { capabilities })),
    // Header
    div(
      { className: "page-header" },
      showBackLink ? createBackLink("/skill", "← Back to Skills") : null,
      heading1(
        { className: "page-title" },
        view.capabilityEmoji,
        " ",
        view.name,
      ),
      div(
        { className: "page-meta" },
        span(
          { className: "badge badge-default" },
          `${view.capabilityEmoji} ${view.capability.toUpperCase()}`,
        ),
        view.isHumanOnly
          ? span(
              {
                className: "badge badge-human-only",
                title: "Requires interpersonal skills; excluded from agents",
              },
              "🤲 Human-Only",
            )
          : null,
      ),
      p({ className: "page-description" }, view.description),
    ),

    // Level descriptions
    div(
      { className: "detail-section" },
      heading2({ className: "section-title" }, "Level Descriptions"),
      table(
        { className: "level-table" },
        thead({}, tr({}, th({}, "Level"), th({}, "Description"))),
        tbody(
          {},
          ...SKILL_LEVEL_ORDER.map((level, index) => {
            const description = view.levelDescriptions[level] || "—";
            return tr(
              {},
              createLevelCell(index + 1, SKILL_LEVEL_ORDER.length, level),
              td({}, description),
            );
          }),
        ),
      ),
    ),

    // Used in Disciplines and Linked to Drivers in two columns
    view.relatedDisciplines.length > 0 || view.relatedDrivers.length > 0
      ? div(
          { className: "detail-section" },
          div(
            { className: "content-columns" },
            // Used in Disciplines column
            view.relatedDisciplines.length > 0
              ? div(
                  { className: "column" },
                  heading2(
                    { className: "section-title" },
                    "Used in Disciplines",
                  ),
                  ...view.relatedDisciplines.map((d) =>
                    div(
                      { className: "list-item" },
                      showBackLink
                        ? a({ href: `#/discipline/${d.id}` }, d.name)
                        : span({}, d.name),
                      " ",
                      span(
                        { className: `badge badge-${d.skillType}` },
                        d.skillType,
                      ),
                    ),
                  ),
                )
              : null,
            // Linked to Drivers column
            view.relatedDrivers.length > 0
              ? div(
                  { className: "column" },
                  heading2({ className: "section-title" }, "Linked to Drivers"),
                  ...view.relatedDrivers.map((d) =>
                    div(
                      { className: "list-item" },
                      showBackLink
                        ? a({ href: `#/driver/${d.id}` }, d.name)
                        : span({}, d.name),
                    ),
                  ),
                )
              : null,
          ),
        )
      : null,

    // Related tracks
    view.relatedTracks.length > 0
      ? div(
          { className: "detail-section" },
          heading2({ className: "section-title" }, "Modified by Tracks"),
          ...view.relatedTracks.map((t) =>
            div(
              { className: "list-item" },
              showBackLink
                ? a({ href: `#/track/${t.id}` }, t.name)
                : span({}, t.name),
              " ",
              span(
                {
                  className: `modifier ${t.modifier > 0 ? "modifier-positive" : t.modifier < 0 ? "modifier-negative" : "modifier-neutral"}`,
                },
                t.modifier > 0 ? `+${t.modifier}` : String(t.modifier),
              ),
            ),
          ),
        )
      : null,

    // Recommended Tools
    showToolsAndPatterns && view.toolReferences.length > 0
      ? div(
          { className: "detail-section" },
          heading2({ className: "section-title" }, "Recommended Tools"),
          table(
            { className: "tools-table" },
            thead({}, tr({}, th({}, "Tool"), th({}, "Use When"))),
            tbody(
              {},
              ...view.toolReferences.map((tool) =>
                tr(
                  {},
                  td(
                    {},
                    tool.url
                      ? a(
                          {
                            href: tool.url,
                            target: "_blank",
                            rel: "noopener noreferrer",
                          },
                          tool.name,
                        )
                      : tool.name,
                  ),
                  td({}, tool.useWhen),
                ),
              ),
            ),
          ),
          showBackLink
            ? p(
                { className: "see-all-link" },
                a({ href: "#/tool" }, "See all tools →"),
              )
            : null,
        )
      : null,

    // Implementation Reference
    showToolsAndPatterns && view.implementationReference
      ? div(
          { className: "detail-section" },
          heading2({ className: "section-title" }, "Implementation Patterns"),
          createCodeDisplay({
            content: view.implementationReference,
            description:
              "Project-specific implementation guidance for this skill.",
            minHeight: 450,
          }),
        )
      : null,
  );
}
