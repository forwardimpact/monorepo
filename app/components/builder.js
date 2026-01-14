/**
 * Builder component for discipline/grade/track selection pages
 */

import {
  div,
  h1,
  h2,
  h3,
  p,
  span,
  button,
  label,
  section,
} from "../lib/render.js";
import { getState } from "../lib/state.js";
import { createBadge } from "./card.js";
import { createSelectWithValue } from "../lib/form-controls.js";
import { createReactive } from "../lib/reactive.js";

/**
 * @typedef {Object} HelpItem
 * @property {string} label - Label for the help item
 * @property {string} text - Description text
 */

/**
 * @typedef {Object} BuilderSelection
 * @property {Object} discipline - Selected discipline
 * @property {Object} grade - Selected grade
 * @property {Object} track - Selected track
 */

/**
 * @typedef {Object} BuilderConfig
 * @property {string} title - Page title
 * @property {string} description - Page description
 * @property {string} formTitle - Form section title
 * @property {string} emptyPreviewText - Text when nothing selected
 * @property {string} buttonText - Action button text
 * @property {Function} previewPresenter - (selection, data) => previewData
 * @property {Function} detailPath - (selection) => "/path/to/detail"
 * @property {Function} renderPreview - (previewData, selection) => HTMLElement
 * @property {Array<HelpItem>} helpItems - Help section items
 * @property {Object} [labels] - Optional custom labels for selects
 */

/**
 * Create a builder page
 * @param {BuilderConfig} config
 * @returns {HTMLElement}
 */
export function createBuilder({
  title,
  description,
  formTitle,
  emptyPreviewText,
  buttonText,
  previewPresenter,
  detailPath,
  renderPreview,
  helpItems,
  labels = {},
}) {
  const { data } = getState();

  // Parse URL params for pre-selection
  const urlParams = new URLSearchParams(
    window.location.hash.split("?")[1] || "",
  );

  // Create reactive selection state
  const selection = createReactive({
    discipline: urlParams.get("discipline") || "",
    track: urlParams.get("track") || "",
    grade: urlParams.get("grade") || "",
  });

  const sortedGrades = [...data.grades].sort((a, b) => a.level - b.level);

  // Create elements that need references
  const previewContainer = div(
    { className: "job-preview", id: "job-preview" },
    p({ className: "text-muted" }, emptyPreviewText),
  );

  const actionButton = button(
    { className: "btn btn-primary btn-lg", id: "generate-btn", disabled: true },
    buttonText,
  );

  // Subscribe to selection changes - all updates happen here
  selection.subscribe(({ discipline, track, grade }) => {
    if (!discipline || !track || !grade) {
      previewContainer.innerHTML = "";
      previewContainer.appendChild(
        p({ className: "text-muted" }, emptyPreviewText),
      );
      actionButton.disabled = true;
      return;
    }

    const disciplineObj = data.disciplines.find((d) => d.id === discipline);
    const trackObj = data.tracks.find((t) => t.id === track);
    const gradeObj = data.grades.find((g) => g.id === grade);

    if (!disciplineObj || !trackObj || !gradeObj) {
      previewContainer.innerHTML = "";
      previewContainer.appendChild(
        p({ className: "text-muted" }, "Invalid selection. Please try again."),
      );
      actionButton.disabled = true;
      return;
    }

    const selectionObj = {
      discipline: disciplineObj,
      track: trackObj,
      grade: gradeObj,
    };
    const preview = previewPresenter(selectionObj, data);

    previewContainer.innerHTML = "";
    previewContainer.appendChild(renderPreview(preview, selectionObj));
    actionButton.disabled = !preview.isValid;
  });

  // Wire up button
  actionButton.addEventListener("click", () => {
    const { discipline, track, grade } = selection.get();
    window.location.hash = detailPath({ discipline, track, grade });
  });

  // Build the page
  const page = div(
    { className: "job-builder-page" },
    // Header
    div(
      { className: "page-header" },
      h1({ className: "page-title" }, title),
      p({ className: "page-description" }, description),
    ),
    // Form
    div(
      { className: "job-builder-form" },
      h2({}, formTitle),
      div(
        { className: "auto-grid-sm gap-lg" },
        // Discipline selector
        div(
          { className: "form-group" },
          label({ className: "form-label" }, labels.discipline || "Discipline"),
          createSelectWithValue({
            id: "discipline-select",
            items: data.disciplines,
            initialValue: selection.get().discipline,
            placeholder: "Select a discipline...",
            onChange: (value) => {
              selection.update((prev) => ({ ...prev, discipline: value }));
            },
            getDisplayName: (d) => d.specialization || d.name,
          }),
        ),
        // Track selector
        div(
          { className: "form-group" },
          label({ className: "form-label" }, labels.track || "Track"),
          createSelectWithValue({
            id: "track-select",
            items: data.tracks,
            initialValue: selection.get().track,
            placeholder: "Select a track...",
            onChange: (value) => {
              selection.update((prev) => ({ ...prev, track: value }));
            },
            getDisplayName: (t) => t.name,
          }),
        ),
        // Grade selector
        div(
          { className: "form-group" },
          label({ className: "form-label" }, labels.grade || "Grade"),
          createSelectWithValue({
            id: "grade-select",
            items: sortedGrades,
            initialValue: selection.get().grade,
            placeholder: "Select a grade...",
            onChange: (value) => {
              selection.update((prev) => ({ ...prev, grade: value }));
            },
            getDisplayName: (g) => g.id,
          }),
        ),
      ),
      previewContainer,
      div({ className: "page-actions" }, actionButton),
    ),
    // Help section
    helpItems && createHelpSection(helpItems),
  );

  // Trigger initial update if preselected
  const initial = selection.get();
  if (initial.discipline || initial.track || initial.grade) {
    setTimeout(() => selection.set(selection.get()), 0);
  }

  return page;
}

/**
 * Create help section with items
 * @param {Array<HelpItem>} items
 * @returns {HTMLElement}
 */
function createHelpSection(items) {
  return section(
    { className: "section section-detail" },
    h2({ className: "section-title" }, "How It Works"),
    div(
      { className: "auto-grid-md" },
      ...items.map((item) =>
        div(
          { className: "detail-item" },
          div({ className: "detail-item-label" }, item.label),
          p({}, item.text),
        ),
      ),
    ),
  );
}

/**
 * Create a standard job/interview preview with valid/invalid states
 * @param {Object} preview - Preview data from presenter
 * @returns {HTMLElement}
 */
export function createStandardPreview(preview) {
  if (!preview.isValid) {
    return div(
      {},
      div(
        {
          className: "job-preview-invalid",
          style:
            "color: var(--danger-color); display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem;",
        },
        span({}, "✗"),
        span({}, "Invalid combination"),
      ),
      p({ className: "text-muted" }, preview.invalidReason),
    );
  }

  return div(
    {},
    div(
      { className: "job-preview-valid" },
      span({}, "✓"),
      span({}, "Valid combination"),
    ),
    h3({ className: "job-preview-title" }, preview.title),
    div(
      { className: "card-meta", style: "margin-top: 0.5rem" },
      createBadge(`${preview.totalSkills} skills`, "default"),
      createBadge(`${preview.totalBehaviours} behaviours`, "default"),
    ),
  );
}

/**
 * Create career progress preview with paths info
 * @param {Object} preview - Preview data from presenter
 * @param {Object} selection - Current selection
 * @returns {HTMLElement}
 */
export function createProgressPreview(preview, selection) {
  if (!preview.isValid) {
    return div(
      { className: "job-preview-content" },
      div(
        { className: "preview-error" },
        span({ className: "preview-error-icon" }, "⚠️"),
        span({}, "This combination is not valid. "),
        span({ className: "text-muted" }, preview.invalidReason),
      ),
    );
  }

  const { discipline, grade, track } = selection;

  return div(
    { className: "job-preview-content" },
    div(
      { className: "preview-section" },
      div({ className: "preview-label" }, "Current Role"),
      div({ className: "preview-title" }, preview.title),
    ),
    div(
      { className: "preview-badges" },
      createBadge(discipline.specialization, "discipline"),
      createBadge(grade.id, "grade"),
      createBadge(track.name, "track"),
    ),
    div(
      { className: "preview-section", style: "margin-top: 1rem" },
      div({ className: "preview-label" }, "Progression Paths Available"),
      div(
        { className: "preview-paths" },
        preview.nextGrade
          ? div(
              { className: "path-item" },
              span({ className: "path-icon" }, "📈"),
              span(
                {},
                `Next Grade: ${preview.nextGrade.id} - ${preview.nextGrade.name}`,
              ),
            )
          : div(
              { className: "path-item text-muted" },
              span({ className: "path-icon" }, "🏆"),
              span({}, "You're at the highest grade!"),
            ),
        preview.validTracks.length > 0
          ? div(
              { className: "path-item" },
              span({ className: "path-icon" }, "🔀"),
              span(
                {},
                `${preview.validTracks.length} other track${preview.validTracks.length > 1 ? "s" : ""} to compare`,
              ),
            )
          : div(
              { className: "path-item text-muted" },
              span({ className: "path-icon" }, "—"),
              span({}, "No other valid tracks for this discipline"),
            ),
      ),
    ),
  );
}
