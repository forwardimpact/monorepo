import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { Hono } from "hono";

import { createLinkCompleteHandler } from "../src/link-resume.js";
import {
  mintCompletionTicket,
  TICKET_TTL_MS,
} from "@forwardimpact/libutil/completion-ticket";
import { TRUSTED, SECRET, NOW, clock } from "./link-resume-helpers.js";

describe("createLinkCompleteHandler — ticket verification gates store touch", () => {
  function makeApp(handler) {
    const app = new Hono();
    app.get("/api/link-complete", handler);
    return app;
  }

  function makeStore({ pending = null, ctx = null } = {}) {
    let resolveCount = 0;
    let consumeCount = 0;
    return {
      resolveCount: () => resolveCount,
      consumeCount: () => consumeCount,
      // Mirrors the bridge contract: when expectedSurfaceUserId is provided
      // and the pending row's surface_user_id does not match, the bridge
      // returns `{ unattributable: true }` without consuming the entry.
      resolvePendingDispatch: async (_lt, expectedSurfaceUserId) => {
        resolveCount += 1;
        if (!pending) return null;
        if (
          expectedSurfaceUserId != null &&
          pending.surface_user_id !== expectedSurfaceUserId
        ) {
          return { unattributable: true };
        }
        consumeCount += 1;
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

  test("valid ticket, surface_user_id mismatch → 'Unable to verify' and pending entry is NOT consumed", async () => {
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
    // The bridge gates consume on expectedSurfaceUserId server-side; the
    // attacker call exercises the resolve RPC once but does not consume.
    expect(store.resolveCount()).toBe(1);
    expect(store.consumeCount()).toBe(0);
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
