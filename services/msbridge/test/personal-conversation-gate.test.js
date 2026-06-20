import { describe, test, beforeEach, afterEach } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import {
  createMockClock,
  createMockConfig,
  createMockDiscussionClient,
  createMockLogger,
  createMockTracer,
} from "@forwardimpact/libmock";

import { MsBridgeService } from "../index.js";
import { DEFAULT_TICKET_SECRET, DEFAULT_TRUSTED_ORIGINS } from "./helpers.js";

function makeConfig(overrides = {}) {
  return createMockConfig("msbridge", {
    port: 0,
    host: "127.0.0.1",
    github_repo: "owner/repo",
    callback_base_url: "https://tunnel.example",
    msAppId: () => "test-app-id",
    msAppPassword: () => "test-password",
    msAppTenantId: () => "test-tenant",
    ...overrides,
  });
}

function makeAdapter(overrides = {}) {
  const sent = [];
  return {
    sent,
    reactionActivities: [],
    process: async (_req, res, callback) => {
      const turnContext = {
        activity: overrides.activity ?? { type: "message" },
        sendActivity: async (activity) => {
          sent.push(activity);
        },
      };
      await callback(turnContext);
      if (!res.headersSent) res.status(200).end();
    },
    continueConversationAsync: async (_appId, _ref, callback) => {
      await callback({
        sendActivity: async (activity) => {
          sent.push(activity);
        },
      });
    },
    onTurnError: null,
    ...overrides,
  };
}

function makeGhuserClient(impl) {
  const calls = [];
  return {
    calls,
    GetToken: async (req) => {
      calls.push(req);
      return impl(req);
    },
  };
}

function makeActivity(threadId, fromId, text, conversationType) {
  const conversation = { id: threadId };
  if (conversationType !== undefined) {
    conversation.conversationType = conversationType;
  }
  return {
    type: "message",
    id: "a-1",
    text,
    conversation,
    channelId: "msteams",
    serviceUrl: "https://example",
    from: { id: fromId },
    recipient: { id: "b" },
  };
}

async function driveOne(conversationType) {
  const client = makeGhuserClient(() => ({
    result: "link_required",
    link_required: {
      authorize_url: "https://github.com/authorize?s=msteams",
    },
  }));
  const adapter = makeAdapter({
    activity: makeActivity("t-gate", "U_gate", "hi", conversationType),
  });
  const discussionClient = createMockDiscussionClient();
  const service = new MsBridgeService(makeConfig(), {
    logger: createMockLogger(),
    tracer: createMockTracer(),
    clock: createMockClock(),
    discussionClient,
    ghuserClient: client,
    adapter,
    trustedOrigins: DEFAULT_TRUSTED_ORIGINS,
    ticketSecret: DEFAULT_TICKET_SECRET,
  });
  await service.start();
  const baseUrl = `http://127.0.0.1:${service.address().port}`;
  await fetch(`${baseUrl}/api/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "message" }),
  });
  await service.stop();
  return { adapter, discussionClient };
}

describe("msbridge personal-conversation gate", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const target = String(url);
      if (target.startsWith("https://api.github.com/")) {
        return new Response(null, { status: 204 });
      }
      return originalFetch(url, init);
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("personal: pending dispatch written, augmented link URL posted, no DM-redirect", async () => {
    const { adapter, discussionClient } = await driveOne("personal");
    expect(discussionClient.PutPendingDispatch.mock.callCount()).toBe(1);
    const [req] = discussionClient.PutPendingDispatch.mock.calls[0].arguments;
    const sent = typeof req.toJSON === "function" ? req.toJSON() : req;
    expect(sent.pending).toMatchObject({
      surface: "msteams",
      surface_user_id: "U_gate",
    });
    expect(
      adapter.sent.some((m) =>
        typeof m === "string"
          ? m.includes("link-complete") && m.includes("client_state")
          : false,
      ),
    ).toBe(true);
    expect(
      adapter.sent.some((m) =>
        typeof m === "string" ? m.includes("DM this bot") : false,
      ),
    ).toBe(false);
  });

  test("groupChat: no pending dispatch, DM-redirect posted", async () => {
    const { adapter, discussionClient } = await driveOne("groupChat");
    expect(discussionClient.PutPendingDispatch.mock.callCount()).toBe(0);
    expect(
      adapter.sent.some((m) =>
        typeof m === "string" ? m.includes("DM this bot") : false,
      ),
    ).toBe(true);
    expect(
      adapter.sent.some((m) =>
        typeof m === "string" ? m.includes("link-complete") : false,
      ),
    ).toBe(false);
  });

  test("channel: no pending dispatch, DM-redirect posted", async () => {
    const { adapter, discussionClient } = await driveOne("channel");
    expect(discussionClient.PutPendingDispatch.mock.callCount()).toBe(0);
    expect(
      adapter.sent.some((m) =>
        typeof m === "string" ? m.includes("DM this bot") : false,
      ),
    ).toBe(true);
    expect(
      adapter.sent.some((m) =>
        typeof m === "string" ? m.includes("link-complete") : false,
      ),
    ).toBe(false);
  });

  test("undefined conversationType: no pending dispatch, DM-redirect posted (fail-closed default)", async () => {
    const { adapter, discussionClient } = await driveOne(undefined);
    expect(discussionClient.PutPendingDispatch.mock.callCount()).toBe(0);
    expect(
      adapter.sent.some((m) =>
        typeof m === "string" ? m.includes("DM this bot") : false,
      ),
    ).toBe(true);
    expect(
      adapter.sent.some((m) =>
        typeof m === "string" ? m.includes("link-complete") : false,
      ),
    ).toBe(false);
  });

  test("futureUnknownType: no pending dispatch, DM-redirect posted (forward-compat fail-closed)", async () => {
    const { adapter, discussionClient } = await driveOne("futureUnknownType");
    expect(discussionClient.PutPendingDispatch.mock.callCount()).toBe(0);
    expect(
      adapter.sent.some((m) =>
        typeof m === "string" ? m.includes("DM this bot") : false,
      ),
    ).toBe(true);
    expect(
      adapter.sent.some((m) =>
        typeof m === "string" ? m.includes("link-complete") : false,
      ),
    ).toBe(false);
  });
});
