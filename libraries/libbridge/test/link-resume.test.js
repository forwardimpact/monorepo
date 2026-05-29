import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import {
  prepareLinkResume,
  createLinkCompleteHandler,
} from "../src/link-resume.js";

describe("prepareLinkResume", () => {
  test("augments URL with redirect_uri and client_state, returns unique token", () => {
    const { linkToken, augmentedUrl } = prepareLinkResume(
      "https://oauth.example/authorize?surface=github-discussions&surface_user_id=42",
      "https://bridge.example/",
    );
    const url = new URL(augmentedUrl);
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://bridge.example/api/link-complete",
    );
    expect(url.searchParams.get("client_state")).toBe(linkToken);
    expect(typeof linkToken).toBe("string");
    expect(linkToken.length).toBeGreaterThan(0);
  });

  test("produces unique tokens on successive calls", () => {
    const a = prepareLinkResume("https://x/a", "https://b");
    const b = prepareLinkResume("https://x/a", "https://b");
    expect(a.linkToken).not.toBe(b.linkToken);
  });

  test("strips trailing slash from callbackBaseUrl", () => {
    const { augmentedUrl } = prepareLinkResume(
      "https://x/authorize",
      "https://bridge.example///",
    );
    const url = new URL(augmentedUrl);
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://bridge.example/api/link-complete",
    );
  });
});

describe("createLinkCompleteHandler", () => {
  function makeApp(handler) {
    const app = new Hono();
    app.get("/api/link-complete", handler);
    return app;
  }

  function makeStore({ pending = null, ctx = null } = {}) {
    return {
      resolvePendingDispatch: async () => pending,
      loadByChannel: async () => ctx,
    };
  }

  test("missing state returns 400", async () => {
    const handler = createLinkCompleteHandler({
      channel: "github-discussions",
      store: makeStore(),
      dispatcher: { dispatch: async () => ({}) },
      buildCallbackMeta: () => ({}),
    });
    const app = makeApp(handler);
    const res = await app.request("/api/link-complete");
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("Missing state");
  });

  test("consumed token returns 'Already processed'", async () => {
    const handler = createLinkCompleteHandler({
      channel: "github-discussions",
      store: makeStore({ pending: null }),
      dispatcher: { dispatch: async () => ({}) },
      buildCallbackMeta: () => ({}),
    });
    const app = makeApp(handler);
    const res = await app.request("/api/link-complete?state=expired-tok");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Already processed");
  });

  test("discussion not found returns 404", async () => {
    const handler = createLinkCompleteHandler({
      channel: "github-discussions",
      store: makeStore({
        pending: { discussion_id: "d-1", surface_user_id: "42" },
        ctx: null,
      }),
      dispatcher: { dispatch: async () => ({}) },
      buildCallbackMeta: () => ({}),
    });
    const app = makeApp(handler);
    const res = await app.request("/api/link-complete?state=tok");
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain("Discussion not found");
  });

  test("dispatched returns 'Processing'", async () => {
    const handler = createLinkCompleteHandler({
      channel: "github-discussions",
      store: makeStore({
        pending: { discussion_id: "d-1", surface_user_id: "42" },
        ctx: {
          discussion_id: "d-1",
          history: [{ role: "user", text: "deploy please", author: "42" }],
        },
      }),
      dispatcher: {
        dispatch: async () => ({
          kind: "dispatched",
          token: "t",
          correlationId: "c",
        }),
      },
      buildCallbackMeta: (ctx) => ({ discussionId: ctx.discussion_id }),
    });
    const app = makeApp(handler);
    const res = await app.request("/api/link-complete?state=tok");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Processing");
  });

  test("dispatch failure renders 'Unable to dispatch'", async () => {
    const handler = createLinkCompleteHandler({
      channel: "github-discussions",
      store: makeStore({
        pending: { discussion_id: "d-1", surface_user_id: "42" },
        ctx: {
          discussion_id: "d-1",
          history: [{ role: "user", text: "hello", author: "42" }],
        },
      }),
      dispatcher: {
        dispatch: async () => ({
          kind: "link_required",
          authorizeUrl: "http://x",
        }),
      },
      buildCallbackMeta: () => ({}),
    });
    const app = makeApp(handler);
    const res = await app.request("/api/link-complete?state=tok");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Unable to dispatch");
  });

  test("multi-party thread: selects the turn authored by the linking user", async () => {
    let capturedPrompt;
    const handler = createLinkCompleteHandler({
      channel: "github-discussions",
      store: makeStore({
        pending: { discussion_id: "d-1", surface_user_id: "42" },
        ctx: {
          discussion_id: "d-1",
          history: [
            { role: "user", text: "msg from 99", author: "99" },
            { role: "user", text: "msg from 42", author: "42" },
            { role: "user", text: "another from 99", author: "99" },
          ],
        },
      }),
      dispatcher: {
        dispatch: async ({ prompt }) => {
          capturedPrompt = prompt;
          return { kind: "dispatched", token: "t", correlationId: "c" };
        },
      },
      buildCallbackMeta: () => ({}),
    });
    const app = makeApp(handler);
    await app.request("/api/link-complete?state=tok");
    expect(capturedPrompt).toContain("Current message: msg from 42");
  });

  test("no user turn found returns 404", async () => {
    const handler = createLinkCompleteHandler({
      channel: "github-discussions",
      store: makeStore({
        pending: { discussion_id: "d-1", surface_user_id: "42" },
        ctx: {
          discussion_id: "d-1",
          history: [{ role: "assistant", text: "hi there" }],
        },
      }),
      dispatcher: { dispatch: async () => ({}) },
      buildCallbackMeta: () => ({}),
    });
    const app = makeApp(handler);
    const res = await app.request("/api/link-complete?state=tok");
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain("No message found");
  });
});
