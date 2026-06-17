import { describe, expect, test } from "bun:test";

import {
  DefaultTenantResolver,
  RegistryTenantResolver,
} from "@forwardimpact/libbridge";

import { DiscussionAdapter } from "../src/discussion-adapter.js";

const CHANNEL = "github-discussions";

function recordingClient() {
  const seen = {};
  const record = (name) => async (req) => {
    seen[name] = req?.toJSON?.() ?? req;
    if (name === "LoadDiscussion" || name === "LoadDiscussionByCorrelation") {
      const err = new Error("not found");
      err.code = 5; // NOT_FOUND
      throw err;
    }
    if (name === "ListOpenRecesses") return { refs: [] };
    if (name === "ResolvePendingDispatch") {
      const err = new Error("not found");
      err.code = 5;
      throw err;
    }
    return {};
  };
  return {
    seen,
    SaveDiscussion: record("SaveDiscussion"),
    LoadDiscussion: record("LoadDiscussion"),
    LoadDiscussionByCorrelation: record("LoadDiscussionByCorrelation"),
    ListOpenRecesses: record("ListOpenRecesses"),
    PutPendingDispatch: record("PutPendingDispatch"),
    ResolvePendingDispatch: record("ResolvePendingDispatch"),
  };
}

function ctx() {
  return {
    id: `${CHANNEL}:D_1`,
    channel: CHANNEL,
    discussion_id: "D_1",
    history: [],
    participants: [],
    open_rfcs: {},
    pending_callbacks: {},
    dispatches: [],
    last_active_at: 1,
  };
}

describe("ghbridge DiscussionAdapter tenant threading", () => {
  test("constructor throws when tenantResolver is omitted", () => {
    expect(() => new DiscussionAdapter(recordingClient())).toThrow(
      "tenantResolver is required",
    );
  });

  test("DefaultTenantResolver threads tenant_id=default on every RPC", async () => {
    const client = recordingClient();
    const adapter = new DiscussionAdapter(client, {
      tenantResolver: new DefaultTenantResolver({ channel: CHANNEL }),
    });

    await adapter.add(ctx());
    await adapter.loadByChannel(CHANNEL, "D_1");
    await adapter.loadByCorrelation("corr-1");
    await adapter.listOpenRecesses();
    await adapter.putPendingDispatch({
      link_token: "lt",
      surface: CHANNEL,
      surface_user_id: "u",
      discussion_id: "D_1",
    });
    await adapter.resolvePendingDispatch("lt");

    expect(client.seen.SaveDiscussion.tenant_id).toBe("default");
    expect(client.seen.LoadDiscussion.tenant_id).toBe("default");
    expect(client.seen.LoadDiscussionByCorrelation.tenant_id).toBe("default");
    expect(client.seen.ListOpenRecesses.tenant_id).toBe("default");
    expect(client.seen.PutPendingDispatch.tenant_id).toBe("default");
    expect(client.seen.ResolvePendingDispatch.tenant_id).toBe("default");
  });

  test("putPendingDispatch uses the target's tenant_id as the sibling field, not a resolver lookup", async () => {
    const client = recordingClient();
    // A resolver whose lookup would throw — proving the supplied tenant_id is
    // used directly, never resolved from the bare channel string.
    const adapter = new DiscussionAdapter(client, {
      tenantResolver: {
        resolve: async () => {
          throw new Error("resolver must not be consulted");
        },
      },
    });

    await adapter.putPendingDispatch({
      link_token: "lt",
      surface: CHANNEL,
      surface_user_id: "u",
      discussion_id: "D_1",
      tenant_id: "t-acme",
    });

    const req = client.seen.PutPendingDispatch;
    expect(req.tenant_id).toBe("t-acme");
    // tenant_id is a sibling of pending, never nested inside it.
    expect(req.pending?.tenant_id).toBeUndefined();
    expect(req.pending.link_token).toBe("lt");
  });

  test("RegistryTenantResolver threads the resolved tenant_id on every RPC", async () => {
    const client = recordingClient();
    const tenancyClient = {
      ResolveByChannelKey: async () => ({
        tenant_id: "t-acme",
        state: "active",
      }),
      ResolveByRepo: async () => ({ tenant_id: "t-acme", state: "active" }),
      ResolveByTenantId: async () => ({ tenant_id: "t-acme", state: "active" }),
    };
    const adapter = new DiscussionAdapter(client, {
      tenantResolver: new RegistryTenantResolver({ client: tenancyClient }),
    });

    await adapter.add(ctx());
    await adapter.loadByChannel(CHANNEL, "D_1");
    await adapter.listOpenRecesses();

    expect(client.seen.SaveDiscussion.tenant_id).toBe("t-acme");
    expect(client.seen.LoadDiscussion.tenant_id).toBe("t-acme");
    expect(client.seen.ListOpenRecesses.tenant_id).toBe("t-acme");
  });
});
