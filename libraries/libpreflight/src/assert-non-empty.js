/**
 * Fail the process at startup if a required configuration value is empty.
 * Empty means an empty string, a zero-length array, or an empty Set.
 * Undefined and null are also empty.
 *
 * @param {unknown} value Configuration value to check.
 * @param {string} label Human-readable name that the stderr message shows.
 * @param {NodeJS.Process} [processObj] Process-like object to inject in tests.
 * @returns {void}
 */
export function assertNonEmpty(value, label, processObj = process) {
  if (typeof value === "string" && value.length > 0) return;
  if (Array.isArray(value) && value.length > 0) return;
  if (value instanceof Set && value.size > 0) return;
  processObj.stderr.write(
    `Error: required configuration "${label}" is empty.\n`,
  );
  processObj.exit(1);
}
