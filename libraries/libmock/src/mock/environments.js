import { createMockStorage } from "./storage.js";

/**
 * Graph-index test triple: a mock storage, an n3 Store, and a GraphIndex wired
 * to both. GraphIndex and Store are injected so libmock stays dependency-free.
 * @param {object} opts
 * @param {Function} opts.GraphIndex - libgraph GraphIndex constructor.
 * @param {Function} opts.Store - n3 Store constructor.
 * @param {object} [opts.storageOverrides] - passed to createMockStorage.
 * @param {*} [opts.prefixes] - prefixes arg for GraphIndex (default {}).
 * @param {string} [opts.indexKey] - jsonl key (default "test-graph.jsonl").
 * @returns {{ n3Store: object, graphIndex: object, mockStorage: object }}
 */
export function createGraphIndexFixture({
  GraphIndex,
  Store,
  storageOverrides,
  prefixes = {},
  indexKey = "test-graph.jsonl",
}) {
  const mockStorage = createMockStorage(storageOverrides);
  const n3Store = new Store();
  const graphIndex = new GraphIndex(mockStorage, n3Store, prefixes, indexKey);
  return { n3Store, graphIndex, mockStorage };
}

/**
 * The stripped gRPC health service definition consumers' tests fake — the
 * `{ Check: { path, requestStream, responseStream } }` shape, not librpc's
 * real `healthDefinition` (which librpc's own tests exercise directly).
 * @returns {{ Check: { path: string, requestStream: boolean, responseStream: boolean } }}
 */
export function createMockGrpcHealthDefinition() {
  return {
    Check: {
      path: "/grpc.health.v1.Health/Check",
      requestStream: false,
      responseStream: false,
    },
  };
}

/**
 * The readline/process/os/formatter/storage bundle librepl's tests inject.
 * Mirrors libraries/librepl/test/librepl.test.js's pre-collapse beforeEach.
 * @returns {{ readline: object, process: object, os: object, formatter: Function, storage: object }}
 */
export function createReplEnvironment() {
  const proc = {
    argv: ["node", "script.js"],
    stdin: {
      isTTY: true,
      setEncoding: () => {},
      async *[Symbol.asyncIterator]() {
        yield "test input";
      },
    },
    stdout: { write: () => {} },
    stderr: { write: () => {} },
    exit: (code) => {
      proc._exitCalled = true;
      proc._exitCode = code;
    },
    _exitCalled: false,
    _exitCode: null,
  };
  return {
    readline: {
      createInterface: () => ({
        on: () => {},
        prompt: () => {},
        close: () => {},
      }),
    },
    process: proc,
    os: { userInfo: () => ({ uid: 1000 }) },
    formatter: () => ({ format: (text) => `formatted: ${text}` }),
    storage: createMockStorage(),
  };
}
