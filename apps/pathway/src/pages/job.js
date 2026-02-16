/**
 * Job detail page with visualizations
 */

import { render, div, p } from "../lib/render.js";
import { getState } from "../lib/state.js";
import { renderError } from "../components/error-page.js";
import { prepareJobDetail } from "@forwardimpact/libpathway/job";
import { jobToDOM } from "../formatters/job/dom.js";

/** @type {string|null} Cached job template */
let jobTemplateCache = null;

/**
 * Load job template with caching
 * @returns {Promise<string>}
 */
async function getJobTemplate() {
  if (!jobTemplateCache) {
    const response = await fetch("./templates/job.template.md");
    jobTemplateCache = await response.text();
  }
  return jobTemplateCache;
}

/**
 * Render job detail page
 * @param {Object} params - Route params
 */
export async function renderJobDetail(params) {
  const { discipline: disciplineId, grade: gradeId, track: trackId } = params;
  const { data } = getState();

  // Find the components
  const discipline = data.disciplines.find((d) => d.id === disciplineId);
  const grade = data.grades.find((g) => g.id === gradeId);
  const track = trackId ? data.tracks.find((t) => t.id === trackId) : null;

  if (!discipline || !grade) {
    renderError({
      title: "Job Not Found",
      message: "Invalid job combination. Discipline or grade not found.",
      backPath: "/job-builder",
      backText: "← Back to Job Builder",
    });
    return;
  }

  // If trackId was provided but not found, error
  if (trackId && !track) {
    renderError({
      title: "Job Not Found",
      message: `Track "${trackId}" not found.`,
      backPath: "/job-builder",
      backText: "← Back to Job Builder",
    });
    return;
  }

  // Use formatter shared module to get job detail view
  const jobView = prepareJobDetail({
    discipline,
    grade,
    track,
    skills: data.skills,
    behaviours: data.behaviours,
    drivers: data.drivers,
    capabilities: data.capabilities,
    stages: data.stages,
  });

  if (!jobView) {
    renderError({
      title: "Invalid Combination",
      message: "This discipline, track, and grade combination is not valid.",
      backPath: "/job-builder",
      backText: "← Back to Job Builder",
    });
    return;
  }

  // Show loading while fetching template
  render(
    div(
      { className: "job-detail-page" },
      div({ className: "loading" }, p({}, "Loading...")),
    ),
  );

  // Load template and format
  const jobTemplate = await getJobTemplate();
  const page = jobToDOM(jobView, { discipline, grade, track, jobTemplate });
  render(page);
}
