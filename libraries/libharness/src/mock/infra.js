/**
 * Additional infrastructure mocks for services/products tests. Centralizes
 * variants that consumers previously inlined.
 */

/**
 * Creates a mock Supabase-style client with configurable table and storage
 * behaviour. Covers the patterns found across products/map/test/activity/*.
 *
 * @param {object} [options]
 * @param {Record<string, object>} [options.tables] - Map of table name to
 *   override. Each override may expose `select`, `insert`, `upsert`, `delete`
 *   as async functions. Unspecified methods return `{ data: [], error: null }`.
 * @param {Record<string, string>} [options.files] - Files exposed via
 *   `storage.from(...).list(prefix)` / `.download(path)`.
 * @returns {object} Mock client and call-tracking arrays.
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
 * Creates Turtle parsing helpers bound to an injected n3 Parser. Keeps
 * libharness free of an n3 dependency while allowing services to share the
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
 * Creates a minimal mock `process`-like object with env, stdout, stderr,
 * exitCode, and simple write capture.
 *
 * @param {object} [options]
 * @param {Record<string, string>} [options.env]
 * @returns {object}
 */
export function createMockProcess({ env = {} } = {}) {
  const stdout = { chunks: [], write: (s) => stdout.chunks.push(String(s)) };
  const stderr = { chunks: [], write: (s) => stderr.chunks.push(String(s)) };
  return {
    env: { ...env },
    stdout,
    stderr,
    exitCode: 0,
    exit(code = 0) {
      this.exitCode = code;
    },
  };
}

/**
 * Runs `fn` with `console.log`, `console.info`, and `console.warn` suppressed,
 * returning whatever `fn` returns. Errors still propagate.
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
 * value is passed through untouched; anything else becomes an async function
 * returning that value. Collapses landmark-style `stubQueries` boilerplate.
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
