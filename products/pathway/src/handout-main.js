/**
 * Handout View Main Entry Point
 *
 * Displays all slides of a category on a single page for printing handouts.
 * Routes:
 *   / - Index with links to all categories
 *   /driver - All driver slides
 *   /skill - All skill slides
 *   /behaviour - All behaviour slides
 *   /job - All discipline, track, and level slides
 */

import { setData, getState } from "./lib/state.js";
import { loadAllData } from "./lib/yaml-loader.js";
import { validateAllData } from "@forwardimpact/map/validation";
import { throwIfErrors } from "@forwardimpact/map/contract";
import {
  div,
  h1,
  p,
  a,
  ul,
  li,
  span,
  heading1,
  heading2,
} from "./lib/render.js";

// Import model functions
import {
  getCapabilityOrder,
  getConceptEmoji,
} from "@forwardimpact/libskill/levels";

// Import formatters
import {
  driverToDOM,
  skillToDOM,
  behaviourToDOM,
  disciplineToDOM,
  levelToDOM,
  trackToDOM,
} from "./formatters/index.js";
import { sortTracksByName } from "./formatters/track/shared.js";

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
 * Create a chapter cover page
 * @param {Object} params
 * @param {string} params.emojiIcon - Chapter emoji
 * @param {string} params.title - Chapter title
 * @param {string} params.description - Chapter description
 * @returns {HTMLElement}
 */
function createChapterCover({ emojiIcon, title, description }) {
  return div(
    { className: "chapter-cover" },
    h1(
      { className: "chapter-title" },
      emojiIcon,
      " ",
      span({ className: "gradient-text" }, title),
    ),
    p({ className: "chapter-description" }, description.trim()),
  );
}

/**
 * Get handout content container
 * @returns {HTMLElement}
 */
function getHandoutContent() {
  return document.getElementById("handout-content");
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
 * Render content to handout container
 * @param {HTMLElement} content
 */
function renderHandout(content) {
  const container = getHandoutContent();
  container.innerHTML = "";
  container.appendChild(content);
  hideLoading();
}

/**
 * Render the handout index page
 * @param {Object} data
 */
function renderIndex(data) {
  const { standard } = data;

  const content = div(
    { className: "slide slide-index" },
    div(
      { className: "page-header" },
      heading1(
        { className: "page-title" },
        `${standard.emojiIcon} ${standard.title} Handouts`,
      ),
      p(
        { className: "page-description" },
        "Printable handouts with all items in each category on a single page.",
      ),
    ),

    div(
      { className: "slide-section" },
      heading2(
        { className: "slide-section-title" },
        "📄 ",
        span({ className: "gradient-text" }, "Available Handouts"),
      ),
      ul(
        { className: "related-list" },
        li(
          {},
          a(
            { href: "#/job" },
            `${getConceptEmoji(standard, "job")} ${standard.entityDefinitions.job.title}`,
          ),
          " - ",
          `${data.disciplines.length} disciplines, ${data.levels.length} levels, ${data.tracks.length} tracks`,
        ),
        li(
          {},
          a(
            { href: "#/behaviour" },
            `${getConceptEmoji(standard, "behaviour")} ${standard.entityDefinitions.behaviour.title}`,
          ),
          " - ",
          `${data.behaviours.length} behaviour definitions`,
        ),
        li(
          {},
          a(
            { href: "#/skill" },
            `${getConceptEmoji(standard, "skill")} ${standard.entityDefinitions.skill.title}`,
          ),
          " - ",
          `${data.skills.length} skill definitions`,
        ),
        li(
          {},
          a(
            { href: "#/driver" },
            `${getConceptEmoji(standard, "driver")} ${standard.entityDefinitions.driver.title}`,
          ),
          " - ",
          `${data.drivers.length} driver definitions`,
        ),
      ),
    ),
  );

  renderHandout(content);
}

/**
 * Render all driver slides
 * @param {Object} data
 */
function renderDriverHandout(data) {
  const { standard } = data;

  const slides = data.drivers.map((driver) => {
    return driverToDOM(driver, {
      skills: data.skills,
      behaviours: data.behaviours,
      standard: data.standard,
      showBackLink: false,
    });
  });

  const content = div(
    {},
    createChapterCover({
      emojiIcon: getConceptEmoji(standard, "driver"),
      title: standard.entityDefinitions.driver.title,
      description: standard.entityDefinitions.driver.description,
    }),
    ...slides,
  );

  renderHandout(content);
}

/**
 * Render all skill slides
 * @param {Object} data
 */
function renderSkillHandout(data) {
  const { standard } = data;

  // Get capability order from data
  const capabilityOrder = getCapabilityOrder(data.capabilities);

  // Sort skills by capability order, then by name within capability
  const sortedSkills = [...data.skills].sort((a, b) => {
    const aIndex = capabilityOrder.indexOf(a.capability);
    const bIndex = capabilityOrder.indexOf(b.capability);
    if (aIndex !== bIndex) {
      return aIndex - bIndex;
    }
    return a.name.localeCompare(b.name);
  });

  const slides = sortedSkills.map((skill) => {
    return skillToDOM(skill, {
      disciplines: data.disciplines,
      tracks: data.tracks,
      drivers: data.drivers,
      capabilities: data.capabilities,
      showBackLink: false,
      showToolsAndPatterns: false,
    });
  });

  const content = div(
    {},
    createChapterCover({
      emojiIcon: getConceptEmoji(standard, "skill"),
      title: standard.entityDefinitions.skill.title,
      description: standard.entityDefinitions.skill.description,
    }),
    ...slides,
  );

  renderHandout(content);
}

/**
 * Render all behaviour slides
 * @param {Object} data
 */
function renderBehaviourHandout(data) {
  const { standard } = data;

  const slides = data.behaviours.map((behaviour) => {
    return behaviourToDOM(behaviour, {
      drivers: data.drivers,
      standard: data.standard,
      showBackLink: false,
    });
  });

  const content = div(
    {},
    createChapterCover({
      emojiIcon: getConceptEmoji(standard, "behaviour"),
      title: standard.entityDefinitions.behaviour.title,
      description: standard.entityDefinitions.behaviour.description,
    }),
    ...slides,
  );

  renderHandout(content);
}

/**
 * Sort disciplines by type (professional first, then management)
 * @param {Array} disciplines - Raw discipline entities
 * @returns {Array} - Sorted disciplines
 */
function sortDisciplinesByType(disciplines) {
  const professional = disciplines.filter((d) => !d.isManagement);
  const management = disciplines.filter((d) => d.isManagement);
  return [...professional, ...management];
}

/**
 * Render all job component slides (disciplines, levels, tracks)
 * @param {Object} data
 */
function renderJobHandout(data) {
  const { standard } = data;

  // Sort disciplines by type: professional first, then management
  const sortedDisciplines = sortDisciplinesByType(data.disciplines);

  const disciplineSlides = sortedDisciplines.map((discipline) => {
    return disciplineToDOM(discipline, {
      skills: data.skills,
      behaviours: data.behaviours,
      standard: data.standard,
      showBackLink: false,
      showBehaviourModifiers: false,
    });
  });

  const levelSlides = data.levels.map((level) => {
    return levelToDOM(level, {
      standard: data.standard,
      showBackLink: false,
    });
  });

  const trackSlides = sortTracksByName(data.tracks).map((track) => {
    return trackToDOM(track, {
      skills: data.skills,
      behaviours: data.behaviours,
      disciplines: data.disciplines,
      standard: data.standard,
    });
  });

  const content = div(
    {},
    // Disciplines chapter
    createChapterCover({
      emojiIcon: getConceptEmoji(standard, "discipline"),
      title: standard.entityDefinitions.discipline.title,
      description: standard.entityDefinitions.discipline.description,
    }),
    ...disciplineSlides,

    // Levels chapter (moved before Tracks)
    createChapterCover({
      emojiIcon: getConceptEmoji(standard, "level"),
      title: standard.entityDefinitions.level.title,
      description: standard.entityDefinitions.level.description,
    }),
    ...levelSlides,

    // Tracks chapter (moved after Levels)
    createChapterCover({
      emojiIcon: getConceptEmoji(standard, "track"),
      title: standard.entityDefinitions.track.title,
      description: standard.entityDefinitions.track.description,
    }),
    ...trackSlides,
  );

  renderHandout(content);
}

/**
 * Handle routing based on hash
 */
function handleRoute() {
  const data = getState().data;
  const hash = window.location.hash || "#/";
  const path = hash.slice(1); // Remove #

  switch (path) {
    case "/":
    case "":
      renderIndex(data);
      break;
    case "/driver":
      renderDriverHandout(data);
      break;
    case "/skill":
      renderSkillHandout(data);
      break;
    case "/behaviour":
      renderBehaviourHandout(data);
      break;
    case "/job":
      renderJobHandout(data);
      break;
    default:
      renderIndex(data);
  }
}

/**
 * Populate the page brand header with standard title and hashtag
 * @param {Object} standard - Standard data from YAML
 */
function populateBrandHeader(standard) {
  const header = document.getElementById("page-brand-header");
  if (!header) return;

  // Update document title
  document.title = `${standard.title} - Handout View`;

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
 * Initialize the handout viewer
 */
async function init() {
  showLoading();

  try {
    const data = await loadAllData();
    throwIfErrors(validateAllData(data), {
      ruleCodes: ["INVALID_VALUE"],
      paths: [/\.professionalTitle$/, /\.autonomyExpectation$/],
    });
    setData(data);

    // Populate brand header
    populateBrandHeader(data.standard);

    // Set up hash change listener
    window.addEventListener("hashchange", handleRoute);

    // Initial render
    handleRoute();
  } catch (error) {
    console.error("Failed to initialize handout viewer:", error);
    const container = getHandoutContent();
    container.innerHTML = `
      <div class="slide-error">
        <h1>Initialization Error</h1>
        <p>${escapeHtml(String(error.message))}</p>
      </div>
    `;
    hideLoading();
  }
}

// Start the application
init();
