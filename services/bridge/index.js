import { BufferedIndex } from "@forwardimpact/libindex";
import { services } from "@forwardimpact/librpc";
import grpc from "@grpc/grpc-js";
import { bridge } from "@forwardimpact/libtype";

const { BridgeBase } = services;

/**
 *
 */
export class BridgeService extends BridgeBase {
  #discussions;
  #origins;
  #pendingDispatches;
  #inbox;
  #inboxSeqs;
  #conversationTtlMs;
  #originTtlMs;
  #pendingTtlMs;
  #sweepTimer;

  /**
   *
   */
  constructor(config, { storage, logger, tracer }) {
    super(config);
    this.#discussions = new BufferedIndex(storage, "discussions.jsonl", {
      flush_interval: config.discussion_flush_interval_ms,
      max_buffer_size: config.discussion_max_buffer_size,
    });
    this.#origins = new BufferedIndex(storage, "origins.jsonl", {
      flush_interval: config.origin_flush_interval_ms,
      max_buffer_size: config.origin_max_buffer_size,
    });
    this.#pendingDispatches = new BufferedIndex(
      storage,
      "pending_dispatches.jsonl",
      {
        flush_interval: config.pending_flush_interval_ms ?? 1_000,
        max_buffer_size: 100,
      },
    );
    this.#inbox = new BufferedIndex(storage, "inbox.jsonl", {
      flush_interval: config.discussion_flush_interval_ms,
      max_buffer_size: config.discussion_max_buffer_size,
    });
    this.#inboxSeqs = new Map();
    this.#conversationTtlMs = config.conversation_ttl_ms;
    this.#originTtlMs = config.origin_ttl_ms;
    this.#pendingTtlMs = config.pending_ttl_ms ?? 10 * 60 * 1000;
    this.#sweepTimer = setInterval(() => {
      this.#sweep(Date.now()).catch((e) => logger.error?.("sweep", e));
    }, config.sweep_interval_ms);
    this.#sweepTimer.unref();
  }

  /**
   *
   */
  async LoadDiscussion(req) {
    await this.#discussions.loadData();
    const rec = this.#discussions.index.get(
      `${req.channel}:${req.discussion_id}`,
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
    await this.#discussions.loadData();
    for (const rec of this.#discussions.index.values()) {
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
  async ListOpenRecesses(_req) {
    await this.#discussions.loadData();
    const refs = [];
    for (const rec of this.#discussions.index.values()) {
      for (const [cid, rfc] of Object.entries(rec.open_rfcs ?? {})) {
        if (typeof rfc.due_at === "number") {
          refs.push({ correlation_id: cid, due_at: rfc.due_at });
        }
      }
    }
    return { refs };
  }

  /**
   *
   */
  async SaveDiscussion(req) {
    await this.#discussions.add(req);
    return {};
  }

  /**
   *
   */
  async HasOrigin(req) {
    return { exists: await this.#origins.has(req.id) };
  }

  /**
   *
   */
  async RecordOrigin(req) {
    await this.#origins.add(req);
    return {};
  }

  /** Append a message to the per-correlation inbox. Assigns a monotonic seq. */
  async EnqueueInbox(req) {
    const msg = req.message;
    if (!msg?.correlation_id) {
      throw Object.assign(new Error("correlation_id is required"), {
        code: grpc.status.INVALID_ARGUMENT,
      });
    }
    const seq = (this.#inboxSeqs.get(msg.correlation_id) ?? 0) + 1;
    this.#inboxSeqs.set(msg.correlation_id, seq);
    const entry = {
      id: `${msg.correlation_id}:${seq}`,
      correlation_id: msg.correlation_id,
      seq,
      text: msg.text ?? "",
      author: msg.author ?? "",
      enqueued_at: msg.enqueued_at ?? Date.now(),
    };
    await this.#inbox.add(entry);
    await this.#inbox.flush();
    return {};
  }

  /** Return inbox messages with seq > since_seq. Non-destructive — entries persist until sweep. */
  async DrainInbox(req) {
    await this.#inbox.loadData();
    const messages = [];
    for (const rec of this.#inbox.index.values()) {
      if (
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
    const p = req.pending;
    await this.#pendingDispatches.add({
      id: p.link_token,
      surface: p.surface,
      surface_user_id: p.surface_user_id,
      discussion_id: p.discussion_id,
      created_at: Number(p.created_at) || Date.now(),
    });
    return {};
  }

  /**
   *
   */
  async ResolvePendingDispatch(req) {
    await this.#pendingDispatches.loadData();
    const stale = [];
    for (const [id, rec] of this.#pendingDispatches.index) {
      if (rec.deleted) stale.push(id);
    }
    for (const id of stale) this.#pendingDispatches.index.delete(id);
    const rec = this.#pendingDispatches.index.get(req.link_token);
    if (!rec)
      throw Object.assign(new Error("not found"), {
        code: grpc.status.NOT_FOUND,
      });
    this.#pendingDispatches.index.delete(req.link_token);
    await this.#pendingDispatches.add({ id: req.link_token, deleted: true });
    return bridge.PendingDispatch.fromObject({
      link_token: rec.id,
      surface: rec.surface,
      surface_user_id: rec.surface_user_id,
      discussion_id: rec.discussion_id,
      created_at: rec.created_at,
    });
  }

  /**
   *
   */
  async Sweep(req) {
    const now = req.now ?? Date.now();
    const { evicted_discussions, evicted_origins, evicted_pending } =
      await this.#sweep(now);
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

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: three-index sweep with eviction and flush
  async #sweep(now) {
    await this.#discussions.loadData();
    await this.#origins.loadData();
    await this.#pendingDispatches.loadData();
    await this.#inbox.loadData();

    const evicted_discussions = this.#sweepIndex(
      this.#discussions.index,
      now,
      (rec) => now - (rec.last_active_at ?? 0) > this.#conversationTtlMs,
    );
    const evicted_origins = this.#sweepIndex(
      this.#origins.index,
      now,
      (rec) => now - (rec.posted_at ?? 0) > this.#originTtlMs,
    );
    const evicted_pending = this.#sweepIndex(
      this.#pendingDispatches.index,
      now,
      (rec) => rec.deleted || now - (rec.created_at ?? 0) > this.#pendingTtlMs,
    );

    let evictedInbox = 0;
    for (const [key, rec] of this.#inbox.index) {
      if (now - (rec.enqueued_at ?? 0) > this.#conversationTtlMs) {
        this.#inbox.index.delete(key);
        evictedInbox++;
      }
    }

    if (evicted_discussions > 0) await this.#discussions.flush();
    if (evicted_origins > 0) await this.#origins.flush();
    if (evicted_pending > 0) await this.#pendingDispatches.flush();
    if (evictedInbox > 0) await this.#inbox.flush();

    return { evicted_discussions, evicted_origins, evicted_pending };
  }

  /**
   *
   */
  async shutdown() {
    clearInterval(this.#sweepTimer);
    await Promise.all([
      this.#discussions.flush(),
      this.#origins.flush(),
      this.#pendingDispatches.flush(),
      this.#inbox.flush(),
    ]);
  }
}
