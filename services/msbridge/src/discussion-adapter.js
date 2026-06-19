import grpc from "@grpc/grpc-js";
import { bridge } from "@forwardimpact/libtype";

const isNotFound = (err) => err?.code === grpc.status.NOT_FOUND;

const CHANNEL = "msteams";

/** Convert participant metadata objects to metadata_json strings before proto serialization. */
function deflateMetadata(ctx) {
  if (!ctx.participants?.length) return ctx;
  const out = {
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
  return out;
}

/** Parse metadata_json strings back to metadata objects after proto deserialization. */
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
 * gRPC-backed `DiscussionAdapter` for `services/msbridge`. Every request
 * carries a `tenant_id` resolved from the constructor-injected
 * `TenantResolver`: single-tenant deployments thread the literal
 * `"default"` (via `DefaultTenantResolver`), multi-tenant deployments
 * thread the registry-resolved tenant (via `RegistryTenantResolver`). The
 * adapter never omits the field — `services/bridge` rejects an empty
 * `tenant_id` with `INVALID_ARGUMENT`.
 */
export class DiscussionAdapter {
  #client;
  #tenantResolver;

  /**
   * @param {object} client - BridgeClient instance
   * @param {object} deps
   * @param {import("@forwardimpact/libbridge").TenantResolver} deps.tenantResolver
   */
  constructor(client, { tenantResolver } = {}) {
    if (!client) throw new Error("client is required");
    if (!tenantResolver) throw new Error("tenantResolver is required");
    this.#client = client;
    this.#tenantResolver = tenantResolver;
  }

  /**
   * Resolve the tenant id for a context record. Prefers a `tenant_id`
   * already bound on the context; otherwise resolves through the injected
   * resolver and binds the result back onto the context.
   *
   * @param {object} ctx
   * @returns {Promise<string>}
   */
  async #tenantForContext(ctx) {
    if (typeof ctx?.tenant_id === "string" && ctx.tenant_id) {
      return ctx.tenant_id;
    }
    const tenant = await this.#tenantResolver.resolve({
      channel: ctx.channel ?? CHANNEL,
      key: ctx.channel_tenant_key ?? ctx.channel ?? CHANNEL,
    });
    const tenant_id = tenant?.tenant_id;
    if (!tenant_id) throw new Error("tenant_unresolved");
    ctx.tenant_id = tenant_id;
    return tenant_id;
  }

  /**
   * Resolve the tenant id for a channel-scoped lookup with no context
   * record yet. Single-tenant resolvers ignore the key and return
   * `"default"`.
   *
   * @param {string} channel
   * @returns {Promise<string>}
   */
  async #tenantForChannel(channel) {
    const tenant = await this.#tenantResolver.resolve({
      channel,
      key: channel,
    });
    const tenant_id = tenant?.tenant_id;
    if (!tenant_id) throw new Error("tenant_unresolved");
    return tenant_id;
  }

  /**
   * Resolve a tenant by channel key, returning `null` instead of throwing
   * when none resolves. Used by cross-tenant rehydration paths
   * (`listOpenRecesses`, `loadByCorrelation`) where, in multi-tenant mode,
   * the channel is not itself a tenant key.
   *
   * @param {string} channel
   * @returns {Promise<string | null>}
   */
  async #optionalTenantForChannel(channel) {
    const tenant = await this.#tenantResolver.resolve({
      channel,
      key: channel,
    });
    return tenant?.tenant_id ?? null;
  }

  /**
   *
   */
  async loadByChannel(channel, id, tenantId) {
    try {
      const tenant_id = tenantId ?? (await this.#tenantForChannel(channel));
      const rec = await this.#client.LoadDiscussion(
        bridge.LoadDiscussionRequest.fromObject({
          channel,
          discussion_id: id,
          tenant_id,
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
  async loadByCorrelation(correlationId, tenantId) {
    try {
      const tenant_id =
        tenantId ?? (await this.#optionalTenantForChannel(CHANNEL));
      if (!tenant_id) return null;
      const rec = await this.#client.LoadDiscussionByCorrelation(
        bridge.LoadByCorrelationRequest.fromObject({
          correlation_id: correlationId,
          tenant_id,
        }),
      );
      return inflateMetadata(rec);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  /**
   * Rehydrate open recesses for the resolvable tenant. Single-tenant resolves
   * `default`; multi-tenant has no single tenant at startup, so the channel
   * key does not resolve and rearm returns no refs. This is a documented
   * hosted-mode limitation: multi-tenant `elapsed`-trigger recesses re-arm
   * lazily on the next inbound activity via `processInbound` rather than at
   * restart, because the registry exposes no cross-tenant recess enumeration.
   * See README § Documented limitation: multi-tenant elapsed-recess re-arm.
   */
  async listOpenRecesses() {
    const tenant_id = await this.#optionalTenantForChannel(CHANNEL);
    if (!tenant_id) return [];
    const { refs } = await this.#client.ListOpenRecesses(
      bridge.ListOpenRecessesRequest.fromObject({ tenant_id }),
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
    const tenant_id = await this.#tenantForContext(ctx);
    await this.#client.SaveDiscussion(
      bridge.Discussion.fromObject({ ...deflateMetadata(ctx), tenant_id }),
    );
  }

  /**
   *
   */
  async putPendingDispatch(target) {
    const { tenant_id: targetTenant, ...pending } = target;
    const tenant_id =
      targetTenant ??
      (await this.#tenantForChannel(pending.surface ?? CHANNEL));
    await this.#client.PutPendingDispatch(
      bridge.PutPendingDispatchRequest.fromObject({
        pending,
        tenant_id,
      }),
    );
  }

  /**
   *
   */
  async resolvePendingDispatch(linkToken, expectedSurfaceUserId) {
    try {
      const tenant_id = await this.#tenantForChannel(CHANNEL);
      return await this.#client.ResolvePendingDispatch(
        bridge.ResolvePendingDispatchRequest.fromObject({
          link_token: linkToken,
          tenant_id,
          expected_surface_user_id: expectedSurfaceUserId ?? undefined,
        }),
      );
    } catch (err) {
      if (isNotFound(err)) return null;
      if (err?.code === grpc.status.FAILED_PRECONDITION)
        return { unattributable: true };
      throw err;
    }
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
