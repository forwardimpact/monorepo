import { Writable } from "node:stream";

import { spy } from "./spy.js";

function asyncIterableOf(str) {
  return {
    async *[Symbol.asyncIterator]() {
      if (str) yield str;
    },
  };
}

/**
 * A captured-chunks sink for a spawned child's writable stdin. A real
 * `node:stream` Writable (so it is a valid `pipe()` destination, the way a
 * supervisor pipes a service's output into its logger) that records every
 * written chunk on `chunks` instead of forwarding it anywhere. Mirrors the
 * `stdin` the production `createDefaultSubprocess().spawn` exposes.
 */
function createMockStdinSink() {
  const chunks = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      callback();
    },
  });
  sink.chunks = chunks;
  return sink;
}

/**
 * Creates a mock subprocess collaborator matching the `Runtime.subprocess`
 * surface. `run(cmd, args, opts)` resolves to `{ stdout, stderr, exitCode }`
 * consulting `responses[cmd]` (default: empty success); `runSync` is its
 * synchronous sibling returning the same shape. `spawn` returns a streaming
 * quad backed by the same responses (its result carries `stdout`/`stderr`
 * AsyncIterables, a captured-chunks `stdin` sink, `exitCode`/`signal` Promises,
 * a `kill(signal)` spy recording on `kills`, and `pid`). All invocations are
 * recorded on `calls`.
 *
 * @param {object} [options]
 * @param {Record<string, {stdout?: string, stderr?: string, exitCode?: number}>} [options.responses]
 * @returns {{run: Function, runSync: Function, spawn: Function, calls: Array<{cmd: string, args: string[], opts: object}>}}
 */
export function createMockSubprocess({ responses = {} } = {}) {
  const calls = [];
  const resolve = (cmd) => ({
    stdout: "",
    stderr: "",
    exitCode: 0,
    signal: null,
    ...(responses[cmd] ?? {}),
  });

  const run = spy(async (cmd, args = [], opts = {}) => {
    calls.push({ cmd, args, opts });
    return resolve(cmd);
  });

  const runSync = spy((cmd, args = [], opts = {}) => {
    calls.push({ cmd, args, opts });
    return resolve(cmd);
  });

  const spawn = spy((cmd, args = [], opts = {}) => {
    calls.push({ cmd, args, opts });
    const r = resolve(cmd);
    const kills = [];
    return {
      stdout: asyncIterableOf(r.stdout),
      stderr: asyncIterableOf(r.stderr),
      // A captured-chunks writable; `null` only when a response explicitly
      // sets `stdin: null` (matching a child spawned without a stdin pipe).
      stdin: r.stdin === null ? null : createMockStdinSink(),
      exitCode: Promise.resolve(r.exitCode),
      // Terminating signal: `null` (clean exit) unless a response overrides it.
      signal: Promise.resolve(r.signal ?? null),
      kills,
      kill: spy((signal) => {
        kills.push(signal);
      }),
      pid: r.pid ?? 4321,
    };
  });

  return { run, runSync, spawn, calls };
}
