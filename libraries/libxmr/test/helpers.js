import nodeFsSync from "node:fs";
import nodeFs from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createDefaultClock,
  createDefaultSubprocess,
} from "@forwardimpact/libutil";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

/**
 * Build a runtime for in-process command tests. The runtime holds a `proc`
 * whose `cwd()`/`env` the test controls and whose stdout/stderr it captures.
 * The runtime holds a real `Finder`. It holds a real clock, unless the caller
 * gives `now`. It holds fs surfaces that default to the real `node:fs`. Those
 * surfaces also accept a libmock `createMockFs()` override, so a command's
 * reads can stay in memory.
 *
 * @param {object} [options]
 * @param {string} [options.cwd] - The working directory `proc.cwd()` returns.
 * @param {Record<string,string>} [options.env] - The map that backs `proc.env`.
 * @param {number} [options.now] - Fixed clock time in ms (defaults to real clock).
 * @param {object} [options.fs] - Async fs surface override (default real `node:fs/promises`).
 * @param {object} [options.fsSync] - Sync fs surface override (default real `node:fs`).
 * @returns {{ runtime: object, stdout: string, stderr: string, exitCode: number }}
 */
export function makeRuntime({
  cwd = process.cwd(),
  env = {},
  now,
  fs: fsOverride = nodeFs,
  fsSync: fsSyncOverride = nodeFsSync,
} = {}) {
  const out = [];
  const err = [];
  let _exitCode = 0;
  const proc = {
    cwd: () => cwd,
    env: { ...env },
    argv: Object.freeze([]),
    stdout: { write: (s) => out.push(String(s)) },
    stderr: { write: (s) => err.push(String(s)) },
    exit: (code = 0) => {
      _exitCode = code;
    },
    get exitCode() {
      return _exitCode;
    },
    set exitCode(v) {
      _exitCode = v;
    },
  };
  const clock =
    now != null
      ? {
          now: () => now,
          sleep: async () => {},
          setTimeout: (fn, ms) => setTimeout(fn, ms),
          clearTimeout: (h) => clearTimeout(h),
        }
      : createDefaultClock();
  const runtime = Object.freeze({
    fs: fsOverride,
    fsSync: fsSyncOverride,
    proc,
    clock,
    subprocess: createDefaultSubprocess(),
    // findProjectRoot receives an explicit start path (proc.cwd()). So the
    // shared real-fs finder traverses fixtures correctly. It does not need
    // the test's custom proc bound into it.
    finder: createDefaultRuntime().finder,
  });
  return {
    runtime,
    get stdout() {
      return out.join("");
    },
    get stderr() {
      return err.join("");
    },
    get exitCode() {
      return _exitCode;
    },
  };
}

/**
 * Assemble an InvocationContext-shaped object to invoke a command handler
 * directly in-process. The call skips `cli.dispatch`.
 *
 * @param {{ runtime: object, options?: object, args?: object }} parts
 * @returns {object}
 */
export function ctxFor({ runtime, options = {}, args = {} }) {
  return {
    deps: { runtime },
    options,
    args,
  };
}

/** Create a temporary directory and return its path. */
export function makeTempDir(prefix = "xmr-test-") {
  return mkdtempSync(join(tmpdir(), prefix));
}
