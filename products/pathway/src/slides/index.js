/**
 * Slide Index
 *
 * Shows a navigation index for all available slides.
 */

import { div, heading1, heading2, p, a, ul, li, span } from "../lib/render.js";
import { getConceptEmoji } from "@forwardimpact/map/levels";
import { generateAllJobs } from "@forwardimpact/libskill/derivation";

/**
 * Render the slide index
 * @param {Object} params
 * @param {Function} params.render
 * @param {Object} params.data
 */
export function renderSlideIndex({ render, data }) {
  const { framework } = data;
  const slide = div(
    { className: "slide slide-index" },
    div(
      { className: "page-header" },
      heading1(
        { className: "page-title" },
        `${framework.emojiIcon} ${framework.title}`,
      ),
      p(
        { className: "page-description" },
        "Slide view for printing and presentations. Select a category below.",
      ),
    ),

    // Disciplines
    div(
      { className: "slide-section" },
      a(
        { href: "#/overview/discipline" },
        heading2(
          { className: "slide-section-title" },
          `${getConceptEmoji(data.framework, "discipline")} `,
          span({ className: "gradient-text" }, "Disciplines"),
        ),
      ),
      ul(
        { className: "related-list" },
        ...data.disciplines.map((discipline) =>
          li(
            {},
            a(
              { href: `#/discipline/${discipline.id}` },
              discipline.specialization || discipline.name,
            ),
          ),
        ),
      ),
    ),

    // Levels
    div(
      { className: "slide-section" },
      a(
        { href: "#/overview/level" },
        heading2(
          { className: "slide-section-title" },
          `${getConceptEmoji(data.framework, "level")} `,
          span({ className: "gradient-text" }, "Levels"),
        ),
      ),
      ul(
        { className: "related-list" },
        ...data.levels.map((level) =>
          li(
            {},
            a(
              { href: `#/level/${level.id}` },
              `${level.id} - ${level.professionalTitle}`,
            ),
          ),
        ),
      ),
    ),

    // Tracks
    div(
      { className: "slide-section" },
      a(
        { href: "#/overview/track" },
        heading2(
          { className: "slide-section-title" },
          `${getConceptEmoji(data.framework, "track")} `,
          span({ className: "gradient-text" }, "Tracks"),
        ),
      ),
      ul(
        { className: "related-list" },
        ...data.tracks.map((track) =>
          li({}, a({ href: `#/track/${track.id}` }, track.name)),
        ),
      ),
    ),

    // Behaviours
    div(
      { className: "slide-section" },
      a(
        { href: "#/overview/behaviour" },
        heading2(
          { className: "slide-section-title" },
          `${getConceptEmoji(data.framework, "behaviour")} `,
          span({ className: "gradient-text" }, "Behaviours"),
        ),
      ),
      ul(
        { className: "related-list" },
        ...data.behaviours.map((behaviour) =>
          li({}, a({ href: `#/behaviour/${behaviour.id}` }, behaviour.name)),
        ),
      ),
    ),

    // Skills
    div(
      { className: "slide-section" },
      a(
        { href: "#/overview/skill" },
        heading2(
          { className: "slide-section-title" },
          `${getConceptEmoji(data.framework, "skill")} `,
          span({ className: "gradient-text" }, "Skills"),
        ),
      ),
      ul(
        { className: "related-list" },
        ...data.skills.map((skill) =>
          li({}, a({ href: `#/skill/${skill.id}` }, skill.name)),
        ),
      ),
    ),

    // Drivers
    div(
      { className: "slide-section" },
      a(
        { href: "#/overview/driver" },
        heading2(
          { className: "slide-section-title" },
          `${getConceptEmoji(data.framework, "driver")} `,
          span({ className: "gradient-text" }, "Drivers"),
        ),
      ),
      ul(
        { className: "related-list" },
        ...data.drivers.map((driver) =>
          li({}, a({ href: `#/driver/${driver.id}` }, driver.name)),
        ),
      ),
    ),

    // Jobs
    div(
      { className: "slide-section" },
      a(
        { href: "#/overview/job" },
        heading2(
          { className: "slide-section-title" },
          `${getConceptEmoji(data.framework, "job")} `,
          span(
            { className: "gradient-text" },
            data.framework.entityDefinitions.job.title,
          ),
        ),
      ),
      ul(
        { className: "related-list" },
        ...generateAllJobs({
          disciplines: data.disciplines,
          levels: data.levels,
          tracks: data.tracks,
          skills: data.skills,
          behaviours: data.behaviours,
          validationRules: data.framework.validationRules,
        }).map((job) =>
          li(
            {},
            a(
              {
                href: job.track
                  ? `#/job/${job.discipline.id}/${job.level.id}/${job.track.id}`
                  : `#/job/${job.discipline.id}/${job.level.id}`,
              },
              job.title,
            ),
          ),
        ),
      ),
    ),
  );

  render(slide);
}
