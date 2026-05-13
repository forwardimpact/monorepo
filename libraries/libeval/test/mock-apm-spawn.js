/**
 * Test-only fake `spawn` for `ApmInstaller`. Returns a child-process-shaped
 * EventEmitter that emits `close` with the configured exit code on the next
 * tick. Tests inject this via `new ApmInstaller({ spawn: makeFakeApmSpawn() })`
 * so the suite never shells out to a real `apm` binary.
 *
 * Intentionally a regular module (not a test file) so it can be imported by
 * any test that needs to construct an installer.
 */

import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

/**
 * @param {object} [opts]
 * @param {number} [opts.exitCode=0] - Code emitted on `close`.
 * @param {string} [opts.stderr=""] - Bytes written to the child's stderr.
 * @param {Error} [opts.spawnError] - When set, emit `error` instead of `close`.
 * @returns {(cmd: string, args: string[], opts: object) => object} fake spawn
 */
export function makeFakeApmSpawn({
  exitCode = 0,
  stderr = "",
  spawnError,
} = {}) {
  const calls = [];
  const fake = (cmd, args, options) => {
    calls.push({ cmd, args, options });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    queueMicrotask(() => {
      if (spawnError) {
        child.emit("error", spawnError);
        return;
      }
      if (stderr) child.stderr.write(stderr);
      child.stdout.end();
      child.stderr.end();
      child.emit("close", exitCode);
    });
    return child;
  };
  fake.calls = calls;
  return fake;
}
