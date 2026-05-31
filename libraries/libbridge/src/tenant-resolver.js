/**
 * Channel-agnostic tenant resolution.
 *
 * Bridges supply a resolver to libbridge primitives (`Dispatcher`,
 * `CallbackRegistry`, callback handlers). The two implementations share a
 * duck-typed surface — `resolve`, `resolveByRepo`, `resolveByTenantId` —
 * so libbridge depends on the shape, not the implementation.
 *
 * @typedef {object} Tenant
 * @property {string} tenant_id
 * @property {string} channel
 * @property {string} channel_tenant_key
 * @property {{owner: string, name: string}} [repo]
 * @property {"pending_consent" | "active" | "revoked"} state
 *
 * @typedef {object} TenantResolver
 * @property {(key: {channel: string, key: string}) => Promise<Tenant | null>} resolve
 * @property {(repo: {owner: string, name: string}) => Promise<Tenant | null>} resolveByRepo
 * @property {(key: {tenant_id: string}) => Promise<Tenant | null>} resolveByTenantId
 */

/**
 * Single-tenant resolver. Returns one fixed `default` tenant for every
 * resolution call. Used in single-tenant deployments where the bridge does
 * not reach `services/tenancy`.
 */
export class DefaultTenantResolver {
  #default;

  /**
   * @param {object} options
   * @param {string} options.channel
   * @param {string} [options.channel_tenant_key]
   * @param {{owner: string, name: string}} [options.repo]
   */
  constructor({ channel, channel_tenant_key = "default", repo }) {
    if (!channel) throw new Error("channel is required");
    this.#default = {
      tenant_id: "default",
      channel,
      channel_tenant_key,
      repo,
      state: "active",
    };
  }

  /** @returns {Promise<Tenant>} */
  async resolve(_key) {
    return this.#default;
  }

  /** @returns {Promise<Tenant>} */
  async resolveByRepo(_repo) {
    return this.#default;
  }

  /** @returns {Promise<Tenant | null>} */
  async resolveByTenantId({ tenant_id }) {
    return tenant_id === "default" ? this.#default : null;
  }
}

/**
 * Multi-tenant resolver. Wraps a `services/tenancy` gRPC client; returns
 * only `active` tenants from `resolve` and `resolveByRepo` (callers must
 * treat a `null` return as "no active tenant"). `resolveByTenantId` returns
 * the registry row regardless of state so callback verification can compare
 * the URL's tenant id against any known tenant.
 */
export class RegistryTenantResolver {
  #client;

  /**
   * @param {object} options
   * @param {{
   *   ResolveByChannelKey: (req: {channel: string, key: string}) => Promise<Tenant | null>,
   *   ResolveByRepo: (req: {owner: string, name: string}) => Promise<Tenant | null>,
   *   ResolveByTenantId: (req: {tenant_id: string}) => Promise<Tenant | null>,
   * }} options.client - Duck-typed tenancy client (typed at construction)
   */
  constructor({ client }) {
    if (!client) throw new Error("client is required");
    this.#client = client;
  }

  /** @returns {Promise<Tenant | null>} */
  async resolve({ channel, key }) {
    const t = await this.#client.ResolveByChannelKey({ channel, key });
    return t?.state === "active" ? t : null;
  }

  /** @returns {Promise<Tenant | null>} */
  async resolveByRepo({ owner, name }) {
    const t = await this.#client.ResolveByRepo({ owner, name });
    return t?.state === "active" ? t : null;
  }

  /** @returns {Promise<Tenant | null>} */
  async resolveByTenantId({ tenant_id }) {
    return this.#client.ResolveByTenantId({ tenant_id });
  }
}
