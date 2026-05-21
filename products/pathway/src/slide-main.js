/**
 * Slide View Main Entry Point
 *
 * Initializes the slide viewer application with routing and data loading.
 */

import { createSlideRouter } from "./lib/router-slides.js";
import { setData, getState } from "./lib/state.js";
import { loadAllData } from "./lib/yaml-loader.js";
import { validateAllData } from "@forwardimpact/map/validation";
import { throwIfErrors } from "@forwardimpact/map/contract";
import { span, a } from "./lib/render.js";
import { generateAllJobs } from "@forwardimpact/libskill/derivation";
import { sortTracksByName } from "./formatters/track/shared.js";

// Import slide renderers
import { renderChapterSlide } from "./slides/chapter.js";
import { renderOverviewSlide } from "./slides/overview.js";
import { renderSkillSlide } from "./slides/skill.js";
import { renderBehaviourSlide } from "./slides/behaviour.js";
import { renderDriverSlide } from "./slides/driver.js";
import { renderDisciplineSlide } from "./slides/discipline.js";
import { renderLevelSlide } from "./slides/level.js";
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
 * Escape HTML special characters to prevent XSS
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      <a href="#/">← Back to Index</a>
    </div>
  `;
  hideLoading();
}

/**
 * Render content to slide container
 * @param {HTMLElement} content
 */
function renderSlide(content) {
  const container = getSlideContent();
  container.innerHTML = "";
  container.appendChild(content);
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

  // Levels
  router.on("/level/:id", (params) => {
    renderLevelSlide({ render: renderSlide, data: getState().data, params });
  });

  // Tracks
  router.on("/track/:id", (params) => {
    renderTrackSlide({ render: renderSlide, data: getState().data, params });
  });

  // Jobs - new format: discipline/level/track (track optional)
  router.on("/job/:discipline/:level/:track", (params) => {
    renderJobSlide({ render: renderSlide, data: getState().data, params });
  });

  router.on("/job/:discipline/:level", (params) => {
    renderJobSlide({
      render: renderSlide,
      data: getState().data,
      params: { ...params, track: null },
    });
  });

  // Interviews - new format: discipline/level/track (track optional)
  router.on("/interview/:discipline/:level/:track", (params) => {
    renderInterviewSlide({
      render: renderSlide,
      data: getState().data,
      params,
    });
  });

  router.on("/interview/:discipline/:level", (params) => {
    renderInterviewSlide({
      render: renderSlide,
      data: getState().data,
      params: { ...params, track: null },
    });
  });

  // Progress - new format: discipline/level/track (track optional)
  router.on("/progress/:discipline/:level/:track", (params) => {
    renderProgressSlide({ render: renderSlide, data: getState().data, params });
  });

  router.on("/progress/:discipline/:level", (params) => {
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
function jobUrl(job) {
  return job.track
    ? `/job/${job.discipline.id}/${job.level.id}/${job.track.id}`
    : `/job/${job.discipline.id}/${job.level.id}`;
}

function appendChapter(order, boundaries, slug, items, urlOf) {
  if (!items || items.length === 0) return;
  boundaries.push(order.length);
  order.push(`/chapter/${slug}`);
  order.push(`/overview/${slug}`);
  items.forEach((item) => order.push(urlOf(item)));
}

function buildSlideOrder(data) {
  const order = ["/"];
  const boundaries = [];

  const tracks = data.tracks ? sortTracksByName(data.tracks) : [];
  const jobs = generateAllJobs({
    disciplines: data.disciplines,
    levels: data.levels,
    tracks: data.tracks,
    skills: data.skills,
    behaviours: data.behaviours,
    validationRules: data.standard.validationRules,
  });

  const chapters = [
    {
      slug: "discipline",
      items: data.disciplines,
      urlOf: (d) => `/discipline/${d.id}`,
    },
    { slug: "level", items: data.levels, urlOf: (g) => `/level/${g.id}` },
    { slug: "track", items: tracks, urlOf: (t) => `/track/${t.id}` },
    { slug: "skill", items: data.skills, urlOf: (s) => `/skill/${s.id}` },
    {
      slug: "behaviour",
      items: data.behaviours,
      urlOf: (b) => `/behaviour/${b.id}`,
    },
    { slug: "driver", items: data.drivers, urlOf: (d) => `/driver/${d.id}` },
    { slug: "job", items: jobs, urlOf: jobUrl },
  ];

  for (const { slug, items, urlOf } of chapters) {
    appendChapter(order, boundaries, slug, items, urlOf);
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
 * Populate the page brand header with standard title and hashtag
 * @param {Object} standard - Standard data from YAML
 */
function populateBrandHeader(standard) {
  const header = document.getElementById("page-brand-header");
  if (!header) return;

  // Update document title
  document.title = `${standard.title} - Slide View`;

  header.innerHTML = "";
  header.appendChild(
    a(
      { className: "brand-title", href: "#/" },
      `${standard.emojiIcon} ${standard.title}`,
    ),
  );
  header.appendChild(span({ className: "brand-tag" }, standard.tag));
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
    throwIfErrors(validateAllData(data), {
      ruleCodes: ["INVALID_VALUE"],
      paths: [/\.professionalTitle$/, /\.autonomyExpectation$/],
    });
    setData(data);

    // Populate brand header
    populateBrandHeader(data.standard);

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
