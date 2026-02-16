/**
 * Overview Slide View
 *
 * Displays overview slides for each chapter with cards for all entities.
 */

import { div, h1, h2, p, span } from "../lib/render.js";
import { createCardList, createGroupedList } from "../components/list.js";
import { createBadge } from "../components/card.js";
import {
  disciplineToCardConfig,
  skillToCardConfig,
  behaviourToCardConfig,
  driverToCardConfig,
  gradeToCardConfig,
  trackToCardConfig,
  jobToCardConfig,
} from "../lib/card-mappers.js";
import { prepareDisciplinesList } from "../formatters/discipline/shared.js";
import { prepareSkillsList } from "../formatters/skill/shared.js";
import { prepareBehavioursList } from "../formatters/behaviour/shared.js";
import { prepareDriversList } from "../formatters/driver/shared.js";
import { prepareGradesList } from "../formatters/grade/shared.js";
import { prepareTracksList } from "../formatters/track/shared.js";
import { generateAllJobs } from "@forwardimpact/libpathway/derivation";

/**
 * Format discipline group name for display
 * @param {string} groupName - Group name (professional/management)
 * @returns {string}
 */
function formatDisciplineGroupName(groupName) {
  if (groupName === "professional") return "Professional";
  if (groupName === "management") return "Management";
  return groupName.charAt(0).toUpperCase() + groupName.slice(1);
}

/**
 * Render discipline group header
 * @param {string} groupName - Group name
 * @param {number} count - Number of items in group
 * @returns {HTMLElement}
 */
function renderDisciplineGroupHeader(groupName, count) {
  return div(
    { className: "capability-header" },
    h2({ className: "capability-title" }, formatDisciplineGroupName(groupName)),
    createBadge(`${count}`, "default"),
  );
}

/**
 * Render overview slide
 * @param {Object} params
 * @param {Function} params.render
 * @param {Object} params.data
 * @param {Object} params.params
 */
export function renderOverviewSlide({ render, data, params }) {
  const { chapter } = params;
  const { framework } = data;

  const chapterConfig = {
    driver: {
      title: framework.entityDefinitions.driver.title,
      emojiIcon: framework.entityDefinitions.driver.emojiIcon,
      description: framework.entityDefinitions.driver.description,
      entities: prepareDriversList(data.drivers).items,
      mapper: driverToCardConfig,
    },
    skill: {
      title: framework.entityDefinitions.skill.title,
      emojiIcon: framework.entityDefinitions.skill.emojiIcon,
      description: framework.entityDefinitions.skill.description,
      entities: Object.values(
        prepareSkillsList(data.skills, data.capabilities).groups,
      ).flat(),
      mapper: (skill) => skillToCardConfig(skill, data.capabilities),
    },
    behaviour: {
      title: framework.entityDefinitions.behaviour.title,
      emojiIcon: framework.entityDefinitions.behaviour.emojiIcon,
      description: framework.entityDefinitions.behaviour.description,
      entities: prepareBehavioursList(data.behaviours).items,
      mapper: behaviourToCardConfig,
    },
    discipline: {
      title: framework.entityDefinitions.discipline.title,
      emojiIcon: framework.entityDefinitions.discipline.emojiIcon,
      description: framework.entityDefinitions.discipline.description,
      groups: prepareDisciplinesList(data.disciplines).groups,
      mapper: disciplineToCardConfig,
      isGrouped: true,
    },
    grade: {
      title: framework.entityDefinitions.grade.title,
      emojiIcon: framework.entityDefinitions.grade.emojiIcon,
      description: framework.entityDefinitions.grade.description,
      entities: prepareGradesList(data.grades).items,
      mapper: gradeToCardConfig,
    },
    track: {
      title: framework.entityDefinitions.track.title,
      emojiIcon: framework.entityDefinitions.track.emojiIcon,
      description: framework.entityDefinitions.track.description,
      entities: prepareTracksList(data.tracks).items,
      mapper: trackToCardConfig,
    },
    job: {
      title: framework.entityDefinitions.job.title,
      emojiIcon: framework.entityDefinitions.job.emojiIcon,
      description: framework.entityDefinitions.job.description,
      entities: generateAllJobs({
        disciplines: data.disciplines,
        grades: data.grades,
        tracks: data.tracks,
        skills: data.skills,
        behaviours: data.behaviours,
        validationRules: data.framework.validationRules,
      }),
      mapper: jobToCardConfig,
    },
  };

  const config = chapterConfig[chapter];

  if (!config) {
    render(
      div(
        { className: "slide-error" },
        h1({}, "Overview Not Found"),
        p({}, `No overview found for chapter: ${chapter}`),
      ),
    );
    return;
  }

  // Render content based on whether it's grouped or flat
  const contentElement = config.isGrouped
    ? createGroupedList(
        config.groups,
        config.mapper,
        renderDisciplineGroupHeader,
      )
    : createCardList(config.entities, config.mapper, "No items found.");

  const slide = div(
    { className: "slide overview-slide" },
    div(
      { className: "overview-header" },
      h1(
        { className: "overview-title" },
        config.emojiIcon ? `${config.emojiIcon} ` : "",
        span({ className: "gradient-text" }, config.title),
      ),
      p({ className: "overview-description" }, config.description.trim()),
    ),
    contentElement,
  );

  render(slide);
}
