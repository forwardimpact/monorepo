/**
 * Overview Slide View
 *
 * Displays overview slides for each chapter with cards for all entities.
 */

import { div, h1, p, span } from "../lib/render.js";
import { createCardList } from "../components/list.js";
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
import { generateAllJobs } from "../model/derivation.js";

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
      emoji: framework.entityDefinitions.driver.emoji,
      description: framework.entityDefinitions.driver.description,
      entities: prepareDriversList(data.drivers).items,
      mapper: driverToCardConfig,
    },
    skill: {
      title: framework.entityDefinitions.skill.title,
      emoji: framework.entityDefinitions.skill.emoji,
      description: framework.entityDefinitions.skill.description,
      entities: Object.values(
        prepareSkillsList(data.skills, data.capabilities).groups,
      ).flat(),
      mapper: (skill) => skillToCardConfig(skill, data.capabilities),
    },
    behaviour: {
      title: framework.entityDefinitions.behaviour.title,
      emoji: framework.entityDefinitions.behaviour.emoji,
      description: framework.entityDefinitions.behaviour.description,
      entities: prepareBehavioursList(data.behaviours).items,
      mapper: behaviourToCardConfig,
    },
    discipline: {
      title: framework.entityDefinitions.discipline.title,
      emoji: framework.entityDefinitions.discipline.emoji,
      description: framework.entityDefinitions.discipline.description,
      entities: prepareDisciplinesList(data.disciplines).items,
      mapper: disciplineToCardConfig,
    },
    grade: {
      title: framework.entityDefinitions.grade.title,
      emoji: framework.entityDefinitions.grade.emoji,
      description: framework.entityDefinitions.grade.description,
      entities: prepareGradesList(data.grades).items,
      mapper: gradeToCardConfig,
    },
    track: {
      title: framework.entityDefinitions.track.title,
      emoji: framework.entityDefinitions.track.emoji,
      description: framework.entityDefinitions.track.description,
      entities: prepareTracksList(data.tracks).items,
      mapper: trackToCardConfig,
    },
    job: {
      title: framework.entityDefinitions.job.title,
      emoji: framework.entityDefinitions.job.emoji,
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

  const slide = div(
    { className: "slide overview-slide" },
    div(
      { className: "overview-header" },
      h1(
        { className: "overview-title" },
        config.emoji ? `${config.emoji} ` : "",
        span({ className: "gradient-text" }, config.title),
      ),
      p({ className: "overview-description" }, config.description.trim()),
    ),
    createCardList(config.entities, config.mapper, "No items found."),
  );

  render(slide);
}
