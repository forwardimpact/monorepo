import { spawn as nodeSpawn, execFile } from "node:child_process";
import nodeFsSync from "node:fs";
import nodeFs from "node:fs/promises";
import { Finder } from "./finder.js";

/**
 * @typedef {Object} Runtime
 *
 * The single bag of ambient collaborators threaded from every binary's
 * entry point through `ctx.deps` into every constructor and factory
 * Production wires the bag from `createDefaultRuntime`; tests
 * wire it from libmock's `createTestRuntime`. A module destructures the
 * fields it actually uses and never imports `node:fs` / `node:child_process`
 * or reads `Date.now` / `process.*` directly.
 *
 * @property {Object} fs
 *   Async filesystem surface (the `node:fs/promises` shape): `readFile`,
 *   `writeFile`, `readdir`, `stat`, `mkdir`, `access`, `copyFile`, `rm`,
 *   `lstat`, `unlink`, `symlink`. A module destructures `fs` xor `fsSync`,
 *   never both (design Decision 7).
 * @property {Object} fsSync
 *   Sync filesystem surface (the `node:fs` shape): `existsSync`,
 *   `readFileSync`, `writeFileSync`, `mkdirSync`, `readdirSync`, `statSync`.
 * @property {Object} proc
 *   Process surface: `cwd()`, `env`, `argv`, `stdin`, `stdout.write`,
 *   `stderr.write`, `exit(code)`, and an `exitCode` accessor.
 * @property {Object} clock
 *   Time surface: `now()`, `sleep(ms)`, `setTimeout(fn, ms)`,
 *   `clearTimeout(handle)`.
 * @property {Object} subprocess
 *   Subprocess surface: `run(cmd, args, opts) -> Promise<{stdout, stderr,
 *   exitCode}>` and `spawn(cmd, args, opts) -> {stdout, stderr, exitCode,
 *   kill}` where `stdout`/`stderr` are AsyncIterables and `exitCode` a
 *   Promise.
 * @property {Object} finder
 *   A constructed `Finder` (project path resolution + symlink management).
 */

/**
 * Build the process surface over a `process`-like source. The returned
 * object is intentionally not frozen — `exitCode` is defined as an accessor
 * with a setter, which `Object.freeze` would strip.
 *
 * @param {object} [options]
 * @param {object} [options.source=process] - The backing process handle.
 * @param {Record<string,string>} [options.env=source.env] - Backing env map
 *   the `env` Proxy reads through to on every access.
 * @returns {object} The `proc` collaborator.
 */
export function createDefaultProc({ source = process, env = source.env } = {}) {
  const proc = {
    cwd: () => source.cwd(),
    env: new Proxy(env, {
      get: (t, k) => t[k],
      has: (t, k) => k in t,
      set: (t, k, v) => {
        t[k] = v;
        return true;
      },
      deleteProperty: (t, k) => {
        delete t[k];
        return true;
      },
      ownKeys: (t) => Reflect.ownKeys(t),
      getOwnPropertyDescriptor: (t, k) =>
        Reflect.getOwnPropertyDescriptor(t, k) ?? {
          configurable: true,
          enumerable: true,
          value: t[k],
          writable: true,
        },
    }),
    argv: Object.freeze([...source.argv]),
    stdin: lineIterator(source.stdin),
    stdout: { write: (s) => source.stdout.write(s) },
    stderr: { write: (s) => source.stderr.write(s) },
    exit: (code) => source.exit(code),
  };
  Object.defineProperty(proc, "exitCode", {
    enumerable: true,
    get: () => source.exitCode,
    set: (v) => {
      source.exitCode = v;
    },
  });
  return proc;
}

/**
 * Adapt a readable stream into an `AsyncIterable<string>` of UTF-8 lines.
 * @param {object} stream - A Node readable stream (e.g. `process.stdin`).
 * @returns {AsyncIterable<string>}
 */
function lineIterator(stream) {
  return {
    async *[Symbol.asyncIterator]() {
      let buffer = "";
      for await (const chunk of stream) {
        buffer += chunk.toString("utf8");
        let nl;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          yield buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
        }
      }
      if (buffer.length > 0) yield buffer;
    },
  };
}

/**
 * Build the clock surface backed by real timers.
 * @returns {{now: () => number, sleep: (ms: number) => Promise<void>, setTimeout: Function, clearTimeout: Function}}
 */
export function createDefaultClock() {
  return {
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle),
  };
}

/**
 * Build the subprocess surface over `node:child_process`. `run` buffers the
 * full output; `spawn` exposes streaming AsyncIterables plus an exit Promise.
 * @returns {{run: Function, spawn: Function}}
 */
export function createDefaultSubprocess() {
  const run = (cmd, args = [], opts = {}) =>
    new Promise((resolve) => {
      execFile(
        cmd,
        args,
        { encoding: "utf8", ...opts },
        (err, stdout, stderr) => {
          resolve({
            stdout: stdout ?? "",
            stderr: stderr ?? "",
            // Always numeric: child code on normal exit, 128 for a signal-kill
            // (err.code null, err.signal set), 127 for a spawn failure
            // (err.code is a string like "ENOENT").
            exitCode: normalizeExitCode(err),
            signal: err?.signal ?? null,
          });
        },
      );
    });

  const spawn = (cmd, args = [], opts = {}) => {
    const child = nodeSpawn(cmd, args, opts);
    return {
      stdout: child.stdout ?? emptyAsyncIterable(),
      stderr: child.stderr ?? emptyAsyncIterable(),
      exitCode: new Promise((resolve) => {
        child.on("close", (code) => resolve(code ?? 0));
      }),
      kill: (signal) => child.kill(signal),
    };
  };

  return { run, spawn };
}

/**
 * Map an `execFile` error to a numeric exit code.
 * @param {Error & {code?: number|string, signal?: string}} [err]
 * @returns {number}
 */
function normalizeExitCode(err) {
  if (!err) return 0;
  if (typeof err.code === "number") return err.code;
  if (err.signal) return 128;
  return 127;
}

function emptyAsyncIterable() {
  return {
    [Symbol.asyncIterator]() {
      return { next: async () => ({ done: true, value: undefined }) };
    },
  };
}

/**
 * Build the production runtime bag. Two-phase: phase 1 assembles the leaf
 * collaborators, phase 2 constructs the `Finder` from them, then the whole
 * bag is frozen and returned.
 *
 * @param {object} [options]
 * @param {Record<string,string>} [options.env=process.env] - Backing env.
 * @returns {Readonly<Runtime>}
 */
export function createDefaultRuntime({ env = process.env } = {}) {
  const fs = nodeFs;
  const fsSync = nodeFsSync;
  const proc = createDefaultProc({ source: process, env });
  const clock = createDefaultClock();
  const subprocess = createDefaultSubprocess();
  // Finder needs the sync existence surface plus the async fs ops; pass both.
  const finder = new Finder({ fs, fsSync, proc });
  return Object.freeze({ fs, fsSync, proc, clock, subprocess, finder });
}
