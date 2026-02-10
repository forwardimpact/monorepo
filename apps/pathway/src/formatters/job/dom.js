/**
 * Job formatting for DOM/web output
 */

import { div, h1, h2, p, a, span, section } from "../../lib/render.js";
import { createBackLink } from "../../components/nav.js";
import {
  createDetailSection,
  createExpectationsCard,
} from "../../components/detail.js";
import {
  createSkillRadar,
  createBehaviourRadar,
} from "../../components/radar-chart.js";
import { createSkillMatrix } from "../../components/skill-matrix.js";
import { createBehaviourProfile } from "../../components/behaviour-profile.js";
import { createCodeDisplay } from "../../components/code-display.js";
import { markdownToHtml } from "../../lib/markdown.js";
import { formatJobDescription } from "./description.js";
import { createToolkitTable } from "../toolkit/dom.js";

/**
 * Format job detail as DOM elements
 * @param {Object} view - Job detail view from presenter
 * @param {Object} options - Formatting options
 * @param {boolean} [options.showBackLink=true] - Whether to show back navigation link
 * @param {boolean} [options.showTables=true] - Whether to show Skill Matrix, Behaviour Profile, Driver Coverage tables
 * @param {boolean} [options.showJobDescriptionHtml=false] - Whether to show HTML job description (for print)
 * @param {boolean} [options.showJobDescriptionMarkdown=true] - Whether to show copyable markdown section
 * @param {Object} [options.discipline] - Discipline entity for job description
 * @param {Object} [options.grade] - Grade entity for job description
 * @param {Object} [options.track] - Track entity for job description
 * @param {string} [options.jobTemplate] - Mustache template for job description
 * @returns {HTMLElement}
 */
export function jobToDOM(view, options = {}) {
  const {
    showBackLink = true,
    showTables = true,
    showJobDescriptionHtml = false,
    showJobDescriptionMarkdown = true,
    discipline,
    grade,
    track,
    jobTemplate,
  } = options;

  const hasEntities = discipline && grade && jobTemplate;

  return div(
    { className: "job-detail-page" },
    // Header
    div(
      { className: "page-header" },
      showBackLink
        ? createBackLink("/job-builder", "← Back to Job Builder")
        : null,
      h1({ className: "page-title" }, view.title),
      div(
        { className: "page-description" },
        "Generated from: ",
        a({ href: `#/discipline/${view.disciplineId}` }, view.disciplineName),
        " × ",
        a({ href: `#/grade/${view.gradeId}` }, view.gradeId),
        " × ",
        a({ href: `#/track/${view.trackId}` }, view.trackName),
      ),
    ),

    // Expectations card
    view.expectations && Object.keys(view.expectations).length > 0
      ? createDetailSection({
          title: "Expectations",
          content: createExpectationsCard(view.expectations),
        })
      : null,

    // Radar charts
    div(
      { className: "section auto-grid-lg" },
      createBehaviourRadar(view.behaviourProfile, {
        title: "Behaviours Radar",
        size: 420,
      }),
      createSkillRadar(view.skillMatrix, {
        title: "Skills Radar",
        size: 420,
      }),
    ),

    // Job Description HTML (for print view)
    showJobDescriptionHtml && hasEntities
      ? createJobDescriptionHtml({
          job: {
            title: view.title,
            skillMatrix: view.skillMatrix,
            behaviourProfile: view.behaviourProfile,
            expectations: view.expectations,
            derivedResponsibilities: view.derivedResponsibilities,
          },
          discipline,
          grade,
          track,
          template: jobTemplate,
        })
      : null,

    // Behaviour profile, Skill matrix, Toolkit, Driver coverage tables
    showTables
      ? div(
          { className: "job-tables-section" },
          // Behaviour profile table
          createDetailSection({
            title: "Behaviour Profile",
            content: createBehaviourProfile(view.behaviourProfile),
          }),

          createDetailSection({
            title: "Skill Matrix",
            content: createSkillMatrix(view.skillMatrix),
          }),

          // Toolkit (after skill matrix)
          view.toolkit && view.toolkit.length > 0
            ? createDetailSection({
                title: "Tool Kit",
                content: createToolkitTable(view.toolkit),
              })
            : null,

          // Driver coverage
          view.driverCoverage.length > 0
            ? createDetailSection({
                title: "Driver Coverage",
                content: div(
                  {},
                  p(
                    { className: "text-muted", style: "margin-bottom: 1rem" },
                    "How well this job aligns with organizational outcome drivers.",
                  ),
                  createDriverCoverageDisplay(view.driverCoverage),
                ),
              })
            : null,
        )
      : null,

    // Job Description (copyable markdown)
    showJobDescriptionMarkdown && hasEntities
      ? createJobDescriptionSection({
          job: {
            title: view.title,
            skillMatrix: view.skillMatrix,
            behaviourProfile: view.behaviourProfile,
            expectations: view.expectations,
            derivedResponsibilities: view.derivedResponsibilities,
          },
          discipline,
          grade,
          track,
          template: jobTemplate,
        })
      : null,
  );
}

/**
 * Create driver coverage display
 */
function createDriverCoverageDisplay(coverage) {
  const items = coverage.map((c) => {
    const percentage = Math.round(c.coverage * 100);

    return div(
      { className: "driver-coverage-item" },
      div(
        { className: "driver-coverage-header" },
        a(
          {
            href: `#/driver/${c.id}`,
            className: "driver-coverage-name",
          },
          c.name,
        ),
        span({ className: "driver-coverage-score" }, `${percentage}%`),
      ),
      div(
        { className: "progress-bar" },
        div({
          className: "progress-bar-fill",
          style: `width: ${percentage}%; background: ${getScoreColor(c.coverage)}`,
        }),
      ),
    );
  });

  return div({ className: "driver-coverage" }, ...items);
}

/**
 * Get color based on score
 */
function getScoreColor(score) {
  if (score >= 0.8) return "#10b981"; // Green
  if (score >= 0.5) return "#f59e0b"; // Yellow
  return "#ef4444"; // Red
}

/**
 * Create the job description section with copy button
 * @param {Object} params
 * @param {Object} params.job - The job definition
 * @param {Object} params.discipline - The discipline
 * @param {Object} params.grade - The grade
 * @param {Object} params.track - The track
 * @param {string} params.template - Mustache template for job description
 * @returns {HTMLElement} The job description section element
 */
export function createJobDescriptionSection({
  job,
  discipline,
  grade,
  track,
  template,
}) {
  const markdown = formatJobDescription(
    {
      job,
      discipline,
      grade,
      track,
    },
    template,
  );

  return section(
    { className: "section section-detail" },
    h2({ className: "section-title" }, "Job Description"),
    createCodeDisplay({
      content: markdown,
      filename: "job-description.md",
      description:
        "Copy this markdown-formatted job description for use in job postings, documentation, or sharing.",
      toHtml: markdownToHtml,
      minHeight: 450,
    }),
  );
}

/**
 * Create a print-only HTML version of the job description
 * This is hidden on screen and only visible when printing
 * @param {Object} params
 * @param {Object} params.job - The job definition
 * @param {Object} params.discipline - The discipline
 * @param {Object} params.grade - The grade
 * @param {Object} params.track - The track
 * @param {string} params.template - Mustache template for job description
 * @returns {HTMLElement} The job description HTML element (print-only)
 */
export function createJobDescriptionHtml({
  job,
  discipline,
  grade,
  track,
  template,
}) {
  const markdown = formatJobDescription(
    {
      job,
      discipline,
      grade,
      track,
    },
    template,
  );

  const html = markdownToHtml(markdown);

  const container = div({ className: "job-description-print-only" });
  container.innerHTML = html;

  return section(
    { className: "section job-description-print-section" },
    h2({ className: "section-title" }, "Job Description"),
    container,
  );
}
