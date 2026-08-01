/**
 * Error boundary wrapper for page render functions
 */

import { NotFoundError, InvalidCombinationError } from "./errors.js";
import { render, div, h1, p, a } from "./render.js";

/**
 * @typedef {Object} ErrorBoundaryOptions
 * @property {(error: Error) => void} [onError] - Callback that logs the error
 * @property {string} [backPath] - Default back path
 * @property {string} [backText] - Default back text
 * @property {(title: string, message: string) => void} [renderErrorFn] - Custom error renderer
 */

/**
 * Wrap a render function so it handles errors
 * @param {Function} renderFn - Page render function
 * @param {ErrorBoundaryOptions} [options]
 * @returns {Function}
 */
export function withErrorBoundary(renderFn, options = {}) {
  const errorRenderer =
    options.renderErrorFn ||
    ((title, message) => {
      render(
        div(
          { className: "error-message" },
          h1({}, title),
          p({}, message),
          a(
            { href: `#${options.backPath || "/"}` },
            options.backText || "\u2190 Back to Home",
          ),
        ),
      );
    });

  return (...args) => {
    try {
      return renderFn(...args);
    } catch (error) {
      console.error("Page render error:", error);

      options.onError?.(error);

      if (error instanceof NotFoundError) {
        errorRenderer(
          `${error.entityType} Not Found`,
          `No ${error.entityType.toLowerCase()} found with ID: ${error.entityId}`,
        );
        return;
      }

      if (error instanceof InvalidCombinationError) {
        errorRenderer("Invalid Combination", error.message);
        return;
      }

      errorRenderer(
        "Something Went Wrong",
        error.message || "An unexpected error occurred.",
      );
    }
  };
}
