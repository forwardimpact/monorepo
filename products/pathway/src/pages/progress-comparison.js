/**
 * Comparison result builder for progress page
 */

import { div, h2, a, section } from "../lib/render.js";
import { createStatCard } from "../components/card.js";
import {
  createComparisonSkillRadar,
  createComparisonBehaviourRadar,
} from "../components/comparison-radar.js";
import { createProgressionTable } from "../components/progression-table.js";

/**
 * Build the comparison result DOM from a progression view
 * @param {Object} progressionView
 * @param {Object} currentJobView
 * @param {Object} currentLevel
 * @param {Object} targetLevel
 * @param {Object|null} targetTrack
 * @param {Object} targetDiscipline
 * @param {Object} data
 * @returns {HTMLElement}
 */
export function buildComparisonResult(
  progressionView,
  currentJobView,
  currentLevel,
  targetLevel,
  targetTrack,
  targetDiscipline,
  data,
) {
  const { skillChanges, behaviourChanges, summary, target } = progressionView;

  return div(
    { className: "comparison-result" },
    div(
      { className: "grid grid-6" },
      summary.skillsGained > 0
        ? createStatCard({ value: summary.skillsGained, label: "New Skills" })
        : null,
      createStatCard({ value: summary.skillsUp, label: "Skills to Grow" }),
      summary.skillsDown > 0
        ? createStatCard({
            value: summary.skillsDown,
            label: "Skills Decrease",
          })
        : null,
      summary.skillsLost > 0
        ? createStatCard({ value: summary.skillsLost, label: "Skills Removed" })
        : null,
      createStatCard({
        value: summary.behavioursUp,
        label: "Behaviours to Mature",
      }),
      summary.behavioursDown > 0
        ? createStatCard({
            value: summary.behavioursDown,
            label: "Behaviours Decrease",
          })
        : null,
    ),
    div(
      { className: "section auto-grid-lg" },
      createComparisonSkillRadar(
        currentJobView.skillMatrix,
        target.skillMatrix,
        {
          title: "Skills Comparison",
          currentLabel: `Current (${currentLevel.id})`,
          targetLabel: `Target (${targetLevel.id})`,
          size: 400,
          capabilities: data.capabilities,
        },
      ),
      createComparisonBehaviourRadar(
        currentJobView.behaviourProfile,
        target.behaviourProfile,
        {
          title: "Behaviours Comparison",
          currentLabel: `Current (${currentLevel.id})`,
          targetLabel: `Target (${targetLevel.id})`,
          size: 400,
        },
      ),
    ),
    section(
      { className: "section section-detail" },
      h2({ className: "section-title" }, "Skill Changes"),
      createProgressionTable(skillChanges, "skill"),
    ),
    section(
      { className: "section section-detail" },
      h2({ className: "section-title" }, "Behaviour Changes"),
      createProgressionTable(behaviourChanges, "behaviour"),
    ),
    div(
      { className: "page-actions" },
      a(
        {
          href: targetTrack
            ? `#/job/${targetDiscipline.id}/${targetLevel.id}/${targetTrack.id}`
            : `#/job/${targetDiscipline.id}/${targetLevel.id}`,
          className: "btn btn-secondary",
        },
        `View ${targetLevel.id}${targetTrack ? ` ${targetTrack.name}` : ""} Job Definition →`,
      ),
    ),
  );
}
