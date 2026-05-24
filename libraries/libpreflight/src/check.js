/**
 * Enforce a Node.js major-version floor. On failure, write a product-authored
 * error to stderr and exit non-zero before any heavier import evaluates.
 *
 * @param {number} requiredMajor Minimum acceptable Node major version.
 * @param {NodeJS.Process} [processObj] Process-like object for injection in tests.
 * @returns {void}
 */
export function check(requiredMajor, processObj = process) {
  const detected = processObj.versions.node;
  const major = Number.parseInt(detected.split(".", 1)[0], 10);
  if (major >= requiredMajor) return;
  processObj.stderr.write(
    `Error: This command requires Node.js ${requiredMajor} or later (running ${detected}).\n`,
  );
  processObj.stderr.write(
    `Install Node.js ${requiredMajor} (LTS) from https://nodejs.org/ and re-run.\n`,
  );
  processObj.exit(1);
}
