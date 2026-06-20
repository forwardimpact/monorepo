import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { handleConsent, isConsentActivity } from "../src/consent-handler.js";

function fakeTenancyClient() {
  const calls = [];
  return {
    calls,
    UpsertByChannelKey: async (req) => {
      calls.push(req);
      return { tenant_id: req.channel_tenant_key, state: req.state };
    },
  };
}

describe("msbridge consent handler", () => {
  test("isConsentActivity recognizes installationUpdate/add", () => {
    expect(
      isConsentActivity({ type: "installationUpdate", action: "add" }),
    ).toBe(true);
    expect(
      isConsentActivity({ type: "installationUpdate", action: "remove" }),
    ).toBe(false);
    expect(isConsentActivity({ type: "message" })).toBe(false);
  });

  test("fresh consent upserts as pending_consent", async () => {
    const tenancyClient = fakeTenancyClient();
    const result = await handleConsent(
      {
        type: "installationUpdate",
        action: "add",
        channelData: { tenant: { id: "entra-1" } },
      },
      { tenancyClient },
    );
    expect(result.registered).toBe(true);
    expect(tenancyClient.calls).toEqual([
      {
        channel: "msteams",
        channel_tenant_key: "entra-1",
        state: "pending_consent",
      },
    ]);
  });

  test("re-fire of the same consent does not error", async () => {
    const tenancyClient = fakeTenancyClient();
    const activity = {
      type: "installationUpdate",
      action: "add",
      channelData: { tenant: { id: "entra-1" } },
    };
    await handleConsent(activity, { tenancyClient });
    const second = await handleConsent(activity, { tenancyClient });
    expect(second.registered).toBe(true);
    expect(tenancyClient.calls.length).toBe(2);
  });

  test("activity without a tenant id is a no-op", async () => {
    const tenancyClient = fakeTenancyClient();
    const result = await handleConsent(
      { type: "installationUpdate", action: "add", channelData: {} },
      { tenancyClient },
    );
    expect(result.registered).toBe(false);
    expect(tenancyClient.calls.length).toBe(0);
  });
});
