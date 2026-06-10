import { BufferedIndex } from "@forwardimpact/libindex";
import { services } from "@forwardimpact/librpc";
import grpc from "@grpc/grpc-js";
import { bridge } from "@forwardimpact/libtype";

const { BridgeBase } = services;

/**
 * Reject a request that omits `tenant_id`. Every bridge RPC carries a
 * `tenant_id` in both deployment modes (single-tenant binds the literal
 * `"default"`); an empty value is a caller error, not an empty result.
 *
 * @param {{tenant_id?: string}} req
 * @returns {string} the validated tenant id
 */
function requireTenant(req) {
  const tenant_id = req?.tenant_id;
  if (typeof tenant_id !== "string" || tenant_id.length === 0) {
    throw Object.assign(new Error("tenant_id is required"), {
      code: grpc.status.INVALID_ARGUMENT,
    });
  }
  return tenant_id;
}

/**
 *
 */
export class BridgeService extends BridgeBase {
  #discussions;
  #origins;
  #pendingDispatches;
  #claimedDispatches;
  #inbox;
  #inboxSeqs;
  #conversationTtlMs;
  #originTtlMs;
  #pendingTtlMs;
  #sweepTimer;
  #clock;

  /**
   * @param {object} config
   * @param {object} deps
   * @param {object} deps.storage
   * @param {object} deps.logger
   * @param {object} [deps.tracer]
   * @param {import("@forwardimpact/libutil/runtime").Runtime["clock"]} deps.clock
   *   Injected clock collaborator (`now`/`setInterval`/`clearInterval`).
   */
  constructor(config, { storage, logger, tracer, clock }) {
    super(config);
    if (!clock) throw new Error("clock is required");
    this.#clock = clock;
    this.#discussions = new BufferedIndex(
      storage,
      "discussions.jsonl",
      {
        flush_interval: config.discussion_flush_interval_ms,
        max_buffer_size: config.discussion_max_buffer_size,
      },
      { clock: this.#clock },
    );
    this.#origins = new BufferedIndex(
      storage,
      "origins.jsonl",
      {
        flush_interval: config.origin_flush_interval_ms,
        max_buffer_size: config.origin_max_buffer_size,
      },
      { clock: this.#clock },
    );
    this.#pendingDispatches = new BufferedIndex(
      storage,
      "pending_dispatches.jsonl",
      {
        flush_interval: config.pending_flush_interval_ms ?? 1_000,
        max_buffer_size: 100,
      },
      { clock: this.#clock },
    );
    this.#claimedDispatches = new BufferedIndex(
      storage,
      "claimed_dispatches.jsonl",
      {
        flush_interval: config.pending_flush_interval_ms ?? 1_000,
        max_buffer_size: 100,
      },
      { clock: this.#clock },
    );
    this.#inbox = new BufferedIndex(
      storage,
      "inbox.jsonl",
      {
        flush_interval: config.discussion_flush_interval_ms,
        max_buffer_size: config.discussion_max_buffer_size,
      },
      { clock: this.#clock },
    );
    this.#inboxSeqs = new Map();
    this.#conversationTtlMs = config.conversation_ttl_ms;
    this.#originTtlMs = config.origin_ttl_ms;
    this.#pendingTtlMs = config.pending_ttl_ms ?? 10 * 60 * 1000;
    this.#sweepTimer = this.#clock.setInterval(() => {
      this.#sweep(this.#clock.now()).catch((e) => logger.error?.("sweep", e));
    }, config.sweep_interval_ms);
    this.#sweepTimer.unref();
  }

  /**
   *
   */
  async LoadDiscussion(req) {
    const tenant_id = requireTenant(req);
    await this.#discussions.loadData();
    const rec = this.#discussions.index.get(
      `${req.channel}:${tenant_id}:${req.discussion_id}`,
    );
    if (!rec)
      throw Object.assign(new Error("not found"), {
        code: grpc.status.NOT_FOUND,
      });
    return bridge.Discussion.fromObject(rec);
  }

  /**
   *
   */
  async LoadDiscussionByCorrelation(req) {
    const tenant_id = requireTenant(req);
    await this.#discussions.loadData();
    for (const rec of this.#discussions.index.values()) {
      // Records are scanned by correlation_id; the tenant filter is applied
      // after the scan so a correlation owned by tenant A is invisible to B.
      if (rec.tenant_id !== tenant_id) continue;
      if (
        Object.values(rec.pending_callbacks ?? {}).includes(
          req.correlation_id,
        ) ||
        rec.open_rfcs?.[req.correlation_id]
      ) {
        return bridge.Discussion.fromObject(rec);
      }
    }
    throw Object.assign(new Error("not found"), {
      code: grpc.status.NOT_FOUND,
    });
  }

  /**
   *
   */
  async ListOpenRecesses(req) {
    const tenant_id = requireTenant(req);
    await this.#discussions.loadData();
    const refs = [];
    for (const rec of this.#discussions.index.values()) {
      if (rec.tenant_id !== tenant_id) continue;
      for (const [cid, rfc] of Object.entries(rec.open_rfcs ?? {})) {
        if (typeof rfc.due_at === "number") {
          refs.push({ correlation_id: cid, due_at: rfc.due_at, tenant_id });
        }
      }
    }
    return { refs };
  }

  /**
   *
   */
  async SaveDiscussion(req) {
    const tenant_id = requireTenant(req);
    // Tenant-scope the index key in every mode. Single-tenant emits
    // `${channel}:default:${discussion_id}`; the record's own `id` field is
    // overridden so the Map key isolates per (channel, tenant, discussion).
    await this.#discussions.add({
      ...req,
      id: `${req.channel}:${tenant_id}:${req.discussion_id}`,
    });
    return {};
  }

  /**
   *
   */
  async HasOrigin(req) {
    const tenant_id = requireTenant(req);
    return { exists: await this.#origins.has(`${tenant_id}:${req.id}`) };
  }

  /**
   *
   */
  async RecordOrigin(req) {
    const tenant_id = requireTenant(req);
    // Tenant-scope the origin key so a comment id recorded by tenant A is
    // not seen as self-originated by tenant B.
    await this.#origins.add({ ...req, id: `${tenant_id}:${req.id}` });
    return {};
  }

  /** Append a message to the per-correlation inbox. Assigns a monotonic seq. */
  async EnqueueInbox(req) {
    const tenant_id = requireTenant(req);
    const msg = req.message;
    if (!msg?.correlation_id) {
      throw Object.assign(new Error("correlation_id is required"), {
        code: grpc.status.INVALID_ARGUMENT,
      });
    }
    // Queue per (tenant_id, correlation_id) so two tenants never collide on
    // a shared correlation id.
    const seqKey = `${tenant_id}:${msg.correlation_id}`;
    const seq = (this.#inboxSeqs.get(seqKey) ?? 0) + 1;
    this.#inboxSeqs.set(seqKey, seq);
    const entry = {
      id: `${seqKey}:${seq}`,
      tenant_id,
      correlation_id: msg.correlation_id,
      seq,
      text: msg.text ?? "",
      author: msg.author ?? "",
      enqueued_at: msg.enqueued_at ?? this.#clock.now(),
    };
    await this.#inbox.add(entry);
    await this.#inbox.flush();
    return {};
  }

  /** Return inbox messages with seq > since_seq. Non-destructive — entries persist until sweep. */
  async DrainInbox(req) {
    const tenant_id = requireTenant(req);
    await this.#inbox.loadData();
    const messages = [];
    for (const rec of this.#inbox.index.values()) {
      if (
        rec.tenant_id === tenant_id &&
        rec.correlation_id === req.correlation_id &&
        (rec.seq ?? 0) > (req.since_seq ?? 0)
      ) {
        messages.push(rec);
      }
    }
    messages.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    return { messages };
  }

  /**
   *
   */
  async PutPendingDispatch(req) {
    const tenant_id = requireTenant(req);
    const p = req.pending;
    await this.#pendingDispatches.add({
      id: `${tenant_id}:${p.link_token}`,
      tenant_id,
      link_token: p.link_token,
      surface: p.surface,
      surface_user_id: p.surface_user_id,
      discussion_id: p.discussion_id,
      created_at: Number(p.created_at) || this.#clock.now(),
    });
    return {};
  }

  /**
   *
   */
  async ResolvePendingDispatch(req) {
    const tenant_id = requireTenant(req);
    const scopedKey = `${tenant_id}:${req.link_token}`;
    await this.#pendingDispatches.loadData();
    const rec = this.#pendingDispatches.index.get(scopedKey);
    if (!rec)
      throw Object.assign(new Error("not found"), {
        code: grpc.status.NOT_FOUND,
      });
    // Server-side surface-user-id gate: when the caller asserts which user
    // should own the entry, refuse to consume on mismatch. Closes the
    // pre-consume window the libbridge handler would otherwise open if it
    // did the cross-check client-side after the destructive resolve.
    if (
      req.expected_surface_user_id != null &&
      req.expected_surface_user_id !== "" &&
      rec.surface_user_id !== req.expected_surface_user_id
    ) {
      throw Object.assign(new Error("surface_user_id mismatch"), {
        code: grpc.status.FAILED_PRECONDITION,
      });
    }
    this.#pendingDispatches.index.delete(scopedKey);
    // compact() writes the new index via storage.put, which is a write-tmp
    // + atomic rename inside libstorage. A process kill mid-compact leaves
    // the index at either its prior or new state. Concurrent-writer
    // correctness for a multi-instance future remains out of scope —
    // bridge runs single-instance per tenant; gRPC handlers serialise on
    // the event loop, so compact() and add() never interleave inside one
    // process.
    await this.#pendingDispatches.compact();
    return bridge.PendingDispatch.fromObject({
      link_token: rec.link_token ?? req.link_token,
      surface: rec.surface,
      surface_user_id: rec.surface_user_id,
      discussion_id: rec.discussion_id,
      created_at: rec.created_at,
    });
  }

  /**
   * Verify a pending dispatch and record a single-use claim of its
   * `link_token`. Cross-validates `(expected_surface,
   * expected_surface_user_id)` against the pending entry keyed by
   * `(tenant_id, link_token)`. The first OK response appends to
   * `claimed_dispatches.jsonl`; subsequent verifies for the same
   * `link_token` fail closed with `FAILED_PRECONDITION`.
   *
   * Concurrency: services/bridge runs single-instance per tenant; gRPC
   * handlers serialise on the event loop. Once both handler calls return
   * from `await loadData()`, the synchronous `has` check and `add` body
   * (which `index.set`s before yielding) run within one microtask each, so
   * a second resumer always observes the first resumer's set.
   */
  async VerifyPendingDispatch(req) {
    const tenant_id = requireTenant(req);
    const scopedKey = `${tenant_id}:${req.link_token}`;
    await this.#pendingDispatches.loadData();
    await this.#claimedDispatches.loadData();
    const rec = this.#pendingDispatches.index.get(scopedKey);
    if (!rec)
      throw Object.assign(new Error("not found"), {
        code: grpc.status.NOT_FOUND,
      });
    if (
      rec.surface !== req.expected_surface ||
      rec.surface_user_id !== req.expected_surface_user_id
    )
      throw Object.assign(new Error("surface or surface_user_id mismatch"), {
        code: grpc.status.FAILED_PRECONDITION,
      });
    if (this.#claimedDispatches.index.has(scopedKey))
      throw Object.assign(new Error("already claimed"), {
        code: grpc.status.FAILED_PRECONDITION,
      });
    await this.#claimedDispatches.add({
      id: scopedKey,
      tenant_id,
      link_token: req.link_token,
      claimed_at: this.#clock.now(),
    });
    await this.#claimedDispatches.flush();
    return {};
  }

  /**
   *
   */
  async Sweep(req) {
    const tenant_id = requireTenant(req);
    const now = req.now ?? this.#clock.now();
    // The RPC-invoked sweep is restricted to the requesting tenant's records;
    // the periodic background sweep (driven by the timer) passes no tenant and
    // evicts stale records across every tenant.
    const { evicted_discussions, evicted_origins, evicted_pending } =
      await this.#sweep(now, tenant_id);
    return { evicted_discussions, evicted_origins, evicted_pending };
  }

  #sweepIndex(index, now, isStale) {
    let evicted = 0;
    for (const [key, rec] of index) {
      if (isStale(rec, now)) {
        index.delete(key);
        evicted++;
      }
    }
    return evicted;
  }

  async #sweep(now, tenant_id) {
    await this.#discussions.loadData();
    await this.#origins.loadData();
    await this.#pendingDispatches.loadData();
    await this.#inbox.loadData();

    const inTenant = (rec) =>
      tenant_id === undefined || rec.tenant_id === tenant_id;

    const evicted_discussions = this.#sweepIndex(
      this.#discussions.index,
      now,
      (rec) =>
        inTenant(rec) &&
        now - (rec.last_active_at ?? 0) > this.#conversationTtlMs,
    );
    const evicted_origins = this.#sweepIndex(
      this.#origins.index,
      now,
      (rec) => inTenant(rec) && now - (rec.posted_at ?? 0) > this.#originTtlMs,
    );
    const evicted_pending = this.#sweepIndex(
      this.#pendingDispatches.index,
      now,
      (rec) =>
        inTenant(rec) && now - (rec.created_at ?? 0) > this.#pendingTtlMs,
    );

    let evictedInbox = 0;
    for (const [key, rec] of this.#inbox.index) {
      if (
        inTenant(rec) &&
        now - (rec.enqueued_at ?? 0) > this.#conversationTtlMs
      ) {
        this.#inbox.index.delete(key);
        evictedInbox++;
      }
    }

    if (evicted_discussions > 0) await this.#discussions.flush();
    if (evicted_origins > 0) await this.#origins.flush();
    // Same write-tmp + atomic rename guarantee inside libstorage as the
    // ResolvePendingDispatch compact() call site above.
    if (evicted_pending > 0) await this.#pendingDispatches.compact();
    if (evictedInbox > 0) await this.#inbox.flush();

    return { evicted_discussions, evicted_origins, evicted_pending };
  }

  /**
   *
   */
  async shutdown() {
    this.#clock.clearInterval(this.#sweepTimer);
    await Promise.all([
      this.#discussions.flush(),
      this.#origins.flush(),
      this.#pendingDispatches.flush(),
      this.#claimedDispatches.flush(),
      this.#inbox.flush(),
    ]);
  }
}
