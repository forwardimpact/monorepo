import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { sign } from "@octokit/webhooks-methods";
import {
  createMockConfig,
  createMockLogger,
  createMockStorage,
} from "@forwardimpact/libharness";

import { GhBridgeService } from "../index.js";

function makeTracer() {
  const noop = () => {};
  return {
    startSpan: () => ({
      addEvent: noop,
      setOk: noop,
      setError: noop,
      end: async () => {},
    }),
  };
}

const SECRET = "ghbridge-test-secret-long-enough";

function makeConfig(overrides = {}) {
  return createMockConfig("ghbridge", {
    host: "127.0.0.1",
    port: 0,
    github_repo: "owner/repo",
    callback_base_url: "https://bridge.example",
    app_id: "1",
    app_private_key: "pem",
    app_installation_id: "2",
    app_webhook_secret: SECRET,
    ...overrides,
  });
}

function buildHarness({ dispatchImpl } = {}) {
  const dispatches = [];
  const graphqlCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.startsWith("https://api.github.com/")) {
      dispatches.push({ url: target, init });
      if (dispatchImpl) return dispatchImpl(url, init);
      return new Response("{}", { status: 204 });
    }
    return originalFetch(url, init);
  };
  const restore = () => {
    globalThis.fetch = originalFetch;
  };
  return { dispatches, graphqlCalls, restore };
}

function makeGhauthClient(token = "ghs_per_user") {
  return { GetToken: async () => ({ result: "token", token }) };
}

async function newService({ dispatchImpl } = {}) {
  const harness = buildHarness({ dispatchImpl });
  const config = makeConfig();
  const storage = createMockStorage();
  const service = new GhBridgeService(config, {
    logger: createMockLogger(),
    tracer: makeTracer(),
    storage,
    verifyWebhook: (s, b, sig) =>
      import("@octokit/webhooks-methods").then((m) => m.verify(s, b, sig)),
    getInstallationToken: async () => "ghs_test_token",
    graphqlClient: async (query, variables) => {
      harness.graphqlCalls.push({ query, variables });
      return { addDiscussionComment: { comment: { id: "C_1", url: "url" } } };
    },
    ghauthClient: makeGhauthClient(),
  });
  await service.start();
  return { service, harness };
}

function discussionEvent({ nodeId = "D_kw1", body = "let's RFC" } = {}) {
  return {
    action: "created",
    discussion: {
      node_id: nodeId,
      body,
      user: { id: 42, login: "alice" },
    },
    repository: { full_name: "owner/repo" },
  };
}

async function postSigned(baseUrl, event, body) {
  const json = JSON.stringify(body);
  const signature = await sign(SECRET, json);
  return fetch(`${baseUrl}/api/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-github-event": event,
      "x-hub-signature-256": signature,
    },
    body: json,
  });
}

describe("ghbridge webhook intake", () => {
  let service;
  let harness;
  let baseUrl;

  beforeEach(async () => {
    ({ service, harness } = await newService());
    baseUrl = `http://127.0.0.1:${service.address().port}`;
  });

  afterEach(async () => {
    await service.stop();
    harness.restore();
  });

  test("rejects requests with no signature", async () => {
    const res = await fetch(`${baseUrl}/api/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  test("rejects requests with a tampered body", async () => {
    const body = JSON.stringify(discussionEvent());
    const signature = await sign(SECRET, body);
    const tampered = body.replace("alice", "mallory");
    const res = await fetch(`${baseUrl}/api/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-github-event": "discussion",
        "x-hub-signature-256": signature,
      },
      body: tampered,
    });
    expect(res.status).toBe(401);
  });

  test("accepts a discussion event with a valid signature and dispatches the workflow", async () => {
    const res = await postSigned(baseUrl, "discussion", discussionEvent());
    expect(res.status).toBe(200);
    expect(harness.dispatches).toHaveLength(1);
    const dispatched = harness.dispatches[0];
    expect(dispatched.url).toContain(
      "/repos/owner/repo/actions/workflows/kata-dispatch.yml/dispatches",
    );
    const sent = JSON.parse(dispatched.init.body);
    expect(sent.inputs.callback_url).toContain("/api/callback/");
    expect(sent.inputs.discussion_id).toBe("D_kw1");
    expect(sent.inputs.correlation_id).toEqual(expect.any(String));
  });

  test("registers a pending callback token in the context store", async () => {
    await postSigned(baseUrl, "discussion", discussionEvent());
    expect(service.callbacks.size).toBe(1);
    const ctx = await service.store.loadByChannel(
      "github-discussions",
      "D_kw1",
    );
    expect(ctx).toBeTruthy();
    expect(Object.keys(ctx.pending_callbacks)).toHaveLength(1);
  });

  test("addReaction (EYES) fires once when the discussion is dispatched", async () => {
    await postSigned(baseUrl, "discussion", discussionEvent());
    const reactionCalls = harness.graphqlCalls.filter((c) =>
      c.query.includes("addReaction"),
    );
    expect(reactionCalls).toHaveLength(1);
    expect(reactionCalls[0].variables.i.content).toBe("EYES");
    expect(reactionCalls[0].variables.i.subjectId).toBe("D_kw1");
    const removeCalls = harness.graphqlCalls.filter((c) =>
      c.query.includes("removeReaction"),
    );
    expect(removeCalls).toHaveLength(0);
  });

  test("ignores unsupported events with 204", async () => {
    const res = await postSigned(baseUrl, "issues", {
      action: "opened",
      issue: { number: 1 },
    });
    expect(res.status).toBe(204);
    expect(harness.dispatches).toHaveLength(0);
  });
});
