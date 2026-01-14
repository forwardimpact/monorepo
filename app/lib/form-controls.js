/**
 * Reusable form control components
 */

import { select, option } from "./render.js";

/**
 * Create a select element with initial value and change handler
 * @param {Object} options - Configuration options
 * @param {string} options.id - Element ID
 * @param {Array} options.items - Array of items to display
 * @param {string} options.initialValue - Initial selected value
 * @param {string} options.placeholder - Placeholder text for empty option
 * @param {Function} options.onChange - Callback when selection changes
 * @param {Function} [options.getDisplayName] - Optional function to get display name from item
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
