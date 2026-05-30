import { spy } from "./spy.js";

function asyncIterableOf(str) {
  return {
    async *[Symbol.asyncIterator]() {
      if (str) yield str;
    },
  };
}

/**
 * Creates a mock subprocess collaborator matching the `Runtime.subprocess`
 * surface. `run(cmd, args, opts)` resolves to `{ stdout, stderr, exitCode }`
 * consulting `responses[cmd]` (default: empty success); `runSync` is its
 * synchronous sibling returning the same shape. `spawn` returns a streaming
 * quad backed by the same responses. All invocations are recorded on `calls`.
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
    return {
      stdout: asyncIterableOf(r.stdout),
      stderr: asyncIterableOf(r.stderr),
      exitCode: Promise.resolve(r.exitCode),
      kill: spy(() => {}),
    };
  });

  return { run, runSync, spawn, calls };
}
