/**
 * Checklist component
 *
 * Displays derived checklists grouped by capability.
 * Used on job pages to show handoff checklists.
 */

import { div, span, details, summary } from "../lib/render.js";
import { getCapabilityEmoji } from "../model/levels.js";

/**
 * Create checklist display grouped by capability
 * @param {Array<{capability: string, items: string[]}>} checklist - Checklist groups
 * @param {Object} options - Display options
 * @param {boolean} [options.interactive=false] - Whether checkboxes are interactive
 * @param {Array} [options.capabilities] - Capabilities array for emoji lookup
 * @returns {HTMLElement}
 */
export function createChecklist(checklist, options = {}) {
  const { interactive = false, capabilities = [] } = options;

  if (!checklist || checklist.length === 0) {
    return div(
      { className: "checklist-empty text-muted" },
      "No checklist items for this transition.",
    );
  }

  return div(
    { className: "checklist" },
    ...checklist.map((group) =>
      createChecklistGroup(group, { interactive, capabilities }),
    ),
  );
}

/**
 * Create a single checklist group for a capability
 * @param {Object} group - Group with capability and items
 * @param {Object} options - Display options
 * @returns {HTMLElement}
 */
function createChecklistGroup(group, options) {
  const { interactive, capabilities } = options;
  const emoji = getCapabilityEmoji(capabilities, group.capability);
  const capabilityName = formatCapabilityName(group.capability);

  return div(
    { className: "checklist-group" },
    div(
      { className: "checklist-group-header" },
      span({ className: "checklist-emoji" }, emoji),
      span({ className: "checklist-capability" }, capabilityName),
      span(
        { className: "checklist-count badge badge-default" },
        `${group.items.length}`,
      ),
    ),
    div(
      { className: "checklist-items" },
      ...group.items.map((item) => createChecklistItem(item, { interactive })),
    ),
  );
}

/**
 * Create a single checklist item
 * @param {string} item - Checklist item text
 * @param {Object} options - Display options
 * @returns {HTMLElement}
 */
function createChecklistItem(item, { interactive }) {
  const checkbox = interactive
    ? createInteractiveCheckbox()
    : span({ className: "checklist-checkbox" }, "☐");

  return div({ className: "checklist-item" }, checkbox, span({}, item));
}

/**
 * Create an interactive checkbox element
 * @returns {HTMLElement}
 */
function createInteractiveCheckbox() {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "checklist-checkbox-input";
  return input;
}

/**
 * Format capability name for display
 * @param {string} capability - Capability ID
 * @returns {string}
 */
function formatCapabilityName(capability) {
  return capability.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Create collapsible checklist sections for multiple handoffs
 * @param {Object} checklists - Object with handoff types as keys
 * @param {Object} options - Display options
 * @param {Array} [options.capabilities] - Capabilities for emoji lookup
 * @returns {HTMLElement}
 */
export function createChecklistSections(checklists, options = {}) {
  const { capabilities = [] } = options;
  const handoffLabels = {
    plan_to_code: "📋 → 💻 Plan → Code",
    code_to_review: "💻 → ✅ Code → Review",
  };

  const sections = Object.entries(checklists)
    .filter(([_, items]) => items && items.length > 0)
    .map(([handoff, items]) => {
      const label = handoffLabels[handoff] || handoff;
      const totalItems = items.reduce((sum, g) => sum + g.items.length, 0);

      return details(
        { className: "checklist-section" },
        summary(
          { className: "checklist-section-header" },
          span({ className: "checklist-section-label" }, label),
          span(
            { className: "checklist-section-count badge badge-default" },
            `${totalItems} items`,
          ),
        ),
        div(
          { className: "checklist-section-content" },
          createChecklist(items, { capabilities }),
        ),
      );
    });

  if (sections.length === 0) {
    return div(
      { className: "checklist-empty text-muted" },
      "No checklists available for this role.",
    );
  }

  return div({ className: "checklist-sections" }, ...sections);
}
