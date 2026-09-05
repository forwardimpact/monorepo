// The CI seams the two command handlers share: the credential, the repository
// slug, and the two GitHub Actions env files. Both handlers append rather than
// write, because a step may report more than once into the same file.

/**
 * Resolve `owner/repo` from the option or from the Actions environment.
 * @param {object} options - The parsed options.
 * @param {object} proc - The process surface.
 * @returns {?string} The slug, or `null` when neither home carries one.
 */
export function resolveRepo(options, proc) {
  return options.repo || proc.env.GITHUB_REPOSITORY || null;
}

/**
 * Append one chunk to an env file the Actions runner named.
 * @param {object} runtime - The runtime bag.
 * @param {string} variable - The env variable naming the file.
 * @param {string} chunk - The text to append.
 * @returns {Promise<void>} Resolves once the append lands, or immediately when
 *   the runner named no file.
 */
export async function appendEnvFile(runtime, variable, chunk) {
  const path = runtime.proc.env[variable];
  if (!path) return;
  await runtime.fs.appendFile(path, chunk);
}
