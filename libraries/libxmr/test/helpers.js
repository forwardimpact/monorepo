import nodeFsSync from "node:fs";
import nodeFs from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  Finder,
  createDefaultClock,
  createDefaultSubprocess,
} from "@forwardimpact/libutil";

/**
 * Build a real-filesystem runtime for in-process command tests: real fsSync,
 * a `proc` whose `cwd()`/`env` are test-controlled and whose stdout/stderr
 * are captured, a real `Finder`, and a real clock (unless `now` is given).
 *
 * @param {object} [options]
 * @param {string} [options.cwd] - Working directory `proc.cwd()` returns.
 * @param {Record<string,string>} [options.env] - The `proc.env` backing map.
 * @param {number} [options.now] - Fixed clock time in ms (defaults to real clock).
 * @returns {{ runtime: object, stdout: string, stderr: string, exitCode: number }}
 */
export function makeRuntime({ cwd = process.cwd(), env = {}, now } = {}) {
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
    fs: nodeFs,
    fsSync: nodeFsSync,
    proc,
    clock,
    subprocess: createDefaultSubprocess(),
    finder: new Finder({ fs: nodeFs, fsSync: nodeFsSync, proc }),
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
 * Assemble an InvocationContext-shaped object for invoking a command handler
 * directly in-process (without going through `cli.dispatch`).
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
