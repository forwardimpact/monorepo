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
      emojiIcon: framework.entityDefinitions.driver.emojiIcon,
      description: framework.entityDefinitions.driver.description,
    },
    skill: {
      title: framework.entityDefinitions.skill.title,
      emojiIcon: framework.entityDefinitions.skill.emojiIcon,
      description: framework.entityDefinitions.skill.description,
    },
    behaviour: {
      title: framework.entityDefinitions.behaviour.title,
      emojiIcon: framework.entityDefinitions.behaviour.emojiIcon,
      description: framework.entityDefinitions.behaviour.description,
    },
    discipline: {
      title: framework.entityDefinitions.discipline.title,
      emojiIcon: framework.entityDefinitions.discipline.emojiIcon,
      description: framework.entityDefinitions.discipline.description,
    },
    grade: {
      title: framework.entityDefinitions.grade.title,
      emojiIcon: framework.entityDefinitions.grade.emojiIcon,
      description: framework.entityDefinitions.grade.description,
    },
    track: {
      title: framework.entityDefinitions.track.title,
      emojiIcon: framework.entityDefinitions.track.emojiIcon,
      description: framework.entityDefinitions.track.description,
    },
    job: {
      title: framework.entityDefinitions.job.title,
      emojiIcon: framework.entityDefinitions.job.emojiIcon,
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
      config.emojiIcon ? `${config.emojiIcon} ` : "",
      span({ className: "gradient-text" }, config.title),
    ),
    p({ className: "chapter-description" }, config.description.trim()),
  );

  render(slide);
}
