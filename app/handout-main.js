/**
 * Handout View Main Entry Point
 *
 * Displays all slides of a category on a single page for printing handouts.
 * Routes:
 *   / - Index with links to all categories
 *   /driver - All driver slides
 *   /skill - All skill slides
 *   /behaviour - All behaviour slides
 *   /job - All discipline, track, and grade slides
 */

import { setData, getState } from "./lib/state.js";
import { loadAllData } from "./lib/yaml-loader.js";
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
import { getCapabilityOrder, getConceptEmoji } from "./model/levels.js";

// Import formatters
import {
  driverToDOM,
  skillToDOM,
  behaviourToDOM,
  disciplineToDOM,
  gradeToDOM,
  trackToDOM,
} from "./formatters/index.js";
import { sortTracksByName } from "./formatters/track/shared.js";

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
  const { framework } = data;

  const content = div(
    { className: "slide slide-index" },
    div(
      { className: "page-header" },
      heading1(
        { className: "page-title" },
        `${framework.emojiIcon} ${framework.title} Handouts`,
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
            `${getConceptEmoji(framework, "job")} ${framework.entityDefinitions.job.title}`,
          ),
          " - ",
          `${data.disciplines.length} disciplines, ${data.grades.length} grades, ${data.tracks.length} tracks`,
        ),
        li(
          {},
          a(
            { href: "#/behaviour" },
            `${getConceptEmoji(framework, "behaviour")} ${framework.entityDefinitions.behaviour.title}`,
          ),
          " - ",
          `${data.behaviours.length} behaviour definitions`,
        ),
        li(
          {},
          a(
            { href: "#/skill" },
            `${getConceptEmoji(framework, "skill")} ${framework.entityDefinitions.skill.title}`,
          ),
          " - ",
          `${data.skills.length} skill definitions`,
        ),
        li(
          {},
          a(
            { href: "#/driver" },
            `${getConceptEmoji(framework, "driver")} ${framework.entityDefinitions.driver.title}`,
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
  const { framework } = data;

  const slides = data.drivers.map((driver) => {
    return driverToDOM(driver, {
      skills: data.skills,
      behaviours: data.behaviours,
      framework: data.framework,
      showBackLink: false,
    });
  });

  const content = div(
    {},
    createChapterCover({
      emojiIcon: getConceptEmoji(framework, "driver"),
      title: framework.entityDefinitions.driver.title,
      description: framework.entityDefinitions.driver.description,
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
  const { framework } = data;

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
      emojiIcon: getConceptEmoji(framework, "skill"),
      title: framework.entityDefinitions.skill.title,
      description: framework.entityDefinitions.skill.description,
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
  const { framework } = data;

  const slides = data.behaviours.map((behaviour) => {
    return behaviourToDOM(behaviour, {
      drivers: data.drivers,
      framework: data.framework,
      showBackLink: false,
    });
  });

  const content = div(
    {},
    createChapterCover({
      emojiIcon: getConceptEmoji(framework, "behaviour"),
      title: framework.entityDefinitions.behaviour.title,
      description: framework.entityDefinitions.behaviour.description,
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
 * Render all job component slides (disciplines, grades, tracks)
 * @param {Object} data
 */
function renderJobHandout(data) {
  const { framework } = data;

  // Sort disciplines by type: professional first, then management
  const sortedDisciplines = sortDisciplinesByType(data.disciplines);

  const disciplineSlides = sortedDisciplines.map((discipline) => {
    return disciplineToDOM(discipline, {
      skills: data.skills,
      behaviours: data.behaviours,
      framework: data.framework,
      showBackLink: false,
      showBehaviourModifiers: false,
    });
  });

  const gradeSlides = data.grades.map((grade) => {
    return gradeToDOM(grade, {
      framework: data.framework,
      showBackLink: false,
    });
  });

  const trackSlides = sortTracksByName(data.tracks).map((track) => {
    return trackToDOM(track, {
      skills: data.skills,
      behaviours: data.behaviours,
      disciplines: data.disciplines,
      framework: data.framework,
    });
  });

  const content = div(
    {},
    // Disciplines chapter
    createChapterCover({
      emojiIcon: getConceptEmoji(framework, "discipline"),
      title: framework.entityDefinitions.discipline.title,
      description: framework.entityDefinitions.discipline.description,
    }),
    ...disciplineSlides,

    // Grades chapter (moved before Tracks)
    createChapterCover({
      emojiIcon: getConceptEmoji(framework, "grade"),
      title: framework.entityDefinitions.grade.title,
      description: framework.entityDefinitions.grade.description,
    }),
    ...gradeSlides,

    // Tracks chapter (moved after Grades)
    createChapterCover({
      emojiIcon: getConceptEmoji(framework, "track"),
      title: framework.entityDefinitions.track.title,
      description: framework.entityDefinitions.track.description,
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
 * Populate the page brand header with framework title and hashtag
 * @param {Object} framework - Framework data from YAML
 */
function populateBrandHeader(framework) {
  const header = document.getElementById("page-brand-header");
  if (!header) return;

  // Update document title
  document.title = `${framework.title} - Handout View`;

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
 * Initialize the handout viewer
 */
async function init() {
  showLoading();

  try {
    const data = await loadAllData();
    setData(data);

    // Populate brand header
    populateBrandHeader(data.framework);

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
        <p>${error.message}</p>
      </div>
    `;
    hideLoading();
  }
}

// Start the application
init();
