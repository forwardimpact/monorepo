import { spy } from "./spy.js";
import { common } from "@forwardimpact/libtype";
import grpc from "@grpc/grpc-js";

/**
 * Creates a mock memory client
 * @param {object} overrides - Method overrides
 * @returns {object} Mock memory client
 */
export function createMockMemoryClient(overrides = {}) {
  return {
    GetWindow: spy(() =>
      Promise.resolve({
        messages: [{ role: "system", content: "You are an assistant" }],
        tools: [],
      }),
    ),
    AppendMemory: spy(() => Promise.resolve({ accepted: "test-id" })),
    ...overrides,
  };
}

/**
 * Creates a mock LLM client
 * @param {object} overrides - Method overrides
 * @returns {object} Mock LLM client
 */
export function createMockLlmClient(overrides = {}) {
  return {
    CreateCompletions: spy(() =>
      Promise.resolve({
        id: "test-completion",
        choices: [
          {
            message: common.Message.fromObject({
              role: "assistant",
              content: "Test response",
            }),
          },
        ],
        usage: { total_tokens: 100 },
      }),
    ),
    CreateEmbeddings: spy(() =>
      Promise.resolve({
        data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
      }),
    ),
    ...overrides,
  };
}

/**
 * Creates a mock agent client
 * @param {object} overrides - Method overrides
 * @returns {object} Mock agent client
 */
export function createMockAgentClient(overrides = {}) {
  return {
    ProcessUnary: spy(() =>
      Promise.resolve({
        resource_id: "test-conversation",
        choices: [
          {
            message: common.Message.fromObject({
              role: "assistant",
              content: "Test response",
            }),
          },
        ],
      }),
    ),
    ProcessStream: spy(),
    ...overrides,
  };
}

/**
 * Creates a mock trace client
 * @param {object} overrides - Method overrides
 * @returns {object} Mock trace client
 */
export function createMockTraceClient(overrides = {}) {
  return {
    RecordSpan: spy(() => Promise.resolve()),
    ...overrides,
  };
}

/**
 * Creates a mock vector client
 * @param {object} overrides - Method overrides
 * @returns {object} Mock vector client
 */
export function createMockVectorClient(overrides = {}) {
  return {
    SearchContent: spy(() =>
      Promise.resolve({
        identifiers: [],
      }),
    ),
    ...overrides,
  };
}

/**
 * Creates a mock graph client
 * @param {object} overrides - Method overrides
 * @returns {object} Mock graph client
 */
export function createMockGraphClient(overrides = {}) {
  return {
    QueryByPattern: spy(() =>
      Promise.resolve({
        identifiers: [],
      }),
    ),
    ...overrides,
  };
}

/**
 * Creates a mock tool client
 * @param {object} overrides - Method overrides
 * @returns {object} Mock tool client
 */
export function createMockToolClient(overrides = {}) {
  return {
    CallTool: spy(() =>
      Promise.resolve({
        content: "Tool result",
      }),
    ),
    ...overrides,
  };
}

function notFound() {
  return Object.assign(new Error("not found"), {
    code: grpc.status.NOT_FOUND,
  });
}

/**
 * Creates a mock discussion (bridge) client
 * @param {object} overrides - Method overrides
 * @returns {object} Mock discussion client
 */
export function createMockDiscussionClient(overrides = {}) {
  return {
    LoadDiscussion: spy(() => Promise.reject(notFound())),
    LoadDiscussionByCorrelation: spy(() => Promise.reject(notFound())),
    ListOpenRecesses: spy(() => Promise.resolve({ refs: [] })),
    SaveDiscussion: spy(() => Promise.resolve({})),
    HasOrigin: spy(() => Promise.resolve({ exists: false })),
    RecordOrigin: spy(() => Promise.resolve({})),
    Sweep: spy(() =>
      Promise.resolve({
        evicted_discussions: 0,
        evicted_origins: 0,
        evicted_pending: 0,
      }),
    ),
    PutPendingDispatch: spy(() => Promise.resolve({})),
    ResolvePendingDispatch: spy(() => Promise.reject(notFound())),
    ...overrides,
  };
}

function coerceInt64Fields(obj) {
  obj.open_rfcs ??= {};
  obj.pending_callbacks ??= {};
  obj.history ??= [];
  obj.participants ??= [];
  obj.dispatches = (obj.dispatches ?? []).map(Number);
  if (obj.last_active_at != null)
    obj.last_active_at = Number(obj.last_active_at);
  for (const rfc of Object.values(obj.open_rfcs)) {
    if (rfc.due_at != null) rfc.due_at = Number(rfc.due_at);
    if (rfc.opened_at != null) rfc.opened_at = Number(rfc.opened_at);
    if (rfc.history_index_at_open != null)
      rfc.history_index_at_open = Number(rfc.history_index_at_open);
    if (rfc.trigger?.replies != null)
      rfc.trigger.replies = Number(rfc.trigger.replies);
  }
}

/**
 * Creates a stateful mock discussion client that retains records across
 * save/load cycles, coercing proto int64 fields back to numbers.
 * @returns {object} Stateful mock discussion client
 */
export function createStatefulDiscussionClient() {
  const records = new Map();
  const origins = new Map();
  const pending = new Map();

  return {
    SaveDiscussion: spy(async (req) => {
      const obj = req?.toJSON?.() ?? req;
      coerceInt64Fields(obj);
      records.set(obj.id, obj);
      return {};
    }),
    LoadDiscussion: spy(async (req) => {
      const obj = req?.toJSON?.() ?? req;
      const key = `${obj.channel}:${obj.discussion_id}`;
      const rec = records.get(key);
      if (!rec) throw notFound();
      return rec;
    }),
    LoadDiscussionByCorrelation: spy(async (req) => {
      const obj = req?.toJSON?.() ?? req;
      for (const rec of records.values()) {
        if (
          Object.values(rec.pending_callbacks ?? {}).includes(
            obj.correlation_id,
          ) ||
          rec.open_rfcs?.[obj.correlation_id]
        )
          return rec;
      }
      throw notFound();
    }),
    ListOpenRecesses: spy(async () => {
      const refs = [];
      for (const rec of records.values())
        for (const [cid, rfc] of Object.entries(rec.open_rfcs ?? {}))
          if (typeof rfc.due_at === "number")
            refs.push({ correlation_id: cid, due_at: rfc.due_at });
      return { refs };
    }),
    HasOrigin: spy(async (req) => {
      const obj = req?.toJSON?.() ?? req;
      return { exists: origins.has(obj.id) };
    }),
    RecordOrigin: spy(async (req) => {
      const obj = req?.toJSON?.() ?? req;
      origins.set(obj.id, obj);
      return {};
    }),
    Sweep: spy(async () => ({
      evicted_discussions: 0,
      evicted_origins: 0,
      evicted_pending: 0,
    })),
    PutPendingDispatch: spy(async (req) => {
      const obj = req?.toJSON?.() ?? req;
      const p = obj.pending ?? obj;
      pending.set(p.link_token, p);
      return {};
    }),
    ResolvePendingDispatch: spy(async (req) => {
      const obj = req?.toJSON?.() ?? req;
      const token = obj.link_token;
      const rec = pending.get(token);
      if (!rec) throw notFound();
      pending.delete(token);
      return rec;
    }),
  };
}
