// @ts-check

/**
 * Create a spawn function that disclaims TCC responsibility. It uses the
 * given posix-spawn primitives.
 *
 * @param {{ spawn: Function, waitForExit: Function, readOutput: Function }} deps
 * @returns {(executable: string, args: string[], env?: Record<string, string>, cwd?: string) => Promise<{ exitCode: number, stdout: string, stderr: string }>}
 */
export function createTccSpawn(deps) {
  return async function spawnWithTccDisclaim(
    executable,
    args,
    env,
    cwd,
    runtime,
  ) {
    const { pid, stdoutFile, stderrFile } = deps.spawn(
      executable,
      args,
      env,
      cwd,
      runtime,
    );
    const exitCode = await deps.waitForExit(pid, undefined, runtime);
    const stdout = deps.readOutput(stdoutFile, runtime);
    const stderr = deps.readOutput(stderrFile, runtime);
    return { exitCode, stdout, stderr };
  };
}
