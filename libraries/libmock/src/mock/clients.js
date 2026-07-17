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
 * Creates a mock span client
 * @param {object} overrides - Method overrides
 * @returns {object} Mock span client
 */
export function createMockSpanClient(overrides = {}) {
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

/**
 * Reject a request that omits `tenant_id`, mirroring `services/bridge`'s
 * `requireTenant` guard. Every tenant-scoped RPC carries a `tenant_id` in
 * both deployment modes (single-tenant binds the literal `"default"`); an
 * empty value is a caller error, not an empty result. The stateful mock
 * applies the same guard so production callers that forget to thread a
 * `tenant_id` fail in tests exactly as they would against the real service.
 *
 * @param {{tenant_id?: string}} obj
 * @returns {string} the validated tenant id
 */
function requireTenant(obj) {
  const tenant_id = obj?.tenant_id;
  if (typeof tenant_id !== "string" || tenant_id.length === 0) {
    throw Object.assign(new Error("tenant_id is required"), {
      code: grpc.status.INVALID_ARGUMENT,
    });
  }
  return tenant_id;
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
  const inbox = new Map();
  const inboxSeqs = new Map();

  return {
    SaveDiscussion: spy(async (req) => {
      const obj = req?.toJSON?.() ?? req;
      const tenant_id = requireTenant(obj);
      coerceInt64Fields(obj);
      // Tenant-scope the index key exactly like services/bridge:
      // `${channel}:${tenant_id}:${discussion_id}`. The record keeps its
      // tenant_id so cross-record RPCs can filter by it.
      records.set(`${obj.channel}:${tenant_id}:${obj.discussion_id}`, obj);
      return {};
    }),
    LoadDiscussion: spy(async (req) => {
      const obj = req?.toJSON?.() ?? req;
      const tenant_id = requireTenant(obj);
      const key = `${obj.channel}:${tenant_id}:${obj.discussion_id}`;
      const rec = records.get(key);
      if (!rec) throw notFound();
      return rec;
    }),
    LoadDiscussionByCorrelation: spy(async (req) => {
      const obj = req?.toJSON?.() ?? req;
      const tenant_id = requireTenant(obj);
      for (const rec of records.values()) {
        // Filter to the requesting tenant after the correlation scan so a
        // correlation owned by tenant A is invisible to tenant B.
        if (rec.tenant_id !== tenant_id) continue;
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
    ListOpenRecesses: spy(async (req) => {
      const obj = req?.toJSON?.() ?? req;
      const tenant_id = requireTenant(obj);
      const refs = [];
      for (const rec of records.values()) {
        if (rec.tenant_id !== tenant_id) continue;
        for (const [cid, rfc] of Object.entries(rec.open_rfcs ?? {}))
          if (typeof rfc.due_at === "number")
            refs.push({ correlation_id: cid, due_at: rfc.due_at, tenant_id });
      }
      return { refs };
    }),
    HasOrigin: spy(async (req) => {
      const obj = req?.toJSON?.() ?? req;
      const tenant_id = requireTenant(obj);
      return { exists: origins.has(`${tenant_id}:${obj.id}`) };
    }),
    RecordOrigin: spy(async (req) => {
      const obj = req?.toJSON?.() ?? req;
      const tenant_id = requireTenant(obj);
      // Tenant-scope the origin key so a comment id recorded by tenant A is
      // not seen as self-originated by tenant B.
      origins.set(`${tenant_id}:${obj.id}`, obj);
      return {};
    }),
    Sweep: spy(async (req) => {
      requireTenant(req?.toJSON?.() ?? req);
      return {
        evicted_discussions: 0,
        evicted_origins: 0,
        evicted_pending: 0,
      };
    }),
    PutPendingDispatch: spy(async (req) => {
      const obj = req?.toJSON?.() ?? req;
      const tenant_id = requireTenant(obj);
      const p = obj.pending ?? obj;
      pending.set(`${tenant_id}:${p.link_token}`, p);
      return {};
    }),
    ResolvePendingDispatch: spy(async (req) => {
      const obj = req?.toJSON?.() ?? req;
      const tenant_id = requireTenant(obj);
      const key = `${tenant_id}:${obj.link_token}`;
      const rec = pending.get(key);
      if (!rec) throw notFound();
      pending.delete(key);
      return rec;
    }),
    EnqueueInbox: spy(async (req) => {
      const obj = req?.toJSON?.() ?? req;
      const tenant_id = requireTenant(obj);
      const msg = obj.message ?? {};
      // Queue per (tenant_id, correlation_id) so two tenants never collide
      // on a shared correlation id.
      const seqKey = `${tenant_id}:${msg.correlation_id}`;
      const seq = (inboxSeqs.get(seqKey) ?? 0) + 1;
      inboxSeqs.set(seqKey, seq);
      inbox.set(`${seqKey}:${seq}`, {
        tenant_id,
        correlation_id: msg.correlation_id,
        seq,
        text: msg.text ?? "",
        author: msg.author ?? "",
        enqueued_at: msg.enqueued_at ?? 0,
      });
      return {};
    }),
    DrainInbox: spy(async (req) => {
      const obj = req?.toJSON?.() ?? req;
      const tenant_id = requireTenant(obj);
      const messages = [];
      for (const rec of inbox.values()) {
        if (
          rec.tenant_id === tenant_id &&
          rec.correlation_id === obj.correlation_id &&
          (rec.seq ?? 0) > (obj.since_seq ?? 0)
        ) {
          messages.push(rec);
        }
      }
      messages.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
      return { messages };
    }),
  };
}
