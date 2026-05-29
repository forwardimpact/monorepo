import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { sign } from "@octokit/webhooks-methods";
import {
  createMockConfig,
  createMockLogger,
  createMockTracer,
} from "@forwardimpact/libmock";

import { GhBridgeService } from "../index.js";
import { createStatefulDiscussionClient } from "./helpers.js";

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

function makeGhauthClient(impl) {
  const calls = [];
  return {
    calls,
    GetToken: async (req) => {
      calls.push(req);
      return impl(req);
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

describe("ghbridge dispatch-auth", () => {
  let dispatches;
  let graphqlCalls;
  let originalFetch;

  beforeEach(() => {
    dispatches = [];
    graphqlCalls = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const target = String(url);
      if (target.startsWith("https://api.github.com/")) {
        dispatches.push({ url: target, init });
        return new Response("{}", { status: 204 });
      }
      return originalFetch(url, init);
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function buildService(ghauthClient) {
    let commentCounter = 0;
    return new GhBridgeService(makeConfig(), {
      logger: createMockLogger(),
      tracer: createMockTracer(),
      discussionClient: createStatefulDiscussionClient(),
      verifyWebhook: (s, b, sig) =>
        import("@octokit/webhooks-methods").then((m) => m.verify(s, b, sig)),
      getInstallationToken: async () => "ghs_install",
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
      ghauthClient,
    });
  }

  test("comment by A on discussion by B queries (github-discussions, A)", async () => {
    const client = makeGhauthClient(() => ({
      result: "token",
      token: "ghs_user",
    }));
    const service = buildService(client);
    await service.start();
    const baseUrl = `http://127.0.0.1:${service.address().port}`;

    await postSigned(baseUrl, "discussion", {
      action: "created",
      discussion: {
        node_id: "D_1",
        body: "opener",
        user: { id: 100, login: "bob" },
      },
    });
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].surface).toBe("github-discussions");
    expect(client.calls[0].surface_user_id).toBe("100");

    await postSigned(baseUrl, "discussion_comment", {
      action: "created",
      discussion: {
        node_id: "D_1",
        body: "opener",
        user: { id: 100, login: "bob" },
      },
      comment: {
        body: "comment by alice",
        node_id: "C_new",
        user: { id: 200, login: "alice" },
      },
    });
    expect(client.calls).toHaveLength(2);
    expect(client.calls[1].surface_user_id).toBe("200");

    await service.stop();
  });

  test("top-level discussion by B queries (github-discussions, B)", async () => {
    const client = makeGhauthClient(() => ({
      result: "token",
      token: "ghs_user",
    }));
    const service = buildService(client);
    await service.start();
    const baseUrl = `http://127.0.0.1:${service.address().port}`;

    await postSigned(baseUrl, "discussion", {
      action: "created",
      discussion: {
        node_id: "D_2",
        body: "top-level body",
        user: { id: 42, login: "carol" },
      },
    });
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].surface_user_id).toBe("42");

    await service.stop();
  });

  test("link_required: discussion reply with authorize URL, no workflow_dispatch", async () => {
    const client = makeGhauthClient(() => ({
      result: "link_required",
      link_required: { authorize_url: "https://example.com/authorize?s=ghd" },
    }));
    const service = buildService(client);
    await service.start();
    const baseUrl = `http://127.0.0.1:${service.address().port}`;

    const res = await postSigned(baseUrl, "discussion", {
      action: "created",
      discussion: {
        node_id: "D_link",
        body: "hi",
        user: { id: 1, login: "u" },
      },
    });
    expect(res.status).toBe(200);
    expect(dispatches).toHaveLength(0);
    const commentCalls = graphqlCalls.filter((c) =>
      c.query.includes("addDiscussionComment"),
    );
    expect(commentCalls).toHaveLength(1);
    const linkBody = commentCalls[0].variables.i.body;
    expect(linkBody).toContain("redirect_uri=");
    expect(linkBody).toContain("client_state=");
    expect(linkBody).toContain("link-complete");

    await service.stop();
  });

  test("reauth_required: discussion reply with re-link prompt, no workflow_dispatch", async () => {
    const client = makeGhauthClient(() => ({
      result: "re_auth_required",
      re_auth_required: {},
    }));
    const service = buildService(client);
    await service.start();
    const baseUrl = `http://127.0.0.1:${service.address().port}`;

    await postSigned(baseUrl, "discussion", {
      action: "created",
      discussion: {
        node_id: "D_reauth",
        body: "hi",
        user: { id: 1, login: "u" },
      },
    });
    expect(dispatches).toHaveLength(0);
    const commentCalls = graphqlCalls.filter((c) =>
      c.query.includes("addDiscussionComment"),
    );
    expect(commentCalls).toHaveLength(1);
    expect(commentCalls[0].variables.i.body).toContain("re-link");

    await service.stop();
  });

  test("transient: discussion reply with transient error, no workflow_dispatch", async () => {
    const client = makeGhauthClient(() => {
      throw new Error("UNAVAILABLE");
    });
    const service = buildService(client);
    await service.start();
    const baseUrl = `http://127.0.0.1:${service.address().port}`;

    await postSigned(baseUrl, "discussion", {
      action: "created",
      discussion: {
        node_id: "D_trans",
        body: "hi",
        user: { id: 1, login: "u" },
      },
    });
    expect(dispatches).toHaveLength(0);
    const commentCalls = graphqlCalls.filter((c) =>
      c.query.includes("addDiscussionComment"),
    );
    expect(commentCalls).toHaveLength(1);
    expect(commentCalls[0].variables.i.body).toContain("try again later");

    await service.stop();
  });

  test("token: workflow_dispatch uses per-user token", async () => {
    const client = makeGhauthClient(() => ({
      result: "token",
      token: "ghs_alice_personal",
    }));
    const service = buildService(client);
    await service.start();
    const baseUrl = `http://127.0.0.1:${service.address().port}`;

    await postSigned(baseUrl, "discussion", {
      action: "created",
      discussion: {
        node_id: "D_tok",
        body: "hi",
        user: { id: 1, login: "u" },
      },
    });
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0].init.headers.Authorization).toBe(
      "Bearer ghs_alice_personal",
    );

    await service.stop();
  });
});
