/**
 * Radar chart component wrapper
 */

/** @typedef {import('../types.js').SkillMatrixItem} SkillMatrixItem */
/** @typedef {import('../types.js').BehaviourProfileItem} BehaviourProfileItem */

import { RadarChart } from "../lib/radar.js";
import { div, h3 } from "../lib/render.js";
import {
  getSkillLevelIndex,
  getBehaviourMaturityIndex,
  formatLevel,
} from "../lib/render.js";

/**
 * Create a skill radar chart
 * @param {SkillMatrixItem[]} skillMatrix - Skill matrix entries
 * @param {Object} [options]
 * @returns {HTMLElement}
 */
export function createSkillRadar(skillMatrix, options = {}) {
  const container = div(
    { className: "radar-container" },
    h3({ className: "radar-title" }, options.title || "Skills Radar"),
    div({ className: "radar-chart-wrapper", id: "skill-radar-wrapper" }),
  );

  // Render chart after container is in DOM
  setTimeout(() => {
    const wrapper = container.querySelector("#skill-radar-wrapper");
    if (!wrapper || !skillMatrix || skillMatrix.length === 0) return;

    const data = skillMatrix.map((skill) => ({
      label: skill.skillName,
      value: getSkillLevelIndex(skill.level),
      maxValue: 5,
      description: `${formatLevel(skill.type)} skill - ${formatLevel(skill.level)}`,
    }));

    const chart = new RadarChart({
      container: wrapper,
      data,
      options: {
        levels: 5,
        color: options.color || "#3b82f6",
        strokeColor: options.strokeColor || "#2563eb",
        size: options.size || 400,
        showLabels: true,
        showTooltips: true,
      },
    });

    chart.render();
  }, 0);

  return container;
}

/**
 * Create a behaviour radar chart
 * @param {BehaviourProfileItem[]} behaviourProfile - Behaviour profile entries
 * @param {Object} [options]
 * @returns {HTMLElement}
 */
export function createBehaviourRadar(behaviourProfile, options = {}) {
  const container = div(
    { className: "radar-container" },
    h3({ className: "radar-title" }, options.title || "Behaviours Radar"),
    div({ className: "radar-chart-wrapper", id: "behaviour-radar-wrapper" }),
  );

  // Render chart after container is in DOM
  setTimeout(() => {
    const wrapper = container.querySelector("#behaviour-radar-wrapper");
    if (!wrapper || !behaviourProfile || behaviourProfile.length === 0) return;

    const data = behaviourProfile.map((behaviour) => ({
      label: behaviour.behaviourName,
      value: getBehaviourMaturityIndex(behaviour.maturity),
      maxValue: 5,
      description: `${formatLevel(behaviour.maturity)}`,
    }));

    const chart = new RadarChart({
      container: wrapper,
      data,
      options: {
        levels: 5,
        color: options.color || "#10b981",
        strokeColor: options.strokeColor || "#059669",
        size: options.size || 400,
        showLabels: true,
        showTooltips: true,
      },
    });

    chart.render();
  }, 0);

  return container;
}
