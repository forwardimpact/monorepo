/**
 * Additional infrastructure mocks for services/products tests. This module
 * centralizes variants that consumers previously inlined.
 */
import { Writable } from "node:stream";

/**
 * A `Writable` that captures output. The mock uses it as
 * `proc.stdout`/`stderr`. It retains the `chunks` accessor that current
 * assertions read. It is also a real `Writable`, so it accepts piped input
 * (e.g. a `pipeline()` from a read stream).
 */
class CaptureWritable extends Writable {
  constructor() {
    super();
    this.chunks = [];
  }

  /**
   * @param {Buffer|string} chunk - The written chunk.
   * @param {string} _encoding - Chunk encoding (unused).
   * @param {Function} callback - Completion callback.
   */
  _write(chunk, _encoding, callback) {
    this.chunks.push(String(chunk));
    callback();
  }
}

/**
 * Creates a mock Supabase-style client with configurable table and storage
 * behaviour. It covers the patterns across products/map/test/activity/*.
 *
 * @param {object} [options]
 * @param {Record<string, object>} [options.tables] - Map of table name to
 *   override. Each override may expose `select`, `insert`, `upsert`, `delete`
 *   as async functions. Unspecified methods return `{ data: [], error: null }`.
 * @param {Record<string, string>} [options.files] - Files exposed through
 *   `storage.from(...).list(prefix)` / `.download(path)`.
 * @returns {object} Mock client and arrays that track calls.
 */
export function createMockSupabaseClient({ tables = {}, files = {} } = {}) {
  const calls = {
    select: [],
    insert: [],
    upsert: [],
    delete: [],
    download: [],
    list: [],
  };

  function record(kind, entry) {
    calls[kind].push(entry);
  }

  return {
    calls,
    from(table) {
      const override = tables[table] ?? {};
      return {
        async select(...args) {
          record("select", { table, args });
          if (override.select) return override.select(...args);
          return { data: [], error: null };
        },
        async insert(rows, opts) {
          record("insert", { table, rows, options: opts });
          if (override.insert) return override.insert(rows, opts);
          return { data: rows, error: null };
        },
        async upsert(rows, opts) {
          record("upsert", {
            table,
            rows,
            onConflict: opts?.onConflict,
            options: opts,
          });
          if (override.upsert) return override.upsert(rows, opts);
          return { data: rows, error: null };
        },
        async delete(...args) {
          record("delete", { table, args });
          if (override.delete) return override.delete(...args);
          return { error: null };
        },
      };
    },
    storage: {
      from() {
        return {
          async list(prefix) {
            record("list", { prefix });
            const names = Object.keys(files)
              .filter((k) => k.startsWith(prefix))
              .map((k) => ({
                name: k.slice(prefix.length),
                created_at: "z",
              }));
            return { data: names, error: null };
          },
          async download(path) {
            record("download", { path });
            const content = files[path];
            if (content === undefined) {
              return { data: null, error: { message: "not found" } };
            }
            return {
              data: { text: async () => content },
              error: null,
            };
          },
        };
      },
    },
  };
}

/**
 * Creates helpers that parse Turtle with an injected n3 Parser. This keeps
 * libmock free of an n3 dependency. Services can still share the
 * parseQuads / findAll / findOne idiom.
 *
 * @param {import("n3").Parser | Function} ParserOrInstance - n3 Parser class
 *   or a pre-built parser instance.
 * @param {object} [options]
 * @param {string} [options.format="Turtle"] - Parser format.
 * @returns {object} { parseQuads, findAll, findOne }
 */
export function createTurtleHelpers(
  ParserOrInstance,
  { format = "Turtle" } = {},
) {
  const isClass =
    typeof ParserOrInstance === "function" &&
    ParserOrInstance.prototype &&
    typeof ParserOrInstance.prototype.parse === "function";
  const parser = isClass ? new ParserOrInstance({ format }) : ParserOrInstance;

  function parseQuads(turtle) {
    return parser.parse(turtle);
  }

  function findAll(quads, { subject, predicate, object } = {}) {
    return quads.filter(
      (q) =>
        (!subject || q.subject.value === subject) &&
        (!predicate || q.predicate.value === predicate) &&
        (!object || q.object.value === object),
    );
  }

  function findOne(quads, pattern) {
    return findAll(quads, pattern)[0];
  }

  return { parseQuads, findAll, findOne };
}

/**
 * Build an `AsyncIterable<string>` over a fixed list of input chunks. The
 * mock uses it as `proc.stdin`.
 * @param {string[]} chunks - Lines/chunks the iterator yields in order.
 * @returns {AsyncIterable<string>}
 */
export function createMockStdin(chunks = []) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

/**
 * Creates a mock `process`-like object that matches the `Runtime.proc`
 * surface: `cwd()`, `env`, `argv`, `stdin`, `stdout`/`stderr` (`Writable`s
 * that capture output), `exit(code)`, `kill(pid, signal)`, `pid`,
 * `platform`, `on(event, handler)`, and a settable `exitCode`. The mock
 * captures writes on `stdout.chunks` / `stderr.chunks`, and the streams
 * accept piped input. It records kill calls on `kills`. It records event
 * handlers on `handlers`. Fire them with `emit(event, ...args)` to simulate
 * a signal.
 *
 * @param {object} [options]
 * @param {Record<string, string>} [options.env] - Initial env map.
 * @param {string} [options.cwd] - Working directory `cwd()` returns.
 * @param {string[]} [options.argv] - The frozen `argv` array.
 * @param {string[]} [options.stdin] - Chunks the `stdin` iterator yields.
 * @param {(pid: number, signal: string|number) => any} [options.kill] - Optional
 *   `kill` implementation (e.g. to model a liveness probe). The mock always
 *   records calls on the returned `kills` array regardless.
 * @param {number} [options.pid] - The fake's `pid` (default 1234).
 * @param {string} [options.platform] - The fake's `platform` string
 *   (default `"linux"`). Set `"darwin"`/`"win32"` to exercise per-platform
 *   code.
 * @returns {object}
 */
export function createMockProcess({
  env = {},
  cwd,
  argv,
  stdin,
  kill,
  pid = 1234,
  platform = "linux",
} = {}) {
  const stdout = new CaptureWritable();
  const stderr = new CaptureWritable();
  const kills = [];
  // Registered event handlers (e.g. "SIGTERM"/"SIGINT"). A test can fire them
  // with `emit(event, ...args)` to simulate a signal without a real process.
  const handlers = {};
  return {
    env: { ...env },
    cwd: () => cwd ?? "/work",
    argv: Object.freeze([...(argv ?? ["/usr/bin/node", "/tmp/test-bin.js"])]),
    stdin: createMockStdin(stdin ?? []),
    stdout,
    stderr,
    pid,
    platform,
    exitCode: 0,
    exit(code = 0) {
      this.exitCode = code;
    },
    kills,
    kill(pid, signal) {
      kills.push({ pid, signal });
      return kill?.(pid, signal);
    },
    handlers,
    on(event, handler) {
      (handlers[event] ??= []).push(handler);
    },
    emit(event, ...args) {
      for (const handler of handlers[event] ?? []) handler(...args);
    },
  };
}

/**
 * Runs `fn` and suppresses `console.log`, `console.info`, and `console.warn`.
 * It returns whatever `fn` returns. Errors still propagate.
 *
 * @template T
 * @param {() => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withSilentConsole(fn) {
  const originals = {
    log: console.log,
    info: console.info,
    warn: console.warn,
  };
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.log = originals.log;
    console.info = originals.info;
    console.warn = originals.warn;
  }
}

/**
 * Creates a bag of async query stubs from a plain values object. A function
 * value passes through untouched. Anything else becomes an async function
 * that returns that value. This collapses landmark-style `stubQueries`
 * boilerplate.
 *
 * @param {Record<string, unknown>} values
 * @returns {Record<string, Function>}
 */
export function createMockQueries(values = {}) {
  const out = {};
  for (const [key, val] of Object.entries(values)) {
    out[key] = typeof val === "function" ? val : async () => val;
  }
  return out;
}

/**
 * Creates a minimal mock S3 client that records command sends and returns a
 * configurable response.
 *
 * @param {object} [options]
 * @param {(command: object) => unknown} [options.sendFn] - Custom send handler.
 * @returns {object} { client, sends }
 */
export function createMockS3Client({ sendFn } = {}) {
  const sends = [];
  return {
    sends,
    async send(command) {
      sends.push(command);
      if (sendFn) return sendFn(command);
      return {};
    },
  };
}
