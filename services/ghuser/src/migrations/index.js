import { BufferedIndex } from "@forwardimpact/libindex";

/**
 * Ledger of run data migrations. Separate namespace from `bindings.jsonl`
 * — prevents collision with `BindingStore.keyOf("surface:userId")`
 * (design § Migration marker location). `has(id)` and lazy load inherit
 * from `IndexBase`; `record` pairs `add` with an explicit `flush` so the
 * marker is durable before boot proceeds.
 * @augments BufferedIndex
 */
export class MigrationLedger extends BufferedIndex {
  /**
   * @param {import("@forwardimpact/libstorage").StorageInterface} storage
   * @param {object} [options]
   * @param {import("@forwardimpact/libutil/runtime").Runtime["clock"]} options.clock
   */
  constructor(storage, { clock } = {}) {
    super(
      storage,
      "migrations.jsonl",
      { flush_interval: 1_000, max_buffer_size: 10 },
      { clock },
    );
  }

  /**
   * @param {string} id - Migration identifier
   * @param {number} now - Timestamp from injected clock
   * @returns {Promise<void>}
   */
  async record(id, now) {
    await this.add({ id, ran_at: now });
    await this.flush();
  }
}
