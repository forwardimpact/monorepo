import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import {
  DefaultTenantResolver,
  RegistryTenantResolver,
  assertMultiTenantDeps,
} from "../src/tenant-resolver.js";

describe("assertMultiTenantDeps", () => {
  test("throws when multi-tenant but no tenancy client", () => {
    expect(() => assertMultiTenantDeps(true, undefined)).toThrow(
      /tenancyClient is required/,
    );
  });

  test("passes when multi-tenant with a client, or single-tenant", () => {
    expect(() => assertMultiTenantDeps(true, {})).not.toThrow();
    expect(() => assertMultiTenantDeps(false, undefined)).not.toThrow();
  });
});

describe("DefaultTenantResolver", () => {
  test("requires channel", () => {
    expect(() => new DefaultTenantResolver({})).toThrow(/channel/);
  });

  test("resolve returns the same default tenant for any key", async () => {
    const resolver = new DefaultTenantResolver({
      channel: "github-discussions",
      repo: { owner: "acme", name: "site" },
    });
    const a = await resolver.resolve({
      channel: "github-discussions",
      key: "ignored",
    });
    const b = await resolver.resolve({ channel: "anything", key: "else" });
    expect(a.tenant_id).toBe("default");
    expect(a.state).toBe("active");
    expect(a.channel).toBe("github-discussions");
    expect(a.repo).toEqual({ owner: "acme", name: "site" });
    expect(b).toEqual(a);
  });

  test("resolveByRepo returns the default tenant regardless of repo", async () => {
    const resolver = new DefaultTenantResolver({ channel: "msteams" });
    const t = await resolver.resolveByRepo({ owner: "x", name: "y" });
    expect(t.tenant_id).toBe("default");
    expect(t.channel).toBe("msteams");
    expect(t.channel_tenant_key).toBe("default");
  });

  test("resolveByTenantId returns the default tenant for 'default' and null otherwise", async () => {
    const resolver = new DefaultTenantResolver({
      channel: "github-discussions",
    });
    expect(await resolver.resolveByTenantId({ tenant_id: "default" })).toEqual({
      tenant_id: "default",
      channel: "github-discussions",
      channel_tenant_key: "default",
      repo: undefined,
      state: "active",
    });
    expect(await resolver.resolveByTenantId({ tenant_id: "t-1" })).toBeNull();
  });
});

describe("RegistryTenantResolver", () => {
  function makeClient({ byChannelKey, byRepo, byTenantId } = {}) {
    return {
      ResolveByChannelKey: async (req) => byChannelKey?.(req) ?? null,
      ResolveByRepo: async (req) => byRepo?.(req) ?? null,
      ResolveByTenantId: async (req) => byTenantId?.(req) ?? null,
    };
  }

  test("requires a client", () => {
    expect(() => new RegistryTenantResolver({})).toThrow(/client/);
  });

  test("resolve returns the tenant when state=active", async () => {
    const resolver = new RegistryTenantResolver({
      client: makeClient({
        byChannelKey: () => ({
          tenant_id: "t-1",
          channel: "github-discussions",
          channel_tenant_key: "42:acme/site",
          state: "active",
        }),
      }),
    });
    const t = await resolver.resolve({
      channel: "github-discussions",
      key: "42:acme/site",
    });
    expect(t.tenant_id).toBe("t-1");
    expect(t.state).toBe("active");
  });

  test("resolve returns null when state is not active", async () => {
    const resolver = new RegistryTenantResolver({
      client: makeClient({
        byChannelKey: () => ({
          tenant_id: "t-pending",
          state: "pending_consent",
        }),
      }),
    });
    expect(
      await resolver.resolve({ channel: "msteams", key: "abc" }),
    ).toBeNull();
  });

  test("resolveByRepo returns the tenant when state=active and null otherwise", async () => {
    const resolver = new RegistryTenantResolver({
      client: makeClient({
        byRepo: ({ owner, name }) =>
          owner === "acme" && name === "site"
            ? { tenant_id: "t-2", state: "active" }
            : { tenant_id: "t-revoked", state: "revoked" },
      }),
    });
    const ok = await resolver.resolveByRepo({ owner: "acme", name: "site" });
    expect(ok.tenant_id).toBe("t-2");
    const revoked = await resolver.resolveByRepo({
      owner: "other",
      name: "repo",
    });
    expect(revoked).toBeNull();
  });

  test("resolveByTenantId forwards to the client without state filtering", async () => {
    const resolver = new RegistryTenantResolver({
      client: makeClient({
        byTenantId: ({ tenant_id }) =>
          tenant_id === "t-3" ? { tenant_id: "t-3", state: "revoked" } : null,
      }),
    });
    const t = await resolver.resolveByTenantId({ tenant_id: "t-3" });
    expect(t.tenant_id).toBe("t-3");
    expect(t.state).toBe("revoked");
    expect(
      await resolver.resolveByTenantId({ tenant_id: "unknown" }),
    ).toBeNull();
  });
});
