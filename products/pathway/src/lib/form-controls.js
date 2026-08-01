/**
 * Reusable form control components
 */

import { select, option, optgroup, div, label, input, span } from "./render.js";

/**
 * Create a select element with an initial value and a change handler
 * @param {Object} options - Configuration options
 * @param {string} options.id - Element ID
 * @param {Array} options.items - Array of items to display
 * @param {string} options.initialValue - Initial selected value
 * @param {string} options.placeholder - Placeholder text for the empty option
 * @param {Function} options.onChange - Callback for when the selection changes
 * @param {Function} [options.getDisplayName] - Optional function to get the display name from an item
 * @returns {HTMLElement}
 */
export function createSelectWithValue({
  id,
  items,
  initialValue,
  placeholder,
  onChange,
  getDisplayName,
}) {
  const displayFn = getDisplayName || ((item) => item.name);
  const selectEl = select(
    {
      className: "form-select",
      id,
    },
    option({ value: "" }, placeholder),
    ...items.map((item) => {
      const opt = option({ value: item.id }, displayFn(item));
      if (item.id === initialValue) {
        opt.selected = true;
      }
      return opt;
    }),
  );

  selectEl.addEventListener("change", (e) => {
    onChange(e.target.value);
  });

  return selectEl;
}

/**
 * Create a discipline select with optgroups for Professional and Management
 * @param {Object} options - Configuration options
 * @param {string} options.id - Element ID
 * @param {Array} options.disciplines - Array of discipline objects
 * @param {string} options.initialValue - Initial selected value
 * @param {string} options.placeholder - Placeholder text for the empty option
 * @param {Function} options.onChange - Callback for when the selection changes
 * @param {Function} [options.getDisplayName] - Optional function to get the display name from an item
 * @returns {HTMLElement}
 */
export function createDisciplineSelect({
  id,
  disciplines,
  initialValue,
  placeholder,
  onChange,
  getDisplayName,
}) {
  const displayFn = getDisplayName || ((d) => d.specialization || d.name);

  // Separate disciplines by type
  const professional = disciplines.filter((d) => d.isProfessional);
  const management = disciplines.filter((d) => d.isManagement);

  // Sort each group alphabetically by display name
  professional.sort((a, b) => displayFn(a).localeCompare(displayFn(b)));
  management.sort((a, b) => displayFn(a).localeCompare(displayFn(b)));

  // Build options for a group
  const buildOptions = (items) =>
    items.map((item) => {
      const opt = option({ value: item.id }, displayFn(item));
      if (item.id === initialValue) {
        opt.selected = true;
      }
      return opt;
    });

  // Build optgroups. Professional first, then Management
  const groups = [];
  if (professional.length > 0) {
    groups.push(
      optgroup({ label: "Professional" }, ...buildOptions(professional)),
    );
  }
  if (management.length > 0) {
    groups.push(optgroup({ label: "Management" }, ...buildOptions(management)));
  }

  const selectEl = select(
    { className: "form-select", id },
    option({ value: "" }, placeholder),
    ...groups,
  );

  selectEl.addEventListener("change", (e) => {
    onChange(e.target.value);
  });

  return selectEl;
}

/**
 * Create a multi-discipline checkbox group with Professional and Management groups
 * @param {Object} options
 * @param {string} options.id - Element ID prefix
 * @param {Array} options.disciplines - Array of discipline objects
 * @param {Set<string>} options.selected - Currently selected discipline IDs
 * @param {Function} options.onChange - Callback with the updated Set of selected IDs
 * @param {Function} [options.getDisplayName] - Get the display name from a discipline
 * @returns {HTMLElement}
 */
export function createMultiDisciplineSelect({
  id,
  disciplines,
  selected,
  onChange,
  getDisplayName,
}) {
  const displayFn = getDisplayName || ((d) => d.specialization || d.name);

  const professional = disciplines
    .filter((d) => d.isProfessional)
    .sort((a, b) => displayFn(a).localeCompare(displayFn(b)));
  const management = disciplines
    .filter((d) => d.isManagement)
    .sort((a, b) => displayFn(a).localeCompare(displayFn(b)));

  const groups = [];
  if (professional.length > 0) {
    groups.push({ label: "Professional", items: professional });
  }
  if (management.length > 0) {
    groups.push({ label: "Management", items: management });
  }

  function buildCheckbox(item) {
    const cb = input({
      type: "checkbox",
      id: `${id}-${item.id}`,
      className: "form-checkbox",
    });
    cb.checked = selected.has(item.id);
    cb.addEventListener("change", () => {
      if (cb.checked) {
        selected.add(item.id);
      } else {
        selected.delete(item.id);
      }
      onChange(new Set(selected));
    });
    return div(
      { className: "checkbox-row" },
      label(
        { className: "checkbox-label", htmlFor: `${id}-${item.id}` },
        cb,
        span({ className: "checkbox-text" }, displayFn(item)),
      ),
    );
  }

  return div(
    { className: "checkbox-group", id },
    ...groups.map((group) =>
      div(
        { className: "checkbox-group-section" },
        group.label
          ? div({ className: "checkbox-group-label" }, group.label)
          : null,
        ...group.items.map(buildCheckbox),
      ),
    ),
  );
}
