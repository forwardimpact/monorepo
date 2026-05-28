import grpc from "@grpc/grpc-js";
import { common, bridge } from "@forwardimpact/libtype";

const isNotFound = (err) => err?.code === grpc.status.NOT_FOUND;

function deflateMetadata(ctx) {
  if (!ctx.participants?.length) return ctx;
  return {
    ...ctx,
    participants: ctx.participants.map((p) => {
      if (p.metadata == null) return p;
      return {
        ...p,
        metadata_json: JSON.stringify(p.metadata),
        metadata: undefined,
      };
    }),
  };
}

function inflateMetadata(rec) {
  if (!rec?.participants?.length) return rec;
  for (const p of rec.participants) {
    if (p.metadata_json) {
      try {
        p.metadata = JSON.parse(p.metadata_json);
      } catch {}
    }
  }
  return rec;
}

/**
 *
 */
export class DiscussionAdapter {
  #client;
  /**
   *
   */
  constructor(client) {
    this.#client = client;
  }

  /**
   *
   */
  async loadByChannel(channel, id) {
    try {
      const rec = await this.#client.LoadDiscussion(
        bridge.LoadDiscussionRequest.fromObject({
          channel,
          discussion_id: id,
        }),
      );
      return inflateMetadata(rec);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  /**
   *
   */
  async loadByCorrelation(correlationId) {
    try {
      const rec = await this.#client.LoadDiscussionByCorrelation(
        bridge.LoadByCorrelationRequest.fromObject({
          correlation_id: correlationId,
        }),
      );
      return inflateMetadata(rec);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  /**
   *
   */
  async listOpenRecesses() {
    const { refs } = await this.#client.ListOpenRecesses(
      common.Empty.fromObject({}),
    );
    return refs.map((r) => ({
      correlationId: r.correlation_id,
      dueAt: r.due_at,
    }));
  }

  /**
   *
   */
  async add(ctx) {
    await this.#client.SaveDiscussion(
      bridge.Discussion.fromObject(deflateMetadata(ctx)),
    );
  }

  /**
   *
   */
  async flush() {}
  /**
   *
   */
  async shutdown() {}
}
