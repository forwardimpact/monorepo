/**
 * Modifier table component for displaying skill/behaviour modifiers
 */

import {
  div,
  span,
  table,
  thead,
  tbody,
  tr,
  th,
  td,
  a,
} from "../lib/render.js";
import { createBadge } from "./card.js";

/**
 * Create a modifier badge based on value
 * @param {number} modifier - The modifier value
 * @returns {HTMLElement}
 */
function createModifierBadge(modifier) {
  if (modifier > 0) {
    return createBadge(`+${modifier}`, "broad");
  } else if (modifier < 0) {
    return createBadge(`${modifier}`, "negative");
  }
  return createBadge(`${modifier}`, "secondary");
}

/**
 * Create a table displaying modifiers for skills or behaviours
 * @param {Object} options - Configuration options
 * @param {Array} options.modifiers - Array of {id, name, modifier} objects
 * @param {string} options.basePath - Base path for links (e.g., '/skill', '/behaviour')
 * @param {string} options.itemLabel - Label for the first column (e.g., 'Skill', 'Behaviour')
 * @returns {HTMLElement}
 */
export function createModifierTable({ modifiers, basePath, itemLabel }) {
  const rows = modifiers.map((m) =>
    tr(
      {},
      td({}, a({ href: `#${basePath}/${m.id}` }, m.name)),
      td({}, createModifierBadge(m.modifier)),
    ),
  );

  return div(
    { className: "table-container" },
    table(
      { className: "table modifier-table" },
      thead({}, tr({}, th({}, itemLabel), th({}, "Modifier"))),
      tbody({}, ...rows),
    ),
  );
}

/**
 * Create a behaviour modifiers table
 * @param {Array} modifiers - Array of {id, name, modifier} objects
 * @returns {HTMLElement}
 */
export function createBehaviourModifierTable(modifiers) {
  return createModifierTable({
    modifiers,
    basePath: "/behaviour",
    itemLabel: "Behaviour",
  });
}

/**
 * Create a skill modifiers table
 * @param {Array} modifiers - Array of {id, name, modifier} objects
 * @returns {HTMLElement}
 */
export function createSkillModifierTable(modifiers) {
  return createModifierTable({
    modifiers,
    basePath: "/skill",
    itemLabel: "Skill",
  });
}

/**
 * Create a skill modifiers table with capability support
 * Used for tracks which can have capability-level modifiers with nested skill links
 * @param {Array} modifiers - Array of {id, name, modifier, isCapability?, skills?} objects
 * @returns {HTMLElement}
 */
export function createSkillModifierTableWithCapabilities(modifiers) {
  const rows = modifiers.map((m) => {
    if (m.isCapability && m.skills) {
      // Capability row: show capability name (not linked) with nested skill list
      const skillLinks = m.skills.map((skill, index) => {
        if (index < m.skills.length - 1) {
          return span({}, a({ href: `#/skill/${skill.id}` }, skill.name), ", ");
        }
        return a({ href: `#/skill/${skill.id}` }, skill.name);
      });

      return tr(
        {},
        td(
          {},
          div({ style: "font-weight: 500;" }, m.name),
          div(
            {
              style:
                "font-size: 0.85em; color: var(--text-secondary); margin-top: 0.25rem;",
            },
            ...skillLinks,
          ),
        ),
        td({}, createModifierBadge(m.modifier)),
      );
    } else if (m.isCapability) {
      // Capability row without nested skills: show simple text
      return tr(
        {},
        td({}, `All ${m.name} skills`),
        td({}, createModifierBadge(m.modifier)),
      );
    } else {
      // Individual skill row: show linked skill name
      return tr(
        {},
        td({}, a({ href: `#/skill/${m.id}` }, m.name)),
        td({}, createModifierBadge(m.modifier)),
      );
    }
  });

  return div(
    { className: "table-container" },
    table(
      { className: "table modifier-table" },
      thead({}, tr({}, th({}, "Skill"), th({}, "Modifier"))),
      tbody({}, ...rows),
    ),
  );
}
