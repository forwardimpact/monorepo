import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import {
  prepareLinkResume,
  createLinkCompleteHandler,
} from "../src/link-resume.js";
import {
  mintCompletionTicket,
  TICKET_TTL_MS,
} from "@forwardimpact/libutil/completion-ticket";
import { loadTrustedIdpOrigins } from "@forwardimpact/libutil/trusted-origins";

const TRUSTED = loadTrustedIdpOrigins("https://oauth.example");
const SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NOW = 1_700_000_000_000;
const clock = { now: () => NOW };

describe("prepareLinkResume — keyword args, discriminated return", () => {
  test("returns { linkToken, augmentedUrl } for a trusted, parseable URL", () => {
    const r = prepareLinkResume({
      authorizeUrl:
        "https://oauth.example/authorize?surface=github-discussions&surface_user_id=42",
      callbackBaseUrl: "https://bridge.example/",
      trustedOrigins: TRUSTED,
    });
    expect(r.skipped).toBeUndefined();
    const url = new URL(r.augmentedUrl);
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://bridge.example/api/link-complete",
    );
    expect(url.searchParams.get("client_state")).toBe(r.linkToken);
    expect(typeof r.linkToken).toBe("string");
    expect(r.linkToken.length).toBeGreaterThan(0);
  });

  test("produces unique tokens on successive calls", () => {
    const a = prepareLinkResume({
      authorizeUrl: "https://oauth.example/a",
      callbackBaseUrl: "https://b",
      trustedOrigins: TRUSTED,
    });
    const b = prepareLinkResume({
      authorizeUrl: "https://oauth.example/a",
      callbackBaseUrl: "https://b",
      trustedOrigins: TRUSTED,
    });
    expect(a.linkToken).not.toBe(b.linkToken);
  });

  test("strips trailing slash from callbackBaseUrl", () => {
    const { augmentedUrl } = prepareLinkResume({
      authorizeUrl: "https://oauth.example/authorize",
      callbackBaseUrl: "https://bridge.example///",
      trustedOrigins: TRUSTED,
    });
    const url = new URL(augmentedUrl);
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://bridge.example/api/link-complete",
    );
  });

  test("untrusted origin → { skipped, reason: 'untrusted_origin' }", () => {
    const r = prepareLinkResume({
      authorizeUrl: "https://attacker.example/login",
      callbackBaseUrl: "https://bridge.example",
      trustedOrigins: TRUSTED,
    });
    expect(r).toEqual({ skipped: true, reason: "untrusted_origin" });
  });

  test("malformed URL → { skipped, reason: 'untrusted_origin' }", () => {
    const r = prepareLinkResume({
      authorizeUrl: "not-a-url",
      callbackBaseUrl: "https://bridge.example",
      trustedOrigins: TRUSTED,
    });
    expect(r).toEqual({ skipped: true, reason: "untrusted_origin" });
  });

  test("missing trustedOrigins throws TypeError (forget-resistance)", () => {
    expect(() =>
      prepareLinkResume({
        authorizeUrl: "https://oauth.example/a",
        callbackBaseUrl: "https://b",
      }),
    ).toThrow(TypeError);
  });

  test("non-Set trustedOrigins throws TypeError", () => {
    expect(() =>
      prepareLinkResume({
        authorizeUrl: "https://oauth.example/a",
        callbackBaseUrl: "https://b",
        trustedOrigins: ["https://oauth.example"],
      }),
    ).toThrow(TypeError);
  });
});

describe("createLinkCompleteHandler — ticket verification gates store touch", () => {
  function makeApp(handler) {
    const app = new Hono();
    app.get("/api/link-complete", handler);
    return app;
  }

  function makeStore({ pending = null, ctx = null } = {}) {
    let resolveCount = 0;
    return {
      resolveCount: () => resolveCount,
      resolvePendingDispatch: async () => {
        resolveCount += 1;
        return pending;
      },
      loadByChannel: async () => ctx,
    };
  }

  function defaultHandler(extras = {}) {
    return createLinkCompleteHandler({
      channel: "github-discussions",
      store: makeStore(),
      dispatcher: { dispatch: async () => ({}) },
      buildCallbackMeta: () => ({}),
      trustedOrigins: TRUSTED,
      ticketSecret: SECRET,
      clock,
      ...extras,
    });
  }

  test("missing state returns 400 (pre-existing invariant)", async () => {
    const handler = defaultHandler();
    const app = makeApp(handler);
    const res = await app.request("/api/link-complete");
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("Missing state");
  });

  test("missing ticket → 'Unable to verify' and zero store touches", async () => {
    const store = makeStore({
      pending: { discussion_id: "d", surface_user_id: "42" },
    });
    const handler = defaultHandler({ store });
    const app = makeApp(handler);
    const res = await app.request("/api/link-complete?state=link-token-xyz");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Unable to verify");
    expect(store.resolveCount()).toBe(0);
  });

  test("bad signature → 'Unable to verify' and zero store touches", async () => {
    const store = makeStore({
      pending: { discussion_id: "d", surface_user_id: "42" },
    });
    const handler = defaultHandler({ store });
    const ticket = mintCompletionTicket({
      linkToken: "link-token-xyz",
      surfaceUserId: "42",
      idpOrigin: "https://oauth.example",
      secret: "different-secret",
      now: NOW,
    });
    const app = makeApp(handler);
    const res = await app.request(
      `/api/link-complete?state=link-token-xyz&ticket=${encodeURIComponent(ticket)}`,
    );
    expect(await res.text()).toContain("Unable to verify");
    expect(store.resolveCount()).toBe(0);
  });

  test("expired ticket → 'Unable to verify' and zero store touches", async () => {
    const store = makeStore({
      pending: { discussion_id: "d", surface_user_id: "42" },
    });
    const lateClock = { now: () => NOW + TICKET_TTL_MS + 1 };
    const handler = defaultHandler({ store, clock: lateClock });
    const ticket = mintCompletionTicket({
      linkToken: "link-token-xyz",
      surfaceUserId: "42",
      idpOrigin: "https://oauth.example",
      secret: SECRET,
      now: NOW,
    });
    const app = makeApp(handler);
    const res = await app.request(
      `/api/link-complete?state=link-token-xyz&ticket=${encodeURIComponent(ticket)}`,
    );
    expect(await res.text()).toContain("Unable to verify");
    expect(store.resolveCount()).toBe(0);
  });

  test("link_token mismatch → 'Unable to verify' and zero store touches", async () => {
    const store = makeStore({
      pending: { discussion_id: "d", surface_user_id: "42" },
    });
    const handler = defaultHandler({ store });
    const ticket = mintCompletionTicket({
      linkToken: "different-link",
      surfaceUserId: "42",
      idpOrigin: "https://oauth.example",
      secret: SECRET,
      now: NOW,
    });
    const app = makeApp(handler);
    const res = await app.request(
      `/api/link-complete?state=link-token-xyz&ticket=${encodeURIComponent(ticket)}`,
    );
    expect(await res.text()).toContain("Unable to verify");
    expect(store.resolveCount()).toBe(0);
  });

  test("untrusted origin in ticket → 'Unable to verify' and zero store touches", async () => {
    const store = makeStore({
      pending: { discussion_id: "d", surface_user_id: "42" },
    });
    const handler = defaultHandler({ store });
    const ticket = mintCompletionTicket({
      linkToken: "link-token-xyz",
      surfaceUserId: "42",
      idpOrigin: "https://attacker.example",
      secret: SECRET,
      now: NOW,
    });
    const app = makeApp(handler);
    const res = await app.request(
      `/api/link-complete?state=link-token-xyz&ticket=${encodeURIComponent(ticket)}`,
    );
    expect(await res.text()).toContain("Unable to verify");
    expect(store.resolveCount()).toBe(0);
  });

  test("valid ticket, no pending entry → 'Already processed'", async () => {
    const store = makeStore({ pending: null });
    const handler = defaultHandler({ store });
    const ticket = mintCompletionTicket({
      linkToken: "link-token-xyz",
      surfaceUserId: "42",
      idpOrigin: "https://oauth.example",
      secret: SECRET,
      now: NOW,
    });
    const app = makeApp(handler);
    const res = await app.request(
      `/api/link-complete?state=link-token-xyz&ticket=${encodeURIComponent(ticket)}`,
    );
    expect(await res.text()).toContain("Already processed");
    expect(store.resolveCount()).toBe(1);
  });

  test("valid ticket, surface_user_id mismatch → 'Unable to verify' but store touched once", async () => {
    const store = makeStore({
      pending: { discussion_id: "d", surface_user_id: "99" },
      ctx: null,
    });
    const handler = defaultHandler({ store });
    const ticket = mintCompletionTicket({
      linkToken: "link-token-xyz",
      surfaceUserId: "42",
      idpOrigin: "https://oauth.example",
      secret: SECRET,
      now: NOW,
    });
    const app = makeApp(handler);
    const res = await app.request(
      `/api/link-complete?state=link-token-xyz&ticket=${encodeURIComponent(ticket)}`,
    );
    expect(await res.text()).toContain("Unable to verify");
    expect(store.resolveCount()).toBe(1);
  });

  test("valid ticket, matching pending entry → dispatches exactly once", async () => {
    let dispatchCount = 0;
    const handler = createLinkCompleteHandler({
      channel: "github-discussions",
      store: {
        resolvePendingDispatch: async () => ({
          discussion_id: "d-1",
          surface_user_id: "42",
        }),
        loadByChannel: async () => ({
          discussion_id: "d-1",
          history: [{ role: "user", text: "hello", author: "42" }],
        }),
      },
      dispatcher: {
        dispatch: async () => {
          dispatchCount += 1;
          return { kind: "dispatched", token: "t", correlationId: "c" };
        },
      },
      buildCallbackMeta: () => ({}),
      trustedOrigins: TRUSTED,
      ticketSecret: SECRET,
      clock,
    });
    const ticket = mintCompletionTicket({
      linkToken: "link-token-xyz",
      surfaceUserId: "42",
      idpOrigin: "https://oauth.example",
      secret: SECRET,
      now: NOW,
    });
    const app = makeApp(handler);
    const res = await app.request(
      `/api/link-complete?state=link-token-xyz&ticket=${encodeURIComponent(ticket)}`,
    );
    expect(await res.text()).toContain("Processing");
    expect(dispatchCount).toBe(1);
  });

  test("discussion not found returns 404 (after passing verify+resolve)", async () => {
    const handler = createLinkCompleteHandler({
      channel: "github-discussions",
      store: {
        resolvePendingDispatch: async () => ({
          discussion_id: "d-1",
          surface_user_id: "42",
        }),
        loadByChannel: async () => null,
      },
      dispatcher: { dispatch: async () => ({}) },
      buildCallbackMeta: () => ({}),
      trustedOrigins: TRUSTED,
      ticketSecret: SECRET,
      clock,
    });
    const ticket = mintCompletionTicket({
      linkToken: "link-token-xyz",
      surfaceUserId: "42",
      idpOrigin: "https://oauth.example",
      secret: SECRET,
      now: NOW,
    });
    const app = makeApp(handler);
    const res = await app.request(
      `/api/link-complete?state=link-token-xyz&ticket=${encodeURIComponent(ticket)}`,
    );
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("Discussion not found");
  });

  test("dispatch failure renders 'Unable to dispatch'", async () => {
    const handler = createLinkCompleteHandler({
      channel: "github-discussions",
      store: {
        resolvePendingDispatch: async () => ({
          discussion_id: "d-1",
          surface_user_id: "42",
        }),
        loadByChannel: async () => ({
          discussion_id: "d-1",
          history: [{ role: "user", text: "hello", author: "42" }],
        }),
      },
      dispatcher: {
        dispatch: async () => ({
          kind: "link_required",
          authorizeUrl: "http://x",
        }),
      },
      buildCallbackMeta: () => ({}),
      trustedOrigins: TRUSTED,
      ticketSecret: SECRET,
      clock,
    });
    const ticket = mintCompletionTicket({
      linkToken: "link-token-xyz",
      surfaceUserId: "42",
      idpOrigin: "https://oauth.example",
      secret: SECRET,
      now: NOW,
    });
    const app = makeApp(handler);
    const res = await app.request(
      `/api/link-complete?state=link-token-xyz&ticket=${encodeURIComponent(ticket)}`,
    );
    expect(await res.text()).toContain("Unable to dispatch");
  });

  test("multi-party thread: selects the turn authored by the linking user", async () => {
    let capturedPrompt;
    const handler = createLinkCompleteHandler({
      channel: "github-discussions",
      store: {
        resolvePendingDispatch: async () => ({
          discussion_id: "d-1",
          surface_user_id: "42",
        }),
        loadByChannel: async () => ({
          discussion_id: "d-1",
          history: [
            { role: "user", text: "msg from 99", author: "99" },
            { role: "user", text: "msg from 42", author: "42" },
            { role: "user", text: "another from 99", author: "99" },
          ],
        }),
      },
      dispatcher: {
        dispatch: async ({ prompt }) => {
          capturedPrompt = prompt;
          return { kind: "dispatched", token: "t", correlationId: "c" };
        },
      },
      buildCallbackMeta: () => ({}),
      trustedOrigins: TRUSTED,
      ticketSecret: SECRET,
      clock,
    });
    const ticket = mintCompletionTicket({
      linkToken: "link-token-xyz",
      surfaceUserId: "42",
      idpOrigin: "https://oauth.example",
      secret: SECRET,
      now: NOW,
    });
    const app = makeApp(handler);
    await app.request(
      `/api/link-complete?state=link-token-xyz&ticket=${encodeURIComponent(ticket)}`,
    );
    expect(capturedPrompt).toContain("Current message: msg from 42");
  });

  test("missing trustedOrigins to factory throws TypeError", () => {
    expect(() =>
      createLinkCompleteHandler({
        channel: "x",
        store: makeStore(),
        dispatcher: { dispatch: async () => ({}) },
        buildCallbackMeta: () => ({}),
        ticketSecret: SECRET,
        clock,
      }),
    ).toThrow(TypeError);
  });

  test("missing ticketSecret to factory throws TypeError", () => {
    expect(() =>
      createLinkCompleteHandler({
        channel: "x",
        store: makeStore(),
        dispatcher: { dispatch: async () => ({}) },
        buildCallbackMeta: () => ({}),
        trustedOrigins: TRUSTED,
        clock,
      }),
    ).toThrow(TypeError);
  });

  test("missing clock to factory throws TypeError", () => {
    expect(() =>
      createLinkCompleteHandler({
        channel: "x",
        store: makeStore(),
        dispatcher: { dispatch: async () => ({}) },
        buildCallbackMeta: () => ({}),
        trustedOrigins: TRUSTED,
        ticketSecret: SECRET,
      }),
    ).toThrow(TypeError);
  });
});
