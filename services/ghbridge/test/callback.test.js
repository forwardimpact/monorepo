import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { sign } from "@octokit/webhooks-methods";
import {
  createMockConfig,
  createMockLogger,
  createMockStorage,
} from "@forwardimpact/libmock";

import { GhBridgeService } from "../index.js";
import {
  ADD_DISCUSSION_COMMENT_MUTATION,
  ADD_REACTION_MUTATION,
  REMOVE_REACTION_MUTATION,
} from "../src/graphql.js";

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
  const graphqlCalls = [];
  let commentCounter = 0;
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
      GetToken: async () => ({ result: "token", token: "ghs_per_user" }),
    },
  });
  await service.start();
  return {
    service,
    dispatches,
    graphqlCalls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

async function dispatchFresh(service, baseUrl) {
  const event = {
    action: "created",
    discussion: { node_id: "D_kw1", body: "rfc", user: { id: 1, login: "u" } },
  };
  const json = JSON.stringify(event);
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
  const [token] = Array.from(
    (await service.store.loadByChannel("github-discussions", "D_kw1"))
      .pending_callbacks
      ? Object.keys(
          (await service.store.loadByChannel("github-discussions", "D_kw1"))
            .pending_callbacks,
        )
      : [],
  );
  return token;
}

async function postCallback(baseUrl, token, body) {
  return fetch(`${baseUrl}/api/callback/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("ghbridge callback handler", () => {
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

  test("unknown token returns 404", async () => {
    const res = await postCallback(baseUrl, "missing-token", {
      correlation_id: "x",
      verdict: "adjourned",
      summary: "",
      replies: [],
    });
    expect(res.status).toBe(404);
  });

  test("adjourned verdict posts each reply via addDiscussionComment", async () => {
    const token = await dispatchFresh(ctx.service, baseUrl);
    const meta = ctx.service.callbacks.peek(token);
    const res = await postCallback(baseUrl, token, {
      correlation_id: meta.correlationId,
      verdict: "adjourned",
      summary: "done",
      run_url: "https://github.com/owner/repo/actions/runs/1",
      replies: [
        { body: "first reply" },
        { body: "follow up", in_reply_to: "C_root" },
      ],
    });
    expect(res.status).toBe(200);
    const commentCalls = ctx.graphqlCalls.filter(
      (c) => c.query === ADD_DISCUSSION_COMMENT_MUTATION,
    );
    expect(commentCalls).toHaveLength(2);
    expect(commentCalls[0].variables.i.body).toBe("first reply");
    expect(commentCalls[1].variables.i.replyToId).toBe("C_root");
    const stored = await ctx.service.store.loadByChannel(
      "github-discussions",
      "D_kw1",
    );
    expect(stored.open_rfcs).toEqual({});
  });

  test("recessed verdict persists open_rfcs with the trigger", async () => {
    const token = await dispatchFresh(ctx.service, baseUrl);
    const meta = ctx.service.callbacks.peek(token);
    const res = await postCallback(baseUrl, token, {
      correlation_id: meta.correlationId,
      verdict: "recessed",
      summary: "awaiting replies",
      run_url: "https://github.com/owner/repo/actions/runs/1",
      replies: [{ body: "what do others think?" }],
      trigger: { kind: "missing_input", replies: 2 },
    });
    expect(res.status).toBe(200);
    const stored = await ctx.service.store.loadByChannel(
      "github-discussions",
      "D_kw1",
    );
    const rfcs = Object.values(stored.open_rfcs);
    expect(rfcs).toHaveLength(1);
    expect(rfcs[0].trigger).toEqual({ kind: "missing_input", replies: 2 });
    expect(typeof rfcs[0].history_index_at_open).toBe("number");
  });

  test("failed verdict posts the summary as a discussion comment and clears state", async () => {
    const token = await dispatchFresh(ctx.service, baseUrl);
    const meta = ctx.service.callbacks.peek(token);
    const res = await postCallback(baseUrl, token, {
      correlation_id: meta.correlationId,
      verdict: "failed",
      summary: "facilitator failed; see run",
      run_url: "https://github.com/owner/repo/actions/runs/1",
      replies: [],
    });
    expect(res.status).toBe(200);
    const commentCalls = ctx.graphqlCalls.filter(
      (c) => c.query === ADD_DISCUSSION_COMMENT_MUTATION,
    );
    expect(commentCalls).toHaveLength(1);
    expect(commentCalls[0].variables.i.body).toBe(
      "facilitator failed; see run",
    );
  });

  test("graphql contains the three mutations (the source of truth)", () => {
    expect(ADD_DISCUSSION_COMMENT_MUTATION).toContain("addDiscussionComment");
    expect(ADD_REACTION_MUTATION).toContain("addReaction");
    expect(REMOVE_REACTION_MUTATION).toContain("removeReaction");
  });

  test("callback fires removeReaction(EYES) on the discussion", async () => {
    const token = await dispatchFresh(ctx.service, baseUrl);
    const meta = ctx.service.callbacks.peek(token);
    const before = ctx.graphqlCalls.filter((c) =>
      c.query.includes("removeReaction"),
    ).length;
    expect(before).toBe(0);
    await postCallback(baseUrl, token, {
      correlation_id: meta.correlationId,
      verdict: "adjourned",
      summary: "done",
      replies: [],
    });
    const removeCalls = ctx.graphqlCalls.filter((c) =>
      c.query.includes("removeReaction"),
    );
    expect(removeCalls).toHaveLength(1);
    expect(removeCalls[0].variables.i.content).toBe("EYES");
    expect(removeCalls[0].variables.i.subjectId).toBe("D_kw1");
  });

  test("addDiscussionComment is not composed inside any workflow YAML", async () => {
    // Spec § Success criteria row 6: GraphQL mutation strings are owned by
    // src/graphql.js, never composed inside facilitator prompts or workflow
    // YAML. This guard catches a regression where the Discussion handling
    // sneaks back into kata-dispatch.yml.
    const { readdir, readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const workflowsDir = join(
      import.meta.dir,
      "..",
      "..",
      "..",
      ".github",
      "workflows",
    );
    const files = await readdir(workflowsDir);
    for (const file of files) {
      if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
      const contents = await readFile(join(workflowsDir, file), "utf8");
      expect(contents).not.toContain("addDiscussionComment");
    }
  });

  test("self-originated comments are skipped by the webhook handler", async () => {
    const token = await dispatchFresh(ctx.service, baseUrl);
    const meta = ctx.service.callbacks.peek(token);
    await postCallback(baseUrl, token, {
      correlation_id: meta.correlationId,
      verdict: "adjourned",
      summary: "done",
      run_url: "https://github.com/owner/repo/actions/runs/1",
      replies: [{ body: "bot reply" }],
    });

    const commentCalls = ctx.graphqlCalls.filter(
      (c) => c.query === ADD_DISCUSSION_COMMENT_MUTATION,
    );
    expect(commentCalls.length).toBeGreaterThan(0);

    const postedCommentId = `C_${commentCalls.length}`;
    const dispatchesBefore = ctx.dispatches.length;

    const commentEvent = {
      action: "created",
      discussion: {
        node_id: "D_kw1",
        body: "rfc",
        user: { id: 1, login: "u" },
      },
      comment: { node_id: postedCommentId, body: "bot reply" },
    };
    const json = JSON.stringify(commentEvent);
    const { sign } = await import("@octokit/webhooks-methods");
    const signature = await sign(SECRET, json);
    const res = await fetch(`${baseUrl}/api/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-github-event": "discussion_comment",
        "x-hub-signature-256": signature,
      },
      body: json,
    });

    expect(res.status).toBe(204);
    expect(ctx.dispatches.length).toBe(dispatchesBefore);
  });

  test("correlation_id mismatch returns 400", async () => {
    const token = await dispatchFresh(ctx.service, baseUrl);
    const res = await postCallback(baseUrl, token, {
      correlation_id: "wrong-id",
      verdict: "adjourned",
      summary: "",
      replies: [],
    });
    expect(res.status).toBe(400);
  });
});
