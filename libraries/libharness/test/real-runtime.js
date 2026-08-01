/**
 * Test-only runtime builders for the benchmark integration suite.
 *
 * The benchmark installer / workdir / task-family / invariants code paths
 * exercise the real filesystem. They stage copies, hash the canonical tree,
 * and use fd-3 pipes. But they must not shell out to real `apm` / `bun` /
 * `git`. These helpers build a runtime bag from the production collaborators
 * (`createDefaultRuntime`). They swap the `subprocess` surface for an
 * injectable fake. The bag is a plain (unfrozen) object. Consumers only read
 * `runtime.fs` / `runtime.subprocess` / `runtime.clock` / `runtime.proc`.
 *
 * Intentionally a regular module (not a `.test.js` file).
 */

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

/**
 * Build an `AsyncIterable<string>` over zero or one chunk.
 * @param {string} [str]
 */
function streamOf(str) {
  return {
    async *[Symbol.asyncIterator]() {
      if (str) yield str;
    },
  };
}

/**
 * A fake `subprocess.spawn` for the apm/bun installer paths. It records every
 * call on `.calls`. The returned child mirrors `runtime.subprocess.spawn`'s
 * shape (`stdout`/`stderr` AsyncIterables, `exitCode` Promise, `kill`, `pid`).
 *
 * @param {object} [opts]
 * @param {number} [opts.exitCode=0]
 * @param {string} [opts.stderr=""]
 * @param {Error} [opts.spawnError] - When you set this, the child has
 *   `pid: undefined`. This mirrors a spawn failure, so the installer raises
 *   its spawn-error path.
 * @returns {{spawn: Function, run: Function, runSync: Function, calls: any[]}}
 */
export function makeFakeSubprocess({
  exitCode = 0,
  stderr = "",
  spawnError,
} = {}) {
  const calls = [];
  const spawn = (cmd, args, options) => {
    calls.push({ cmd, args, options });
    if (spawnError) {
      return {
        stdout: streamOf(),
        stderr: streamOf(),
        exitCode: Promise.resolve(127),
        kill: () => {},
        pid: undefined,
      };
    }
    return {
      stdout: streamOf(),
      stderr: streamOf(stderr),
      exitCode: Promise.resolve(exitCode),
      kill: () => {},
      pid: 4321,
    };
  };
  const run = async (cmd, args, options) => {
    calls.push({ cmd, args, options });
    return { stdout: "", stderr, exitCode, signal: null };
  };
  const runSync = (cmd, args, options) => {
    calls.push({ cmd, args, options });
    return { stdout: "", stderr, exitCode, signal: null };
  };
  return { spawn, run, runSync, calls };
}

/**
 * A real-filesystem runtime. This function replaces the subprocess surface
 * with `fake`.
 * @param {object} [fake] - A subprocess fake (default: a no-op success fake).
 * @returns {import("@forwardimpact/libutil/runtime").Runtime}
 */
export function realRuntimeWithSubprocess(fake = makeFakeSubprocess()) {
  return { ...createDefaultRuntime(), subprocess: fake };
}
