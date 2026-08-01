import { services } from "@forwardimpact/librpc";

const { TenancyBase } = services;

// The service returns this when no row matches a Resolve* request. The
// proto returns `Tenant` (non-nullable). So an empty message encodes
// "not found" in place of an error or null. `RegistryTenantResolver`
// in `libraries/libbridge` reads `t?.state === "active"` and surfaces
// `null` to its callers. The callback path uses `ResolveByTenantId`.
// Any future caller of that method must treat a response with no
// tenant_id as "no such tenant". It must not dereference the fields
// blindly.
const EMPTY_TENANT = {};

/**
 * Translate a `TenantStore` row to the wire `Tenant` message. The
 * store keys rows by `id`. The wire field is `tenant_id`.
 *
 * @param {object} row
 * @returns {object}
 */
function toWire(row) {
  return {
    tenant_id: row.id,
    channel: row.channel,
    channel_tenant_key: row.channel_tenant_key,
    repo: row.repo,
    state: row.state,
    created_at: row.created_at,
    last_active_at: row.last_active_at,
  };
}

/**
 * Tenant registry service. A thin RPC layer over `TenantStore`.
 *
 * `ResolveByChannelKey` and `ResolveByRepo` return only rows in
 * `state = "active"`. A lookup that matches no row returns an empty
 * `Tenant` message. The `RegistryTenantResolver` in
 * `libraries/libbridge` treats `state !== "active"` as "no active
 * tenant" and surfaces `null` to the caller. `ResolveByTenantId`
 * returns the row for any state. Callback verification can then
 * reject a mismatched tenant id without a state check first.
 *
 * @augments TenancyBase
 */
export class TenancyService extends TenancyBase {
  #tenants;

  /**
   * @param {object} config
   * @param {object} deps
   * @param {import("./tenant-store.js").TenantStore} deps.tenants
   */
  constructor(config, { tenants }) {
    super(config);
    if (!tenants) throw new Error("tenants store is required");
    this.#tenants = tenants;
  }

  /**
   * @param {{channel: string, key: string}} req
   * @returns {Promise<object>}
   */
  async ResolveByChannelKey({ channel, key }) {
    const row = await this.#tenants.resolveByChannelKey({
      channel,
      channel_tenant_key: key,
    });
    return row ? toWire(row) : EMPTY_TENANT;
  }

  /**
   * @param {{owner: string, name: string}} req
   * @returns {Promise<object>}
   */
  async ResolveByRepo({ owner, name }) {
    const row = await this.#tenants.resolveByRepo({ owner, name });
    return row ? toWire(row) : EMPTY_TENANT;
  }

  /**
   * @param {{tenant_id: string}} req
   * @returns {Promise<object>}
   */
  async ResolveByTenantId({ tenant_id }) {
    const row = await this.#tenants.resolveByTenantId(tenant_id);
    return row ? toWire(row) : EMPTY_TENANT;
  }

  /**
   * @param {{channel: string, channel_tenant_key: string, state: string}} req
   * @returns {Promise<object>}
   */
  async UpsertByChannelKey(req) {
    return toWire(await this.#tenants.upsertByChannelKey(req));
  }

  /**
   * @param {{installation_id: string, owner: string, name: string}} req
   * @returns {Promise<object>}
   */
  async UpsertByPair(req) {
    return toWire(await this.#tenants.upsertByPair(req));
  }

  /**
   * @param {{tenant_id: string, state: string}} req
   * @returns {Promise<object>}
   */
  async SetState(req) {
    const row = await this.#tenants.setState(req);
    return row ? toWire(row) : EMPTY_TENANT;
  }

  /**
   * @param {{tenant_id: string, repo: {owner: string, name: string}}} req
   * @returns {Promise<object>}
   */
  async SetRepo(req) {
    const row = await this.#tenants.setRepo(req);
    return row ? toWire(row) : EMPTY_TENANT;
  }

  /**
   * @returns {Promise<void>}
   */
  async shutdown() {
    await this.#tenants.shutdown();
  }
}
