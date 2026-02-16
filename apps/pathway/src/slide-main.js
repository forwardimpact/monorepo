/**
 * Slide View Main Entry Point
 *
 * Initializes the slide viewer application with routing and data loading.
 */

import { createSlideRouter } from "./lib/router-slides.js";
import { setData, getState } from "./lib/state.js";
import { loadAllData } from "./lib/yaml-loader.js";
import { span, a } from "./lib/render.js";
import { generateAllJobs } from "@forwardimpact/libpathway/derivation";
import { sortTracksByName } from "./formatters/track/shared.js";

// Import slide renderers
import { renderChapterSlide } from "./slides/chapter.js";
import { renderOverviewSlide } from "./slides/overview.js";
import { renderSkillSlide } from "./slides/skill.js";
import { renderBehaviourSlide } from "./slides/behaviour.js";
import { renderDriverSlide } from "./slides/driver.js";
import { renderDisciplineSlide } from "./slides/discipline.js";
import { renderGradeSlide } from "./slides/grade.js";
import { renderTrackSlide } from "./slides/track.js";
import { renderJobSlide } from "./slides/job.js";
import { renderInterviewSlide } from "./slides/interview.js";
import { renderProgressSlide } from "./slides/progress.js";
import { renderSlideIndex } from "./slides/index.js";

/**
 * Get slide content container
 * @returns {HTMLElement}
 */
function getSlideContent() {
  return document.getElementById("slide-content");
}

/**
 * Hide loading indicator
 */
function hideLoading() {
  const loading = document.getElementById("slide-loading");
  if (loading) {
    loading.classList.add("hidden");
  }
}

/**
 * Show loading indicator
 */
function showLoading() {
  const loading = document.getElementById("slide-loading");
  if (loading) {
    loading.classList.remove("hidden");
  }
}

/**
 * Render error slide
 * @param {string} title
 * @param {string} message
 */
function renderError(title, message) {
  const container = getSlideContent();
  container.innerHTML = `
    <div class="slide-error">
      <h1>${title}</h1>
      <p>${message}</p>
      <a href="#/">← Back to Index</a>
    </div>
  `;
  hideLoading();
}

/**
 * Render content to slide container
 * @param {HTMLElement|string} content
 */
function renderSlide(content) {
  const container = getSlideContent();
  container.innerHTML = "";

  if (typeof content === "string") {
    container.innerHTML = content;
  } else if (content instanceof HTMLElement) {
    container.appendChild(content);
  }

  hideLoading();
}

const router = createSlideRouter({
  onNotFound: (path) =>
    renderError("Slide Not Found", `No slide found for path: ${path}`),
  renderError,
});

/**
 * Set up routes
 */
function setupRoutes() {
  // Index
  router.on("/", () => {
    renderSlideIndex({ render: renderSlide, data: getState().data });
  });

  // Chapters
  router.on("/chapter/:chapter", (params) => {
    renderChapterSlide({ render: renderSlide, data: getState().data, params });
  });

  // Overviews
  router.on("/overview/:chapter", (params) => {
    renderOverviewSlide({ render: renderSlide, data: getState().data, params });
  });

  // Skills
  router.on("/skill/:id", (params) => {
    renderSkillSlide({ render: renderSlide, data: getState().data, params });
  });

  // Behaviours
  router.on("/behaviour/:id", (params) => {
    renderBehaviourSlide({
      render: renderSlide,
      data: getState().data,
      params,
    });
  });

  // Drivers
  router.on("/driver/:id", (params) => {
    renderDriverSlide({ render: renderSlide, data: getState().data, params });
  });

  // Disciplines
  router.on("/discipline/:id", (params) => {
    renderDisciplineSlide({
      render: renderSlide,
      data: getState().data,
      params,
    });
  });

  // Grades
  router.on("/grade/:id", (params) => {
    renderGradeSlide({ render: renderSlide, data: getState().data, params });
  });

  // Tracks
  router.on("/track/:id", (params) => {
    renderTrackSlide({ render: renderSlide, data: getState().data, params });
  });

  // Jobs - new format: discipline/grade/track (track optional)
  router.on("/job/:discipline/:grade/:track", (params) => {
    renderJobSlide({ render: renderSlide, data: getState().data, params });
  });

  router.on("/job/:discipline/:grade", (params) => {
    renderJobSlide({
      render: renderSlide,
      data: getState().data,
      params: { ...params, track: null },
    });
  });

  // Interviews - new format: discipline/grade/track (track optional)
  router.on("/interview/:discipline/:grade/:track", (params) => {
    renderInterviewSlide({
      render: renderSlide,
      data: getState().data,
      params,
    });
  });

  router.on("/interview/:discipline/:grade", (params) => {
    renderInterviewSlide({
      render: renderSlide,
      data: getState().data,
      params: { ...params, track: null },
    });
  });

  // Progress - new format: discipline/grade/track (track optional)
  router.on("/progress/:discipline/:grade/:track", (params) => {
    renderProgressSlide({ render: renderSlide, data: getState().data, params });
  });

  router.on("/progress/:discipline/:grade", (params) => {
    renderProgressSlide({
      render: renderSlide,
      data: getState().data,
      params: { ...params, track: null },
    });
  });
}

/**
 * Build slide order from data for navigation
 * @param {Object} data
 * @returns {{ order: string[], boundaries: number[] }}
 */
function buildSlideOrder(data) {
  const order = ["/"];
  const boundaries = [];

  // Disciplines
  if (data.disciplines && data.disciplines.length > 0) {
    boundaries.push(order.length);
    order.push("/chapter/discipline");
    order.push("/overview/discipline");
    data.disciplines.forEach((d) => order.push(`/discipline/${d.id}`));
  }

  // Grades (moved before Tracks)
  if (data.grades && data.grades.length > 0) {
    boundaries.push(order.length);
    order.push("/chapter/grade");
    order.push("/overview/grade");
    data.grades.forEach((g) => order.push(`/grade/${g.id}`));
  }

  // Tracks (moved after Grades)
  if (data.tracks && data.tracks.length > 0) {
    boundaries.push(order.length);
    order.push("/chapter/track");
    order.push("/overview/track");
    sortTracksByName(data.tracks).forEach((t) => order.push(`/track/${t.id}`));
  }

  // Skills
  if (data.skills && data.skills.length > 0) {
    boundaries.push(order.length);
    order.push("/chapter/skill");
    order.push("/overview/skill");
    data.skills.forEach((s) => order.push(`/skill/${s.id}`));
  }

  // Behaviours
  if (data.behaviours && data.behaviours.length > 0) {
    boundaries.push(order.length);
    order.push("/chapter/behaviour");
    order.push("/overview/behaviour");
    data.behaviours.forEach((b) => order.push(`/behaviour/${b.id}`));
  }

  // Drivers
  if (data.drivers && data.drivers.length > 0) {
    boundaries.push(order.length);
    order.push("/chapter/driver");
    order.push("/overview/driver");
    data.drivers.forEach((d) => order.push(`/driver/${d.id}`));
  }

  // Jobs
  const jobs = generateAllJobs({
    disciplines: data.disciplines,
    grades: data.grades,
    tracks: data.tracks,
    skills: data.skills,
    behaviours: data.behaviours,
    validationRules: data.framework.validationRules,
  });
  if (jobs && jobs.length > 0) {
    boundaries.push(order.length);
    order.push("/chapter/job");
    order.push("/overview/job");
    jobs.forEach((job) =>
      order.push(
        job.track
          ? `/job/${job.discipline.id}/${job.grade.id}/${job.track.id}`
          : `/job/${job.discipline.id}/${job.grade.id}`,
      ),
    );
  }

  return { order, boundaries };
}

/**
 * Update navigation UI to show current position
 */
function updateNavUI() {
  const idx = router.currentIndex();
  const total = router.totalSlides();
  const prevBtn = document.getElementById("prev-slide");
  const nextBtn = document.getElementById("next-slide");
  const prevChapterBtn = document.getElementById("prev-chapter");
  const nextChapterBtn = document.getElementById("next-chapter");
  const indicator = document.getElementById("slide-indicator");

  if (indicator) {
    indicator.textContent = total > 0 ? `${idx + 1} / ${total}` : "";
  }
  if (prevBtn) {
    prevBtn.disabled = idx <= 0;
  }
  if (nextBtn) {
    nextBtn.disabled = idx >= total - 1 || idx < 0;
  }
  if (prevChapterBtn) {
    prevChapterBtn.disabled = idx <= 0;
  }
  if (nextChapterBtn) {
    nextChapterBtn.disabled = idx >= total - 1 || idx < 0;
  }
}

/**
 * Set up navigation UI event handlers
 */
function setupNavUI() {
  const prevBtn = document.getElementById("prev-slide");
  const nextBtn = document.getElementById("next-slide");
  const prevChapterBtn = document.getElementById("prev-chapter");
  const nextChapterBtn = document.getElementById("next-chapter");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => router.prev());
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => router.next());
  }
  if (prevChapterBtn) {
    prevChapterBtn.addEventListener("click", () => router.prevChapter());
  }
  if (nextChapterBtn) {
    nextChapterBtn.addEventListener("click", () => router.nextChapter());
  }

  window.addEventListener("hashchange", updateNavUI);
  updateNavUI();
}

/**
 * Populate the page brand header with framework title and hashtag
 * @param {Object} framework - Framework data from YAML
 */
function populateBrandHeader(framework) {
  const header = document.getElementById("page-brand-header");
  if (!header) return;

  // Update document title
  document.title = `${framework.title} - Slide View`;

  header.innerHTML = "";
  header.appendChild(
    a(
      { className: "brand-title", href: "#/" },
      `${framework.emojiIcon} ${framework.title}`,
    ),
  );
  header.appendChild(span({ className: "brand-tag" }, framework.tag));
  header.style.display = "";
}

/**
 * Initialize the slide viewer
 */
async function init() {
  showLoading();

  try {
    // Load data
    const data = await loadAllData();
    setData(data);

    // Populate brand header
    populateBrandHeader(data.framework);

    // Set up routes
    setupRoutes();

    // Build slide order and set up navigation
    const { order, boundaries } = buildSlideOrder(data);
    router.setSlideOrder(order, boundaries);
    setupNavUI();
    router.startKeyboardNav();

    // Start router
    router.start();
  } catch (error) {
    console.error("Failed to initialize slide viewer:", error);
    renderError("Initialization Error", error.message);
  }
}

// Start the application
init();
