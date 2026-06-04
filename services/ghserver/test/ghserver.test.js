import { test, describe } from "node:test";
import assert from "node:assert";
import grpc from "@grpc/grpc-js";
import { createMockConfig, createMockClock } from "@forwardimpact/libmock";
import { GhserverService, RateCeiling } from "../index.js";

const ACTIVE_TENANT = {
  tenant_id: "t-1",
  channel: "github-discussions",
  channel_tenant_key: "100:acme/agents",
  repo: { owner: "acme", name: "agents" },
  state: "active",
};

function build({ tenant = ACTIVE_TENANT, limit = 10 } = {}) {
  const clock = createMockClock({ start: 1_700_000_000_000 });
  const minted = [];
  const tenancy = {
    async ResolveByRepo() {
      return tenant;
    },
  };
  const appAuth = {
    async mintInstallationToken(req) {
      minted.push(req);
      return { token: "ghs_minted", expires_at: clock.now() + 3_600_000 };
    },
  };
  const rateCeiling = new RateCeiling({ clock, limit });
  const config = createMockConfig("ghserver");
  const service = new GhserverService(config, {
    tenancy,
    appAuth,
    rateCeiling,
  });
  return { service, minted, clock };
}

describe("ghserver MintInstallationToken", () => {
  test("mints a token for an active tenant scoped to the resolved installation", async () => {
    const { service, minted } = build();
    const res = await service.MintInstallationToken({
      owner: "acme",
      name: "agents",
      requested_by: "oidc",
    });
    assert.strictEqual(res.installation_token, "ghs_minted");
    assert.ok(res.expires_at > 0, "expires_at is set");
    assert.strictEqual(
      minted[0].installation_id,
      "100",
      "installation_id parsed from channel_tenant_key",
    );
  });

  test("rejects with NOT_FOUND when no active tenant maps to the repo", async () => {
    const { service } = build({ tenant: {} });
    await assert.rejects(
      () =>
        service.MintInstallationToken({
          owner: "acme",
          name: "agents",
          requested_by: "oidc",
        }),
      (err) => err.code === grpc.status.NOT_FOUND,
    );
  });

  test("rejects with NOT_FOUND when the resolved tenant is not active", async () => {
    const { service } = build({
      tenant: { ...ACTIVE_TENANT, state: "revoked" },
    });
    await assert.rejects(
      () =>
        service.MintInstallationToken({
          owner: "acme",
          name: "agents",
          requested_by: "oidc",
        }),
      (err) => err.code === grpc.status.NOT_FOUND,
    );
  });

  test("rejects with RESOURCE_EXHAUSTED once the per-tenant ceiling is hit", async () => {
    const { service } = build({ limit: 2 });
    await service.MintInstallationToken({
      owner: "acme",
      name: "agents",
      requested_by: "oidc",
    });
    await service.MintInstallationToken({
      owner: "acme",
      name: "agents",
      requested_by: "oidc",
    });
    await assert.rejects(
      () =>
        service.MintInstallationToken({
          owner: "acme",
          name: "agents",
          requested_by: "oidc",
        }),
      (err) => err.code === grpc.status.RESOURCE_EXHAUSTED,
    );
  });

  test("maps a malformed channel_tenant_key to INTERNAL", async () => {
    const { service } = build({
      tenant: { ...ACTIVE_TENANT, channel_tenant_key: "not-a-valid-key" },
    });
    await assert.rejects(
      () =>
        service.MintInstallationToken({
          owner: "acme",
          name: "agents",
          requested_by: "oidc",
        }),
      (err) => err.code === grpc.status.INTERNAL,
    );
  });
});
