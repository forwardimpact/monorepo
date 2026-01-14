/**
 * Chapter Slide View
 *
 * Displays chapter cover slides for each section.
 */

import { div, h1, p, span } from "../lib/render.js";

/**
 * Render chapter slide
 * @param {Object} params
 * @param {Function} params.render
 * @param {Object} params.data
 * @param {Object} params.params
 */
export function renderChapterSlide({ render, data, params }) {
  const { chapter } = params;
  const { framework } = data;

  const chapterConfig = {
    driver: {
      title: framework.entityDefinitions.driver.title,
      emoji: framework.entityDefinitions.driver.emoji,
      description: framework.entityDefinitions.driver.description,
    },
    skill: {
      title: framework.entityDefinitions.skill.title,
      emoji: framework.entityDefinitions.skill.emoji,
      description: framework.entityDefinitions.skill.description,
    },
    behaviour: {
      title: framework.entityDefinitions.behaviour.title,
      emoji: framework.entityDefinitions.behaviour.emoji,
      description: framework.entityDefinitions.behaviour.description,
    },
    discipline: {
      title: framework.entityDefinitions.discipline.title,
      emoji: framework.entityDefinitions.discipline.emoji,
      description: framework.entityDefinitions.discipline.description,
    },
    grade: {
      title: framework.entityDefinitions.grade.title,
      emoji: framework.entityDefinitions.grade.emoji,
      description: framework.entityDefinitions.grade.description,
    },
    track: {
      title: framework.entityDefinitions.track.title,
      emoji: framework.entityDefinitions.track.emoji,
      description: framework.entityDefinitions.track.description,
    },
    job: {
      title: framework.entityDefinitions.job.title,
      emoji: framework.entityDefinitions.job.emoji,
      description: framework.entityDefinitions.job.description,
    },
  };

  const config = chapterConfig[chapter];

  if (!config) {
    render(
      div(
        { className: "slide-error" },
        h1({}, "Chapter Not Found"),
        p({}, `No chapter found with ID: ${chapter}`),
      ),
    );
    return;
  }

  const slide = div(
    { className: "slide chapter-cover" },
    h1(
      { className: "chapter-title" },
      config.emoji ? `${config.emoji} ` : "",
      span({ className: "gradient-text" }, config.title),
    ),
    p({ className: "chapter-description" }, config.description.trim()),
  );

  render(slide);
}
