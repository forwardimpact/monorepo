import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { sign } from "@octokit/webhooks-methods";
import {
  createMockConfig,
  createMockLogger,
  createMockStorage,
} from "@forwardimpact/libharness";

import { GhBridgeService } from "../index.js";
import { ADD_DISCUSSION_COMMENT_MUTATION } from "../src/graphql.js";

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

describe("ghbridge reply path", () => {
  let dispatches;
  let graphqlCalls;
  let originalFetch;
  let service;

  beforeEach(async () => {
    dispatches = [];
    graphqlCalls = [];
    let commentCounter = 0;
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const target = String(url);
      if (target.startsWith("https://api.github.com/")) {
        dispatches.push({ url: target, init });
        return new Response("{}", { status: 204 });
      }
      return originalFetch(url, init);
    };

    service = new GhBridgeService(makeConfig(), {
      logger: createMockLogger(),
      tracer: makeTracer(),
      storage: createMockStorage(),
      verifyWebhook: (s, b, sig) =>
        import("@octokit/webhooks-methods").then((m) => m.verify(s, b, sig)),
      getInstallationToken: async () => "ghs_installation_token",
      graphqlClient: async (query, variables) => {
        graphqlCalls.push({ query, variables });
        if (query.includes("addDiscussionComment")) {
          return {
            addDiscussionComment: {
              comment: { id: `C_${++commentCounter}`, url: "url" },
            },
          };
        }
        return {};
      },
      ghauthClient: {
        GetToken: async () => ({
          result: "token",
          token: "ghs_per_user_token",
        }),
      },
    });
    await service.start();
  });

  afterEach(async () => {
    await service.stop();
    globalThis.fetch = originalFetch;
  });

  test("reply posting uses installation credential (graphqlClient), not per-user token", async () => {
    const baseUrl = `http://127.0.0.1:${service.address().port}`;

    const discussionEvent = {
      action: "created",
      discussion: {
        node_id: "D_reply",
        body: "rfc",
        user: { id: 1, login: "u" },
      },
    };
    const json = JSON.stringify(discussionEvent);
    const signature = await sign(SECRET, json);
    await fetch(`${baseUrl}/api/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-github-event": "discussion",
        "x-hub-signature-256": signature,
      },
      body: json,
    });

    expect(dispatches).toHaveLength(1);
    expect(dispatches[0].init.headers.Authorization).toBe(
      "Bearer ghs_per_user_token",
    );

    const stored = await service.store.loadByChannel(
      "github-discussions",
      "D_reply",
    );
    const token = Object.keys(stored.pending_callbacks)[0];
    const meta = service.callbacks.peek(token);

    const callbackRes = await fetch(`${baseUrl}/api/callback/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        correlation_id: meta.correlationId,
        verdict: "adjourned",
        summary: "done",
        replies: [{ body: "bot reply" }],
      }),
    });
    expect(callbackRes.status).toBe(200);

    const commentCalls = graphqlCalls.filter(
      (c) => c.query === ADD_DISCUSSION_COMMENT_MUTATION,
    );
    expect(commentCalls).toHaveLength(1);
    expect(commentCalls[0].variables.i.body).toBe("bot reply");
  });
});
