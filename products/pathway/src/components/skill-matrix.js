/**
 * Skill matrix display component
 */

/** @typedef {import('../types.js').SkillMatrixItem} SkillMatrixItem */

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
import { getSkillProficiencyIndex } from "../lib/render.js";
import { createLevelCell } from "./detail.js";
import { createBadge } from "./card.js";
import { SKILL_PROFICIENCY_ORDER } from "@forwardimpact/map/levels";
import { truncate } from "../formatters/shared.js";

/**
 * Sort skills by capability group order, then by level descending within each group
 * @param {SkillMatrixItem[]} skills
 * @param {string[]} capabilityOrder - Ordered capability IDs
 * @returns {SkillMatrixItem[]}
 */
function sortByCapabilityThenLevel(skills, capabilityOrder) {
  const orderMap = new Map(capabilityOrder.map((id, i) => [id, i]));
  return [...skills].sort((a, b) => {
    const capA = orderMap.has(a.capability) ? orderMap.get(a.capability) : capabilityOrder.length;
    const capB = orderMap.has(b.capability) ? orderMap.get(b.capability) : capabilityOrder.length;
    if (capA !== capB) return capA - capB;
    const levelA = SKILL_PROFICIENCY_ORDER.indexOf(a.proficiency);
    const levelB = SKILL_PROFICIENCY_ORDER.indexOf(b.proficiency);
    if (levelB !== levelA) return levelB - levelA;
    return a.skillName.localeCompare(b.skillName);
  });
}

/**
 * Create a skill matrix table
 * @param {SkillMatrixItem[]} skillMatrix - Skill matrix entries
 * @param {Object} [options]
 * @param {string[]} [options.capabilityOrder] - Capability IDs in desired display order
 * @returns {HTMLElement}
 */
export function createSkillMatrix(skillMatrix, options = {}) {
  if (!skillMatrix || skillMatrix.length === 0) {
    return div({ className: "empty-state" }, "No skills in matrix");
  }

  const { capabilityOrder } = options;
  const sortedSkills = capabilityOrder
    ? sortByCapabilityThenLevel(skillMatrix, capabilityOrder)
    : [...skillMatrix];

  const rows = sortedSkills.map((skill) => {
    const levelIndex = getSkillProficiencyIndex(skill.proficiency);

    return tr(
      { className: skill.isHumanOnly ? "human-only-row" : "" },
      td(
        {},
        a({ href: `#/skill/${skill.skillId}` }, skill.skillName),
        skill.isHumanOnly
          ? span(
              {
                className: "human-only-indicator",
                title:
                  "Human-Only — Requires interpersonal skills; excluded from agents",
              },
              " 🤲",
            )
          : null,
      ),
      td({}, createBadge(skill.capability, skill.capability)),
      createLevelCell(levelIndex, 5, skill.proficiency),
      td(
        { className: "skill-description" },
        truncate(skill.proficiencyDescription, 80),
      ),
    );
  });

  return div(
    { className: "table-container" },
    table(
      { className: "table matrix-table skill-matrix" },
      thead(
        {},
        tr(
          {},
          th({}, "Skill"),
          th({}, "Capability"),
          th({}, "Level"),
          th({}, "Description"),
        ),
      ),
      tbody({}, ...rows),
    ),
  );
}
