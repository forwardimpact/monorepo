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
import { createSkillFileViewer } from "../../components/skill-file-viewer.js";
import { createToolIcon } from "../../lib/card-mappers.js";
import { SKILL_PROFICIENCY_ORDER } from "@forwardimpact/map/levels";
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
 * @param {boolean} [context.showToolsAndPatterns=true] - Whether to show required tools and implementation patterns
 * @param {string} [context.agentSkillContent] - Pre-generated SKILL.md content for agent file viewer
 * @returns {HTMLElement}
 */
/**
 * Create the required tools section
 * @param {Object} view
 * @param {boolean} showBackLink
 * @returns {HTMLElement}
 */
function createToolsSection(view, showBackLink) {
  return div(
    { className: "detail-section" },
    heading2({ className: "section-title" }, "Required Tools"),
    table(
      { className: "tools-table" },
      thead({}, tr({}, th({}, "Tool"), th({}, "Use When"))),
      tbody(
        {},
        ...view.toolReferences.map((tool) =>
          tr(
            {},
            td(
              { className: "tool-name-cell" },
              tool.simpleIcon
                ? createToolIcon(tool.simpleIcon, tool.name)
                : null,
              tool.url
                ? a(
                    {
                      href: tool.url,
                      target: "_blank",
                      rel: "noopener noreferrer",
                    },
                    tool.name,
                    span({ className: "external-icon" }, " ↗"),
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
  );
}

/**
 * Create the related disciplines and drivers section
 * @param {Object} view
 * @param {boolean} showBackLink
 * @returns {HTMLElement|null}
 */
function createRelationsSection(view, showBackLink) {
  if (
    view.relatedDisciplines.length === 0 &&
    view.relatedDrivers.length === 0
  ) {
    return null;
  }
  return div(
    { className: "detail-section" },
    div(
      { className: "content-columns" },
      view.relatedDisciplines.length > 0
        ? div(
            { className: "column" },
            heading2({ className: "section-title" }, "Used in Disciplines"),
            ...view.relatedDisciplines.map((d) =>
              div(
                { className: "list-item" },
                showBackLink
                  ? a({ href: `#/discipline/${d.id}` }, d.name)
                  : span({}, d.name),
                " ",
                span({ className: `badge badge-${d.skillType}` }, d.skillType),
              ),
            ),
          )
        : null,
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
  );
}

export function skillToDOM(
  skill,
  {
    disciplines,
    tracks,
    drivers,
    capabilities,
    showBackLink = true,
    showToolsAndPatterns = true,
    agentSkillContent,
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
    createJsonLdScript(skillToJsonLd(skill, { capabilities })),
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

    div(
      { className: "detail-section" },
      heading2({ className: "section-title" }, "Level Descriptions"),
      table(
        { className: "level-table" },
        thead({}, tr({}, th({}, "Level"), th({}, "Description"))),
        tbody(
          {},
          ...SKILL_PROFICIENCY_ORDER.map((level, index) => {
            const description = view.proficiencyDescriptions[level] || "—";
            return tr(
              {},
              createLevelCell(index + 1, SKILL_PROFICIENCY_ORDER.length, level),
              td({}, description),
            );
          }),
        ),
      ),
    ),

    createRelationsSection(view, showBackLink),

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

    showToolsAndPatterns && view.toolReferences.length > 0
      ? createToolsSection(view, showBackLink)
      : null,

    showToolsAndPatterns &&
      (agentSkillContent || view.implementationReference || view.installScript)
      ? div(
          { className: "detail-section" },
          heading2({ className: "section-title" }, "Agent Skill Files"),
          createSkillFileViewer({
            files: buildSkillFiles(view, agentSkillContent),
            maxHeight: 450,
          }),
        )
      : null,
  );
}

/**
 * Build file descriptors for the skill file viewer
 * @param {import('./shared.js').SkillDetailView} view
 * @param {string} [agentSkillContent] - Pre-generated SKILL.md content
 * @returns {import('../../components/skill-file-viewer.js').SkillFile[]}
 */
function buildSkillFiles(view, agentSkillContent) {
  /** @type {import('../../components/skill-file-viewer.js').SkillFile[]} */
  const files = [];

  if (agentSkillContent) {
    files.push({
      filename: "SKILL.md",
      content: agentSkillContent,
      language: "markdown",
    });
  }

  if (view.installScript) {
    files.push({
      filename: "scripts/install.sh",
      content: view.installScript,
      language: "bash",
    });
  }

  if (view.implementationReference) {
    files.push({
      filename: "references/REFERENCE.md",
      content: view.implementationReference,
      language: "markdown",
    });
  }

  return files;
}
