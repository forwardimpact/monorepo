/**
 * Process-bound I/O collaborators shared across libwiki commands.
 *
 * Each command accepts an optional `io` argument; when omitted, the
 * bound `process.*` defaults run. Tests construct a synthetic `io`
 * (e.g. capturing stdout into a string and recording exit codes
 * instead of terminating the runner) and call command handlers
 * directly, avoiding `execFileSync("node", [...])`.
 */
export function createDefaultIo() {
  return {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
    exit: (code) => process.exit(code),
    cwd: () => process.cwd(),
    env: process.env,
    today: () => new Date().toISOString().slice(0, 10),
  };
}

/**
 * Test helper: synthetic `io` that captures stdout/stderr into strings
 * and records exit codes instead of terminating the process. After a
 * handler returns, inspect `out`/`err`/`exitCode` to assert behavior.
 *
 * @param {object} overrides - Per-test overrides (cwd, env, today).
 * @returns {object} `{ stdout, stderr, exit, cwd, env, today, out, err, exitCode }`
 */
export function createTestIo(overrides = {}) {
  const io = {
    out: "",
    err: "",
    exitCode: null,
    stdout(s) {
      io.out += s;
    },
    stderr(s) {
      io.err += s;
    },
    exit(code) {
      io.exitCode = code;
      throw new IoExit(code);
    },
    cwd: overrides.cwd ?? (() => process.cwd()),
    env: overrides.env ?? process.env,
    today: overrides.today ?? (() => new Date().toISOString().slice(0, 10)),
  };
  return io;
}

/**
 * Thrown by `createTestIo`'s `exit` so handlers stop unwinding the way
 * `process.exit` would. Tests can catch it or wrap calls in
 * `runWithIo(() => handler(...), io)`.
 */
export class IoExit extends Error {
  /** @param {number} code - Exit code the handler asked the process to exit with. */
  constructor(code) {
    super(`IoExit(${code})`);
    this.name = "IoExit";
    this.code = code;
  }
}

/**
 * Run a handler that may call `io.exit()`; swallow the synthetic
 * IoExit so callers can inspect `io.exitCode` linearly without
 * try/catch boilerplate.
 */
export async function runWithIo(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof IoExit) return undefined;
    throw err;
  }
}
