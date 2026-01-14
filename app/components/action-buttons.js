/**
 * Reusable action button components
 */

import { button } from "../lib/render.js";

/**
 * Create a navigation button
 * @param {Object} options - Configuration options
 * @param {string} options.label - Button label text
 * @param {string} options.href - Destination URL hash
 * @param {string} [options.variant] - Button variant: 'primary' or 'secondary'
 * @returns {HTMLElement}
 */
export function createNavButton({ label, href, variant = "primary" }) {
  const btn = button(
    {
      className: `btn btn-${variant}`,
    },
    label,
  );

  btn.addEventListener("click", () => {
    window.location.hash = href;
  });

  return btn;
}

/**
 * Create a button to navigate to job builder with a parameter
 * @param {Object} options - Configuration options
 * @param {string} options.paramName - Parameter name (discipline, grade, track)
 * @param {string} options.paramValue - Parameter value (the ID)
 * @param {string} [options.label] - Optional custom label
 * @returns {HTMLElement}
 */
export function createJobBuilderButton({ paramName, paramValue, label }) {
  const defaultLabels = {
    discipline: "Build Job with this Discipline →",
    grade: "Build Job at this Grade →",
    track: "Build Job with this Track →",
  };

  return createNavButton({
    label: label || defaultLabels[paramName] || "Build Job →",
    href: `/job-builder?${paramName}=${paramValue}`,
    variant: "primary",
  });
}

/**
 * Create a button to navigate to interview prep with a parameter
 * @param {Object} options - Configuration options
 * @param {string} options.paramName - Parameter name (discipline, grade, track)
 * @param {string} options.paramValue - Parameter value (the ID)
 * @param {string} [options.label] - Optional custom label
 * @returns {HTMLElement}
 */
export function createInterviewPrepButton({ paramName, paramValue, label }) {
  return createNavButton({
    label: label || "Interview Prep →",
    href: `/interview-prep?${paramName}=${paramValue}`,
    variant: "secondary",
  });
}
