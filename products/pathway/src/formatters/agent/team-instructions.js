/**
 * Team Instructions Formatter
 *
 * Composes the track-scoped teamInstructions body and the installation-scoped
 * organizational-context section into the rendered .claude/CLAUDE.md content
 * via a Mustache template.
 */

import Mustache from "mustache";

import { trimValue } from "../shared.js";

/**
 * Format team instructions + organizational context as CLAUDE.md content.
 *
 * Returns null when both inputs are empty/whitespace (instead of an empty
 * rendered template). All call sites — CLI writeTeamInstructions, web
 * preview deriveAgentData, distribution formatContent — treat null as
 * "skip the file/section." The marker-contract last-occurrence rule lives
 * in renderOrganizationalContext and the org-context guide; this composer
 * only appends the section after the teamInstructions body.
 *
 * @param {string|null} teamInstructions
 * @param {string|null} orgSection
 * @param {string} template
 * @returns {string|null} Rendered content, or null if both inputs empty.
 */
export function formatTeamInstructions(teamInstructions, orgSection, template) {
  const ti = trimValue(teamInstructions);
  const os = trimValue(orgSection);
  if (!ti && !os) return null;
  const content = ti && os ? `${ti}\n\n${os}` : ti || os;
  return Mustache.render(template, { content });
}
