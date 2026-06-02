/**
 * Fail the process at startup if a required configuration value is empty.
 * Empty means: empty string, zero-length array, or empty Set; also undefined or null.
 *
 * @param {unknown} value Configuration value to check.
 * @param {string} label Human-readable name written into the stderr message.
 * @param {NodeJS.Process} [processObj] Process-like object for injection in tests.
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
