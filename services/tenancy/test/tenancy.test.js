import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockConfig, createMockClock } from "@forwardimpact/libmock";
import { createMockStorage } from "@forwardimpact/libmock/mock";
import { TenancyService, TenantStore } from "../index.js";

function build({ start = 1_700_000_000_000 } = {}) {
  const storage = createMockStorage();
  const clock = createMockClock({ start });
  const tenants = new TenantStore(storage, { clock });
  const config = createMockConfig("tenancy");
  const service = new TenancyService(config, { tenants });
  return { service, tenants, clock };
}

describe("tenancy UpsertByPair", () => {
  test("creates one row per (installation_id, repo) pair", async () => {
    const { service } = build();
    const first = await service.UpsertByPair({
      installation_id: "100",
      owner: "acme",
      name: "agents",
    });
    assert.ok(first.tenant_id, "first upsert returns a tenant_id");
    assert.strictEqual(first.state, "active");
    assert.deepStrictEqual(first.repo, { owner: "acme", name: "agents" });
    assert.strictEqual(
      first.channel_tenant_key,
      "100:acme/agents",
      "channel_tenant_key composes from installation + owner/name",
    );
  });

  test("idempotent: a repeat install delivery returns the same tenant_id", async () => {
    const { service } = build();
    const first = await service.UpsertByPair({
      installation_id: "200",
      owner: "acme",
      name: "agents",
    });
    const second = await service.UpsertByPair({
      installation_id: "200",
      owner: "acme",
      name: "agents",
    });
    assert.strictEqual(
      second.tenant_id,
      first.tenant_id,
      "repeat install reuses the existing tenant row",
    );
  });
});

describe("tenancy ResolveByRepo", () => {
  test("returns the active row for a repo", async () => {
    const { service } = build();
    await service.UpsertByPair({
      installation_id: "300",
      owner: "acme",
      name: "agents",
    });
    const resolved = await service.ResolveByRepo({
      owner: "acme",
      name: "agents",
    });
    assert.ok(resolved.tenant_id, "active row resolves");
    assert.strictEqual(resolved.state, "active");
  });

  test("returns empty for a revoked row (active-only filter)", async () => {
    const { service } = build();
    const created = await service.UpsertByPair({
      installation_id: "400",
      owner: "acme",
      name: "agents",
    });
    await service.SetState({ tenant_id: created.tenant_id, state: "revoked" });
    const resolved = await service.ResolveByRepo({
      owner: "acme",
      name: "agents",
    });
    assert.strictEqual(
      resolved.tenant_id,
      undefined,
      "revoked tenants are not returned by ResolveByRepo",
    );
  });

  test("returns empty when no row matches the repo", async () => {
    const { service } = build();
    const resolved = await service.ResolveByRepo({
      owner: "unknown",
      name: "missing",
    });
    assert.strictEqual(resolved.tenant_id, undefined);
  });
});

describe("tenancy SetState", () => {
  test("transitions pending_consent → active → revoked", async () => {
    const { service } = build();
    const created = await service.UpsertByChannelKey({
      channel: "msteams",
      channel_tenant_key: "azure-tenant-aaa",
      state: "pending_consent",
    });
    assert.strictEqual(created.state, "pending_consent");

    const activated = await service.SetState({
      tenant_id: created.tenant_id,
      state: "active",
    });
    assert.strictEqual(activated.state, "active");

    const revoked = await service.SetState({
      tenant_id: created.tenant_id,
      state: "revoked",
    });
    assert.strictEqual(revoked.state, "revoked");

    const resolvedByTenantId = await service.ResolveByTenantId({
      tenant_id: created.tenant_id,
    });
    assert.strictEqual(
      resolvedByTenantId.state,
      "revoked",
      "ResolveByTenantId returns the row regardless of state",
    );

    const resolvedByChannelKey = await service.ResolveByChannelKey({
      channel: "msteams",
      key: "azure-tenant-aaa",
    });
    assert.strictEqual(
      resolvedByChannelKey.tenant_id,
      undefined,
      "ResolveByChannelKey filters out revoked rows",
    );
  });
});

describe("tenancy SetRepo", () => {
  test("attaches a repo to a pending_consent row after self-serve", async () => {
    const { service } = build();
    const created = await service.UpsertByChannelKey({
      channel: "msteams",
      channel_tenant_key: "azure-tenant-bbb",
      state: "pending_consent",
    });
    const updated = await service.SetRepo({
      tenant_id: created.tenant_id,
      repo: { owner: "acme", name: "agents" },
    });
    assert.deepStrictEqual(updated.repo, {
      owner: "acme",
      name: "agents",
    });
  });
});
