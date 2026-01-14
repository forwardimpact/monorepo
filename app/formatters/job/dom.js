/**
 * Job formatting for DOM/web output
 */

import {
  div,
  h1,
  h2,
  p,
  a,
  span,
  button,
  section,
  details,
  summary,
} from "../../lib/render.js";
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
import { markdownToHtml } from "../../lib/markdown.js";
import { formatJobDescription } from "./description.js";

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
  } = options;

  const hasEntities = discipline && grade && track;

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
      createSkillRadar(view.skillMatrix, {
        title: "Skills Radar",
        size: 420,
      }),
      createBehaviourRadar(view.behaviourProfile, {
        title: "Behaviours Radar",
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
        })
      : null,

    // Skill matrix, Behaviour profile, Driver coverage tables
    showTables
      ? div(
          { className: "job-tables-section" },
          createDetailSection({
            title: "Skill Matrix",
            content: createSkillMatrix(view.skillMatrix),
          }),

          // Behaviour profile table
          createDetailSection({
            title: "Behaviour Profile",
            content: createBehaviourProfile(view.behaviourProfile),
          }),

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

          // Handoff Checklists
          view.checklists && hasChecklistItems(view.checklists)
            ? createDetailSection({
                title: "📋 Handoff Checklists",
                content: createChecklistSections(view.checklists),
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
 * Check if any checklist has items
 * @param {Object} checklists - Checklists object keyed by handoff type
 * @returns {boolean}
 */
function hasChecklistItems(checklists) {
  for (const items of Object.values(checklists)) {
    if (items && items.length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Create collapsible checklist sections for all handoffs
 * @param {Object} checklists - Checklists object keyed by handoff type
 * @returns {HTMLElement}
 */
function createChecklistSections(checklists) {
  const handoffLabels = {
    plan_to_code: "📋 → 💻 Plan → Code",
    code_to_review: "💻 → ✅ Code → Review",
  };

  const sections = Object.entries(checklists)
    .filter(([_, items]) => items && items.length > 0)
    .map(([handoff, groups]) => {
      const label = handoffLabels[handoff] || handoff;
      const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);

      return details(
        { className: "checklist-section" },
        summary(
          { className: "checklist-section-header" },
          span({ className: "checklist-section-label" }, label),
          span({ className: "badge badge-default" }, `${totalItems} items`),
        ),
        div(
          { className: "checklist-section-content" },
          ...groups.map((group) => createChecklistGroup(group)),
        ),
      );
    });

  return div({ className: "checklist-sections" }, ...sections);
}

/**
 * Create a checklist group for a capability
 * @param {Object} group - Group with capability, level, and items
 * @returns {HTMLElement}
 */
function createChecklistGroup(group) {
  const emoji = group.capability.emoji || "📌";
  const capabilityName = group.capability.name || group.capability.id;

  return div(
    { className: "checklist-group" },
    div(
      { className: "checklist-group-header" },
      span({ className: "checklist-emoji" }, emoji),
      span({ className: "checklist-capability" }, capabilityName),
      span({ className: "badge badge-secondary" }, group.level),
    ),
    div(
      { className: "checklist-items" },
      ...group.items.map((item) =>
        div(
          { className: "checklist-item" },
          span({ className: "checklist-checkbox" }, "☐"),
          span({}, item),
        ),
      ),
    ),
  );
}

/**
 * Create the job description section with copy button
 * @param {Object} params
 * @param {Object} params.job - The job definition
 * @param {Object} params.discipline - The discipline
 * @param {Object} params.grade - The grade
 * @param {Object} params.track - The track
 * @returns {HTMLElement} The job description section element
 */
export function createJobDescriptionSection({ job, discipline, grade, track }) {
  const markdown = formatJobDescription({
    job,
    discipline,
    grade,
    track,
  });

  const copyButton = button(
    {
      className: "btn btn-primary copy-btn",
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(markdown);
          copyButton.textContent = "✓ Copied!";
          copyButton.classList.add("copied");
          setTimeout(() => {
            copyButton.textContent = "Copy Markdown";
            copyButton.classList.remove("copied");
          }, 2000);
        } catch (err) {
          console.error("Failed to copy:", err);
          copyButton.textContent = "Copy failed";
          setTimeout(() => {
            copyButton.textContent = "Copy Markdown";
          }, 2000);
        }
      },
    },
    "Copy Markdown",
  );

  const copyHtmlButton = button(
    {
      className: "btn btn-secondary copy-btn",
      onClick: async () => {
        try {
          const html = markdownToHtml(markdown);
          // Use ClipboardItem with text/html MIME type for rich text pasting in Word
          const blob = new Blob([html], { type: "text/html" });
          const clipboardItem = new ClipboardItem({ "text/html": blob });
          await navigator.clipboard.write([clipboardItem]);
          copyHtmlButton.textContent = "✓ Copied!";
          copyHtmlButton.classList.add("copied");
          setTimeout(() => {
            copyHtmlButton.textContent = "Copy as HTML";
            copyHtmlButton.classList.remove("copied");
          }, 2000);
        } catch (err) {
          console.error("Failed to copy:", err);
          copyHtmlButton.textContent = "Copy failed";
          setTimeout(() => {
            copyHtmlButton.textContent = "Copy as HTML";
          }, 2000);
        }
      },
    },
    "Copy as HTML",
  );

  const textarea = document.createElement("textarea");
  textarea.className = "job-description-textarea";
  textarea.readOnly = true;
  textarea.value = markdown;

  return createDetailSection({
    title: "Job Description",
    content: div(
      { className: "job-description-container" },
      div(
        { className: "job-description-header" },
        p(
          { className: "text-muted" },
          "Copy this markdown-formatted job description for use in job postings, documentation, or sharing.",
        ),
        div({ className: "button-group" }, copyButton, copyHtmlButton),
      ),
      textarea,
    ),
  });
}

/**
 * Create a print-only HTML version of the job description
 * This is hidden on screen and only visible when printing
 * @param {Object} params
 * @param {Object} params.job - The job definition
 * @param {Object} params.discipline - The discipline
 * @param {Object} params.grade - The grade
 * @param {Object} params.track - The track
 * @returns {HTMLElement} The job description HTML element (print-only)
 */
export function createJobDescriptionHtml({ job, discipline, grade, track }) {
  const markdown = formatJobDescription({
    job,
    discipline,
    grade,
    track,
  });

  const html = markdownToHtml(markdown);

  const container = div({ className: "job-description-print-only" });
  container.innerHTML = html;

  return section(
    { className: "section job-description-print-section" },
    h2({ className: "section-title" }, "Job Description"),
    container,
  );
}
