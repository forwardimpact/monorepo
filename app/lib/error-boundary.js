/**
 * Error boundary wrapper for page rendering
 */

import { renderNotFound, renderError } from "../components/error-page.js";
import { NotFoundError, InvalidCombinationError } from "./errors.js";

/**
 * @typedef {Object} ErrorBoundaryOptions
 * @property {(error: Error) => void} [onError] - Error callback for logging
 * @property {string} [backPath] - Default back path
 * @property {string} [backText] - Default back text
 * @property {(title: string, message: string) => void} [renderErrorFn] - Custom error renderer
 */

/**
 * Wrap a render function with error handling
 * @param {Function} renderFn - Page render function
 * @param {ErrorBoundaryOptions} [options]
 * @returns {Function}
 */
export function withErrorBoundary(renderFn, options = {}) {
  const errorRenderer =
    options.renderErrorFn ||
    ((title, message) => {
      renderError({
        title,
        message,
        backPath: options.backPath || "/",
        backText: options.backText || "← Back to Home",
      });
    });

  return (...args) => {
    try {
      return renderFn(...args);
    } catch (error) {
      console.error("Page render error:", error);

      options.onError?.(error);

      if (error instanceof NotFoundError) {
        if (options.renderErrorFn) {
          errorRenderer(
            `${error.entityType} Not Found`,
            `No ${error.entityType.toLowerCase()} found with ID: ${error.entityId}`,
          );
        } else {
          renderNotFound({
            entityType: error.entityType,
            entityId: error.entityId,
            backPath: error.backPath,
            backText: `← Back to ${error.entityType}s`,
          });
        }
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
