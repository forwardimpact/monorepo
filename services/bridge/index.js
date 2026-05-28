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
  #conversationTtlMs;
  #originTtlMs;
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
    this.#conversationTtlMs = config.conversation_ttl_ms;
    this.#originTtlMs = config.origin_ttl_ms;
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

  /**
   *
   */
  async Sweep(req) {
    const now = req.now ?? Date.now();
    const { evicted_discussions, evicted_origins } = await this.#sweep(now);
    return { evicted_discussions, evicted_origins };
  }

  async #sweep(now) {
    await this.#discussions.loadData();
    await this.#origins.loadData();

    let evicted_discussions = 0;
    for (const [key, rec] of this.#discussions.index) {
      if (now - (rec.last_active_at ?? 0) > this.#conversationTtlMs) {
        this.#discussions.index.delete(key);
        evicted_discussions++;
      }
    }

    let evicted_origins = 0;
    for (const [key, rec] of this.#origins.index) {
      if (now - (rec.posted_at ?? 0) > this.#originTtlMs) {
        this.#origins.index.delete(key);
        evicted_origins++;
      }
    }

    if (evicted_discussions > 0) await this.#discussions.flush();
    if (evicted_origins > 0) await this.#origins.flush();

    return { evicted_discussions, evicted_origins };
  }

  /**
   *
   */
  async shutdown() {
    clearInterval(this.#sweepTimer);
    await Promise.all([this.#discussions.flush(), this.#origins.flush()]);
  }
}
