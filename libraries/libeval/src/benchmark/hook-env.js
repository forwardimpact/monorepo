/**
 * Shared environment builder for the benchmark hook scripts (`preflight.sh` and
 * `invariants.sh`). Keeping both spawns on one helper guarantees they expose the
 * same variable set, so hook authors never have to wonder which vars a given
 * hook receives.
 *
 * Path vars (TASK_DIR, FAMILY_DIR, HOOKS_DIR) let hooks reference real
 * locations instead of reconstructing them from `$0`. They are paths, not
 * secrets, so they need no redaction allowlist entry.
 */

/**
 * @param {Record<string, string>} baseEnv - Inherited env (`runtime.proc.env`).
 * @param {object} vars
 * @param {string} vars.cwd - Agent CWD → `$WORKDIR`.
 * @param {number} vars.port - Allocated TCP port → `$PORT`.
 * @param {string} [vars.taskId] - Task id → `$TASK_ID`.
 * @param {string} [vars.taskDir] - Task directory on host → `$TASK_DIR`.
 * @param {string} [vars.hooksDir] - Task `hooks/` dir on host → `$HOOKS_DIR`.
 * @param {string} [vars.familyDir] - Family root on host → `$FAMILY_DIR`.
 * @returns {Record<string, string>}
 */
export function buildHookEnv(
  baseEnv,
  { cwd, port, taskId, taskDir, hooksDir, familyDir },
) {
  return {
    ...baseEnv,
    WORKDIR: cwd,
    PORT: String(port),
    TASK_ID: taskId ?? "",
    TASK_DIR: taskDir ?? "",
    HOOKS_DIR: hooksDir ?? "",
    FAMILY_DIR: familyDir ?? "",
  };
}
