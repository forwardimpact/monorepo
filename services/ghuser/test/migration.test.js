import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockClock } from "@forwardimpact/libmock";
import { createMockStorage } from "@forwardimpact/libmock/mock";
import { BindingStore } from "../src/stores.js";
import { MigrationLedger } from "../src/migrations/index.js";
import { dropPreFixBridgeProofBindings } from "../src/migrations/drop-pre-fix-bridge-proof-bindings.js";

function setup() {
  const storage = createMockStorage();
  const clock = createMockClock({ start: Date.now() });
  const bindings = new BindingStore(storage, { clock });
  const migrations = new MigrationLedger(storage, { clock });
  return { storage, clock, bindings, migrations };
}

async function seedBinding(bindings, surface, userId, githubId) {
  await bindings.upsert({
    id: BindingStore.keyOf(surface, userId),
    github_user_id: githubId,
    access_token: `ghu_${githubId}`,
    refresh_token: null,
    expires_at: null,
    scopes: [],
  });
}

describe("ghuser migration — drop pre-fix bridge-proof bindings", () => {
  test("drops every non-github-discussions binding on first boot", async () => {
    const { storage, bindings, migrations, clock } = setup();
    await seedBinding(bindings, "msteams", "aad-A", "attacker-A");
    await seedBinding(bindings, "msteams", "aad-B", "attacker-B");
    await seedBinding(bindings, "github-discussions", "42", "42");
    await bindings.flush();

    const result = await dropPreFixBridgeProofBindings({
      bindings,
      migrations,
      clock,
    });

    assert.strictEqual(result.dropped, 2);
    assert.strictEqual(result.skipped, false);
    // Verify post-reboot state via fresh BindingStore — boot-time loadData
    // filters the tombstones the migration wrote.
    const bindingsAfterReboot = new BindingStore(storage, { clock });
    assert.strictEqual(
      await bindingsAfterReboot.loadBinding("msteams", "aad-A"),
      null,
    );
    assert.strictEqual(
      await bindingsAfterReboot.loadBinding("msteams", "aad-B"),
      null,
    );
    const survivor = await bindingsAfterReboot.loadBinding(
      "github-discussions",
      "42",
    );
    assert.ok(survivor, "github-discussions binding preserved");
    assert.strictEqual(
      await migrations.has("1520-drop-pre-fix-bridge-proof-bindings"),
      true,
    );
  });

  test("skips on second boot via marker", async () => {
    const { storage, clock, bindings, migrations } = setup();
    await seedBinding(bindings, "msteams", "aad-A", "attacker-A");
    await bindings.flush();
    await dropPreFixBridgeProofBindings({ bindings, migrations, clock });

    // Fresh stores reading the same storage simulate a second boot.
    const bindings2 = new BindingStore(storage, { clock });
    const migrations2 = new MigrationLedger(storage, { clock });
    await seedBinding(bindings2, "msteams", "aad-C", "attacker-C");
    await bindings2.flush();

    const result = await dropPreFixBridgeProofBindings({
      bindings: bindings2,
      migrations: migrations2,
      clock,
    });

    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.dropped, 0);
    const survivor = await bindings2.loadBinding("msteams", "aad-C");
    assert.ok(survivor, "post-marker bindings survive");
  });

  test("crash before marker re-runs safely", async () => {
    const { storage, clock, bindings, migrations } = setup();
    await seedBinding(bindings, "msteams", "aad-A", "attacker-A");
    await seedBinding(bindings, "msteams", "aad-B", "attacker-B");
    await bindings.flush();
    // Simulate crash mid-migration: one binding tombstoned, no marker.
    await bindings.delete(BindingStore.keyOf("msteams", "aad-A"));
    await bindings.flush();
    assert.strictEqual(
      await migrations.has("1520-drop-pre-fix-bridge-proof-bindings"),
      false,
    );

    // Boot again with fresh stores reading the same storage.
    const bindings2 = new BindingStore(storage, { clock });
    const migrations2 = new MigrationLedger(storage, { clock });
    const result = await dropPreFixBridgeProofBindings({
      bindings: bindings2,
      migrations: migrations2,
      clock,
    });

    assert.strictEqual(result.skipped, false);
    assert.strictEqual(result.dropped, 1);
    // Verify post-reboot state via fresh BindingStore.
    const bindings3 = new BindingStore(storage, { clock });
    assert.strictEqual(await bindings3.loadBinding("msteams", "aad-A"), null);
    assert.strictEqual(await bindings3.loadBinding("msteams", "aad-B"), null);
    assert.strictEqual(
      await migrations2.has("1520-drop-pre-fix-bridge-proof-bindings"),
      true,
    );
  });

  test("empty bindings is a no-op", async () => {
    const { bindings, migrations, clock } = setup();
    const result = await dropPreFixBridgeProofBindings({
      bindings,
      migrations,
      clock,
    });
    assert.strictEqual(result.dropped, 0);
    assert.strictEqual(result.skipped, false);
    assert.strictEqual(
      await migrations.has("1520-drop-pre-fix-bridge-proof-bindings"),
      true,
    );
  });
});
