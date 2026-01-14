/**
 * Error page components
 */

import { render, div, h1, p, a } from "../lib/render.js";

/**
 * Render a not found error page
 * @param {Object} options - Configuration options
 * @param {string} options.entityType - Type of entity not found (e.g., 'Skill', 'Behaviour')
 * @param {string} options.entityId - ID that was not found
 * @param {string} options.backPath - Path to navigate back to
 * @param {string} options.backText - Text for back link
 */
export function renderNotFound({ entityType, entityId, backPath, backText }) {
  render(
    div(
      { className: "error-message" },
      h1({}, `${entityType} Not Found`),
      p({}, `No ${entityType.toLowerCase()} found with ID: ${entityId}`),
      a({ href: `#${backPath}` }, backText),
    ),
  );
}

/**
 * Create a not found error element (without rendering)
 * @param {Object} options - Configuration options
 * @param {string} options.entityType - Type of entity not found
 * @param {string} options.entityId - ID that was not found
 * @param {string} options.backPath - Path to navigate back to
 * @param {string} options.backText - Text for back link
 * @returns {HTMLElement}
 */
export function createNotFound({ entityType, entityId, backPath, backText }) {
  return div(
    { className: "error-message" },
    h1({}, `${entityType} Not Found`),
    p({}, `No ${entityType.toLowerCase()} found with ID: ${entityId}`),
    a({ href: `#${backPath}` }, backText),
  );
}

/**
 * Create an invalid state error element
 * @param {Object} options - Configuration options
 * @param {string} options.title - Error title
 * @param {string} options.message - Error message
 * @param {string} options.backPath - Path to navigate back to
 * @param {string} options.backText - Text for back link
 * @returns {HTMLElement}
 */
export function createErrorMessage({ title, message, backPath, backText }) {
  return div(
    { className: "error-message" },
    h1({}, title),
    p({}, message),
    a({ href: `#${backPath}` }, backText),
  );
}

/**
 * Render an invalid state error page
 * @param {Object} options - Configuration options
 * @param {string} options.title - Error title
 * @param {string} options.message - Error message
 * @param {string} options.backPath - Path to navigate back to
 * @param {string} options.backText - Text for back link
 */
export function renderError({ title, message, backPath, backText }) {
  render(createErrorMessage({ title, message, backPath, backText }));
}
