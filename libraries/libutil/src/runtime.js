import { spawn as nodeSpawn, execFile, spawnSync } from "node:child_process";
import nodeFsSync, {
  createReadStream as nodeCreateReadStream,
  createWriteStream as nodeCreateWriteStream,
} from "node:fs";
import nodeFs from "node:fs/promises";
import { Writable } from "node:stream";
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
 *   `writeFile`, `readdir`, `stat`, `mkdir`, `access`, `copyFile`, `cp`, `rm`,
 *   `lstat`, `unlink`, `rename`, `symlink`, `utimes`, `chmod`, plus the two stream
 *   factories `createReadStream` / `createWriteStream` (the `node:fs` shape —
 *   the promises API has no stream factories, so they live on the async
 *   surface as the canonical streaming seam). A module destructures `fs` xor
 *   `fsSync`, never both (design Decision 7).
 * @property {Object} fsSync
 *   Sync filesystem surface (the `node:fs` shape): `existsSync`,
 *   `readFileSync`, `writeFileSync`, `mkdirSync`, `readdirSync`, `statSync`,
 *   `openSync`, `readSync`, `closeSync`, `unlinkSync`.
 * @property {Object} proc
 *   Process surface: `cwd()`, `env`, `argv`, `stdin`, `stdout`/`stderr`
 *   (pipeline-grade `Writable`s — they support `.write(str)` and also serve as
 *   `pipeline()` sinks), `exit(code)`, `kill(pid, signal)` (a negative `pid`
 *   signals the process group, e.g. for daemon teardown), `pid` (this
 *   process's id — used to exclude self from process-group descendant scans),
 *   `platform` (the `process.platform` string — `"darwin"`/`"win32"`/`"linux"`
 *   — for per-platform path resolution), `on(event, handler)` (subscribe to
 *   process events such as `"SIGTERM"`/`"SIGINT"` so daemons register signal
 *   handlers through the collaborator instead of the global), and an
 *   `exitCode` accessor.
 * @property {Object} clock
 *   Time surface: `now()`, `sleep(ms)`, `setTimeout(fn, ms)`,
 *   `clearTimeout(handle)`, `setInterval(fn, ms)`, `clearInterval(handle)`.
 *   The interval handle mirrors the host timer (so callers may `.unref()` it).
 * @property {Object} subprocess
 *   Subprocess surface: `run(cmd, args, opts) -> Promise<{stdout, stderr,
 *   exitCode}>` (async, buffered), `runSync(cmd, args, opts) -> {stdout,
 *   stderr, exitCode}` (synchronous, buffered — for the rare caller that
 *   cannot go async, e.g. a sync config accessor shelling to `gh auth
 *   token`), and `spawn(cmd, args, opts) -> {stdout, stderr, stdin, exitCode,
 *   signal, kill, pid}` where `stdout`/`stderr` are AsyncIterables,
 *   `exitCode`/`signal` are Promises (the terminating signal name or `null`),
 *   `stdin` is the child's writable (only when `opts.stdio` pipes stdin, else
 *   `null`), `kill(signal)` signals the child, and `pid` is its id (`undefined`
 *   on spawn failure).
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
    // Pipeline-grade Writables: they support `.write(str)` like the old
    // `{ write }` shim and also serve as `pipeline()` sinks. The wrapper
    // forwards each chunk to the real stream; `.end()` finishes the wrapper
    // without closing `source.stdout`/`stderr`.
    stdout: forwardingWritable(source.stdout),
    stderr: forwardingWritable(source.stderr),
    exit: (code) => source.exit(code),
    kill: (pid, signal) => source.kill(pid, signal),
    pid: source.pid,
    platform: source.platform,
    on: (event, handler) => source.on(event, handler),
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
 * Wrap an underlying writable (`process.stdout`/`stderr`) in a pipeline-grade
 * `Writable` sink that forwards every chunk to it. Used so `runtime.proc.stdout`
 * can be both `.write(str)`-ed and used as a `pipeline()` destination, without
 * `.end()` on the wrapper closing the real stream.
 * @param {object} target - The underlying writable to forward chunks to.
 * @returns {import("node:stream").Writable}
 */
function forwardingWritable(target) {
  return new Writable({
    write(chunk, _encoding, callback) {
      // Forward and complete immediately. The underlying stream's
      // backpressure signal is not propagated, which is fine for the CLI
      // sinks this serves (a one-shot `librc logs()` tail); a future
      // high-volume consumer that needs flow control should respect
      // `target.write()`'s return value here.
      target.write(chunk);
      callback();
    },
  });
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
 * @returns {{now: () => number, sleep: (ms: number) => Promise<void>, setTimeout: Function, clearTimeout: Function, setInterval: Function, clearInterval: Function}}
 */
export function createDefaultClock() {
  return {
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (handle) => clearInterval(handle),
  };
}

/**
 * Build the subprocess surface over `node:child_process`. `run` buffers the
 * full output; `runSync` is its synchronous sibling; `spawn` exposes streaming
 * AsyncIterables plus an exit Promise.
 * @returns {{run: Function, runSync: Function, spawn: Function}}
 */
export function createDefaultSubprocess() {
  const runSync = (cmd, args = [], opts = {}) => {
    const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
    // `error` is set on spawn failure (e.g. ENOENT); mirror run()'s mapping:
    // numeric status, 128 for a signal-kill, 127 for a spawn failure.
    let exitCode = 0;
    if (r.error) exitCode = 127;
    else if (typeof r.status === "number") exitCode = r.status;
    else if (r.signal) exitCode = 128;
    return {
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? "",
      exitCode,
      signal: r.signal ?? null,
    };
  };

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
    let resolveSignal;
    const signal = new Promise((r) => {
      resolveSignal = r;
    });
    let resolveExit;
    const exitCode = new Promise((r) => {
      resolveExit = r;
    });
    child.on("close", (code, sig) => {
      resolveSignal(sig ?? null);
      resolveExit(code ?? 0);
    });
    // A spawn failure (e.g. ENOENT for a missing binary) emits an `error`
    // event. With no listener Node rethrows it as an uncaughtException and
    // crashes the whole process — even for callers that synchronously guard
    // `pid === undefined`, because the event fires on a later tick. Mirror the
    // run()/runSync() contract instead: resolve a 127 exit code and a null
    // signal so the surface never rejects and never crashes. `resolveExit` is
    // idempotent, so a `close` arriving after `error` is a no-op.
    child.on("error", () => {
      resolveSignal(null);
      resolveExit(127);
    });
    return {
      stdout: child.stdout ?? emptyAsyncIterable(),
      stderr: child.stderr ?? emptyAsyncIterable(),
      // The child's writable stdin — present only when `opts.stdio` makes
      // stdin a pipe (e.g. `["pipe", ...]`); `null` otherwise. A supervising
      // caller writes its piped output into it.
      stdin: child.stdin ?? null,
      exitCode,
      // Resolves with the terminating signal name (or `null` on a clean exit),
      // alongside `exitCode`. Supervisors that distinguish a SIGTERM teardown
      // from a crash read it; clean-exit callers can ignore it.
      signal,
      kill: (signal) => child.kill(signal),
      // The child's pid — `undefined` if the spawn failed. Detached callers
      // read it to derive the process-group id for group teardown.
      pid: child.pid,
    };
  };

  return { run, runSync, spawn };
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
  // The async fs surface is `node:fs/promises` augmented with the two stream
  // factories (which only exist on `node:fs`), so streaming consumers never
  // import `node:fs` directly.
  const fs = {
    ...nodeFs,
    createReadStream: nodeCreateReadStream,
    createWriteStream: nodeCreateWriteStream,
  };
  const fsSync = nodeFsSync;
  const proc = createDefaultProc({ source: process, env });
  const clock = createDefaultClock();
  const subprocess = createDefaultSubprocess();
  // Finder needs the sync existence surface plus the async fs ops; pass both.
  const finder = new Finder({ fs, fsSync, proc });
  return Object.freeze({ fs, fsSync, proc, clock, subprocess, finder });
}
