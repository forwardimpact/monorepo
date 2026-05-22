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

function makeConfig() {
  return createMockConfig("ghbridge", {
    host: "127.0.0.1",
    port: 0,
    github_repo: "owner/repo",
    callback_base_url: "https://bridge.example",
    app_webhook_secret: SECRET,
  });
}

async function newService() {
  const dispatches = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.startsWith("https://api.github.com/")) {
      dispatches.push({ url: target, init });
      return new Response("{}", { status: 204 });
    }
    return originalFetch(url, init);
  };
  const service = new GhBridgeService(makeConfig(), {
    logger: createMockLogger(),
    tracer: makeTracer(),
    storage: createMockStorage(),
    verifyWebhook: (s, b, sig) =>
      import("@octokit/webhooks-methods").then((m) => m.verify(s, b, sig)),
    getInstallationToken: async () => "ghs_test",
    graphqlClient: async () => ({}),
  });
  await service.start();
  return {
    service,
    dispatches,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
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

async function postCallback(baseUrl, token, body) {
  return fetch(`${baseUrl}/api/callback/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("ghbridge resume", () => {
  let ctx;
  let baseUrl;

  beforeEach(async () => {
    ctx = await newService();
    baseUrl = `http://127.0.0.1:${ctx.service.address().port}`;
  });

  afterEach(async () => {
    await ctx.service.stop();
    ctx.restore();
  });

  test("responses trigger fires after expected comments; re-dispatch carries resume_context", async () => {
    await postSigned(baseUrl, "discussion", {
      action: "created",
      discussion: {
        node_id: "D_resume",
        body: "open the floor",
        user: { id: 1, login: "u" },
      },
    });
    const stored1 = await ctx.service.store.loadByChannel(
      "github-discussions",
      "D_resume",
    );
    const token = Object.keys(stored1.pending_callbacks)[0];
    const meta = ctx.service.callbacks.peek(token);
    expect(ctx.dispatches).toHaveLength(1);

    await postCallback(baseUrl, token, {
      correlation_id: meta.correlationId,
      verdict: "recessed",
      summary: "awaiting 2 responses",
      run_url: "https://github.com/owner/repo/actions/runs/1",
      replies: [],
      trigger: { kind: "responses", responses: 2 },
    });
    const stored2 = await ctx.service.store.loadByChannel(
      "github-discussions",
      "D_resume",
    );
    expect(Object.keys(stored2.open_rfcs)).toHaveLength(1);

    await postSigned(baseUrl, "discussion_comment", {
      action: "created",
      discussion: { node_id: "D_resume" },
      comment: { body: "I think yes", node_id: "C_1" },
    });
    let stored3 = await ctx.service.store.loadByChannel(
      "github-discussions",
      "D_resume",
    );
    expect(Object.keys(stored3.open_rfcs)).toHaveLength(1);

    await postSigned(baseUrl, "discussion_comment", {
      action: "created",
      discussion: { node_id: "D_resume" },
      comment: { body: "agreed", node_id: "C_2" },
    });
    stored3 = await ctx.service.store.loadByChannel(
      "github-discussions",
      "D_resume",
    );
    expect(Object.keys(stored3.open_rfcs)).toHaveLength(0);

    const resumeDispatch = ctx.dispatches.find((d) => {
      const inputs = JSON.parse(d.init.body)?.inputs;
      return inputs?.resume_context;
    });
    expect(resumeDispatch).toBeTruthy();
    const inputs = JSON.parse(resumeDispatch.init.body).inputs;
    expect(inputs.discussion_id).toBe("D_resume");
    const resumeCtx = JSON.parse(inputs.resume_context);
    expect(resumeCtx.correlation_id).toBe(meta.correlationId);
    expect(resumeCtx.history_since).toEqual([
      { role: "user", text: "I think yes" },
      { role: "user", text: "agreed" },
    ]);
  });
});
