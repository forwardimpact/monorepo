import crypto from "node:crypto";
import { BufferedIndex } from "@forwardimpact/libindex";

/**
 * Durable registry of channel-to-customer tenants.
 *
 * The store keys records by tenant id (UUID). Lookups by
 * `(channel, channel_tenant_key)` and by `repo` iterate the loaded
 * index. The number of installed customers sets the registry size. A
 * sequential scan suffices for the initial delivery.
 *
 * Lifecycle states:
 *
 * - `pending_consent` — The row records the Teams consent. The customer
 *   did not self-serve the repo mapping yet. `resolveByChannelKey` and
 *   `resolveByRepo` do not return the row.
 * - `active` — Resolvable. The bridges and `services/ghserver` mint
 *   against rows in this state.
 * - `revoked` — Terminal. `resolveByChannelKey` and `resolveByRepo` do
 *   not return the row. `resolveByTenantId` still returns it. Callback
 *   verification can then compare a request's `tenant_id` against any
 *   known tenant.
 *
 * @augments BufferedIndex
 */
export class TenantStore extends BufferedIndex {
  #clock;

  /**
   * @param {import("@forwardimpact/libstorage").StorageInterface} storage
   * @param {object} [options]
   * @param {string} [options.indexKey] - Override the JSONL filename.
   * @param {import("@forwardimpact/libutil/runtime").Runtime["clock"]} options.clock
   *   The caller injects this clock collaborator. It drives the
   *   `created_at` and `last_active_at` timestamps. Tests can then use
   *   a virtual clock.
   */
  constructor(storage, { indexKey = "tenants.jsonl", clock } = {}) {
    if (!clock) throw new Error("clock is required");
    super(
      storage,
      indexKey,
      { flush_interval: 5_000, max_buffer_size: 100 },
      { clock },
    );
    this.#clock = clock;
  }

  /**
   * @returns {Promise<void>}
   */
  async loadData() {
    await super.loadData();
    for (const [id, record] of this.index) {
      if (record.deleted) this.index.delete(id);
    }
  }

  /**
   * @param {{channel: string, channel_tenant_key: string}} key
   * @returns {Promise<object|null>}
   */
  async resolveByChannelKey({ channel, channel_tenant_key }) {
    if (!this.loaded) await this.loadData();
    for (const row of this.index.values()) {
      if (
        row.channel === channel &&
        row.channel_tenant_key === channel_tenant_key &&
        row.state === "active"
      ) {
        return row;
      }
    }
    return null;
  }

  /**
   * @param {{owner: string, name: string}} repo
   * @returns {Promise<object|null>}
   */
  async resolveByRepo({ owner, name }) {
    if (!this.loaded) await this.loadData();
    for (const row of this.index.values()) {
      if (
        row.repo?.owner === owner &&
        row.repo?.name === name &&
        row.state === "active"
      ) {
        return row;
      }
    }
    return null;
  }

  /**
   * @param {string} tenant_id
   * @returns {Promise<object|null>}
   */
  async resolveByTenantId(tenant_id) {
    if (!this.loaded) await this.loadData();
    return this.index.get(tenant_id) ?? null;
  }

  /**
   * Create or update a row keyed by `(channel, channel_tenant_key)`.
   * The Teams consent handler (part 05) drives this path. An
   * `installationUpdate` event inserts a fresh `pending_consent` row.
   * A re-consent re-upserts the row and keeps `created_at`.
   *
   * @param {{channel: string, channel_tenant_key: string, state: string}} req
   * @returns {Promise<object>}
   */
  async upsertByChannelKey({ channel, channel_tenant_key, state }) {
    if (!this.loaded) await this.loadData();
    const existing = await this.#findByChannelKey(channel, channel_tenant_key);
    if (existing) {
      const updated = {
        ...existing,
        state,
        last_active_at: this.#clock.now(),
      };
      await this.add(updated);
      return updated;
    }
    const id = crypto.randomUUID();
    const now = this.#clock.now();
    const row = {
      id,
      channel,
      channel_tenant_key,
      state,
      created_at: now,
      last_active_at: now,
    };
    await this.add(row);
    return row;
  }

  /**
   * Upsert a GitHub install row keyed by `(installation_id, owner/name)`.
   * The GitHub install handler (part 05) drives this path. Every repo
   * in an `installation.created` or `repositories_added` event
   * produces one row. This path is idempotent when the same event
   * arrives again.
   *
   * @param {{installation_id: string, owner: string, name: string}} req
   * @returns {Promise<object>}
   */
  async upsertByPair({ installation_id, owner, name }) {
    if (!this.loaded) await this.loadData();
    const channel = "github-discussions";
    const channel_tenant_key = `${installation_id}:${owner}/${name}`;
    const existing = await this.#findByChannelKey(channel, channel_tenant_key);
    if (existing) {
      const updated = {
        ...existing,
        state: "active",
        repo: { owner, name },
        last_active_at: this.#clock.now(),
      };
      await this.add(updated);
      return updated;
    }
    const id = crypto.randomUUID();
    const now = this.#clock.now();
    const row = {
      id,
      channel,
      channel_tenant_key,
      repo: { owner, name },
      state: "active",
      created_at: now,
      last_active_at: now,
    };
    await this.add(row);
    return row;
  }

  /**
   * @param {{tenant_id: string, state: string}} req
   * @returns {Promise<object|null>}
   */
  async setState({ tenant_id, state }) {
    if (!this.loaded) await this.loadData();
    const row = this.index.get(tenant_id);
    if (!row) return null;
    const updated = { ...row, state, last_active_at: this.#clock.now() };
    await this.add(updated);
    return updated;
  }

  /**
   * @param {{tenant_id: string, repo: {owner: string, name: string}}} req
   * @returns {Promise<object|null>}
   */
  async setRepo({ tenant_id, repo }) {
    if (!this.loaded) await this.loadData();
    const row = this.index.get(tenant_id);
    if (!row) return null;
    const updated = { ...row, repo, last_active_at: this.#clock.now() };
    await this.add(updated);
    return updated;
  }

  async #findByChannelKey(channel, channel_tenant_key) {
    for (const row of this.index.values()) {
      if (
        row.channel === channel &&
        row.channel_tenant_key === channel_tenant_key
      ) {
        return row;
      }
    }
    return null;
  }
}
