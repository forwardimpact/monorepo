import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { sign } from "@octokit/webhooks-methods";
import {
  createMockConfig,
  createMockLogger,
  createMockTracer,
  createMockClock,
} from "@forwardimpact/libmock";
import { RegistryTenantResolver } from "@forwardimpact/libbridge";

import { GhBridgeService } from "../index.js";
import {
  DEFAULT_TICKET_SECRET,
  DEFAULT_TRUSTED_ORIGINS,
  createStatefulDiscussionClient,
} from "./helpers.js";
import { ADD_DISCUSSION_COMMENT_MUTATION } from "../src/graphql.js";

const SECRET = "ghbridge-test-secret-long-enough";

// Full multi-tenant path against the tightened stateful mock. Both modes run
// the same code, the same tenant-scoped store RPCs, and — since spec 1273 — the
// same dispatch credential (the dispatching user's per-user OAuth token via
// services/ghuser). Only the tenant resolver and the resolved repo differ.

/**
 * Stub tenancy client backing a `RegistryTenantResolver`. One active tenant
 * (`uuid-acme`) owns `acme/web` keyed by Entra/install key `acme-key`.
 */
function stubTenancyClient() {
  const tenant = {
    tenant_id: "uuid-acme",
    channel: "github-discussions",
    channel_tenant_key: "acme-key",
    repo: { owner: "acme", name: "web" },
    state: "active",
  };
  return {
    tenant,
    ResolveByRepo: async ({ owner, name }) =>
      owner === "acme" && name === "web" ? tenant : null,
    ResolveByChannelKey: async ({ key }) =>
      key === "acme-key" ? tenant : null,
    ResolveByTenantId: async ({ tenant_id }) =>
      tenant_id === "uuid-acme" ? tenant : null,
    UpsertByPair: async () => ({}),
  };
}

function makeConfig(overrides = {}) {
  return createMockConfig("ghbridge", {
    host: "127.0.0.1",
    port: 0,
    github_repo: overrides.github_repo ?? "owner/repo",
    callback_base_url: "https://bridge.example",
    app_webhook_secret: SECRET,
    ...overrides,
  });
}

function buildFetchHarness() {
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
  return {
    dispatches,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

/**
 * Build a service in single- or multi-tenant mode. Multi-tenant injects a
 * `RegistryTenantResolver` (over the stub tenancy client), a `tenancyClient`,
 * a `ghserverClient` mock (for the reply/reaction path only), and a
 * `makeGraphqlClient` factory so the reply path mints per the resolved tenant
 * repo. Dispatch credential is the per-user OAuth token in both modes.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.multi]
 * @param {object} [opts.tokenResult] Override the ghuser `GetToken` result
 *   (e.g. to exercise the `link_required` path).
 */
async function newService({ multi, tokenResult } = {}) {
  const harness = buildFetchHarness();
  const graphqlCalls = [];
  let commentCounter = 0;
  const mints = [];
  const graphqlClient = async (query, variables) => {
    graphqlCalls.push({ query, variables, repo: "static" });
    if (query.includes("addDiscussionComment")) {
      return {
        addDiscussionComment: {
          comment: { id: `C_${++commentCounter}`, url: "url" },
        },
      };
    }
    return {};
  };
  const makeGraphqlClient = (repo) => async (query, variables) => {
    graphqlCalls.push({ query, variables, repo: `${repo.owner}/${repo.name}` });
    if (query.includes("addDiscussionComment")) {
      return {
        addDiscussionComment: {
          comment: { id: `C_${++commentCounter}`, url: "url" },
        },
      };
    }
    return {};
  };

  const tenancy = multi ? stubTenancyClient() : null;
  const deps = {
    logger: createMockLogger(),
    tracer: createMockTracer(),
    clock: createMockClock(),
    discussionClient: createStatefulDiscussionClient(),
    verifyWebhook: (s, b, sig) =>
      import("@octokit/webhooks-methods").then((m) => m.verify(s, b, sig)),
    getInstallationToken: async () => "ghs_test",
    graphqlClient,
    makeGraphqlClient,
    // Dispatch identity is the per-user OAuth token in both modes (spec 1273).
    // A test may override the result to exercise the link_required path.
    ghuserClient: {
      GetToken: async () =>
        tokenResult ?? { result: "token", token: "ghs_per_user" },
    },
    // Reply/reaction path only; dispatch no longer consults ghserver.
    ghserverClient: {
      MintInstallationToken: async (req) => {
        mints.push(req);
        return { installation_token: "ghs_minted" };
      },
    },
    trustedOrigins: DEFAULT_TRUSTED_ORIGINS,
    ticketSecret: DEFAULT_TICKET_SECRET,
  };
  if (multi) {
    deps.tenantResolver = new RegistryTenantResolver({ client: tenancy });
    deps.tenancyClient = tenancy;
  }
  const service = new GhBridgeService(
    makeConfig(
      multi
        ? { tenancy_mode: "multi", github_repo: "" }
        : { tenancy_mode: "single" },
    ),
    deps,
  );
  await service.start();
  return { service, harness, graphqlCalls, mints, tenancy };
}

function discussionEvent({
  nodeId = "D_kw1",
  body = "rfc",
  repo = "owner/repo",
} = {}) {
  return {
    action: "created",
    discussion: { node_id: nodeId, body, user: { id: 1, login: "u" } },
    repository: { full_name: repo },
  };
}

function commentEvent({
  nodeId = "D_kw1",
  commentId = "C_in",
  repo = "owner/repo",
} = {}) {
  return {
    action: "created",
    discussion: { node_id: nodeId, body: "x", user: { id: 1, login: "u" } },
    comment: { node_id: commentId, body: "more", user: { id: 1, login: "u" } },
    repository: { full_name: repo },
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

async function tokenFor(service, tenantId, discussionId = "D_kw1") {
  const ctx = await service.store.loadByChannel(
    "github-discussions",
    discussionId,
    tenantId,
  );
  return Object.keys(ctx.pending_callbacks)[0];
}

async function postCallback(baseUrl, tenantId, token, body) {
  return fetch(`${baseUrl}/api/callback/${tenantId}/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

for (const mode of ["single", "multi"]) {
  const multi = mode === "multi";
  const tenantId = multi ? "uuid-acme" : "default";
  const inboundRepo = multi ? "acme/web" : "owner/repo";

  describe(`ghbridge multi-tenant path (${mode})`, () => {
    let service;
    let harness;
    let graphqlCalls;
    let mints;
    let baseUrl;

    beforeEach(async () => {
      ({ service, harness, graphqlCalls, mints } = await newService({ multi }));
      baseUrl = `http://127.0.0.1:${service.address().port}`;
    });

    afterEach(async () => {
      await service.stop();
      harness.restore();
    });

    test("inbound discussion resolves, dispatches, and scopes the store by tenant", async () => {
      const res = await postSigned(
        baseUrl,
        "discussion",
        discussionEvent({ repo: inboundRepo }),
      );
      expect(res.status).toBe(200);
      expect(harness.dispatches).toHaveLength(1);
      // The dispatch targets the resolved repo and carries a tenant-scoped
      // callback URL.
      const dispatched = harness.dispatches[0];
      expect(dispatched.url).toContain(`/repos/${inboundRepo}/actions/`);
      const sent = JSON.parse(dispatched.init.body);
      expect(sent.inputs.callback_url).toContain(`/api/callback/${tenantId}/`);
      expect(sent.inputs.inbox_url).toContain(`/api/inbox/${tenantId}/`);
      // The record is stored under the resolved tenant.
      const ctx = await service.store.loadByChannel(
        "github-discussions",
        "D_kw1",
        tenantId,
      );
      expect(ctx).toBeTruthy();
      expect(ctx.tenant_id).toBe(tenantId);
    });

    test("adjourned callback posts replies on the resolved repo via the reply path", async () => {
      await postSigned(
        baseUrl,
        "discussion",
        discussionEvent({ repo: inboundRepo }),
      );
      const token = await tokenFor(service, tenantId);
      const meta = service.callbacks.peek(token, { tenant_id: tenantId });
      const res = await postCallback(baseUrl, tenantId, token, {
        correlation_id: meta.correlationId,
        verdict: "adjourned",
        summary: "done",
        replies: [{ body: "answer" }],
      });
      expect(res.status).toBe(200);
      const commentCalls = graphqlCalls.filter(
        (c) => c.query === ADD_DISCUSSION_COMMENT_MUTATION,
      );
      expect(commentCalls).toHaveLength(1);
      // Multi-tenant mints for the resolved repo; single-tenant uses the
      // static client.
      expect(commentCalls[0].repo).toBe(multi ? inboundRepo : "static");
    });

    test("self-originated comment (HasOrigin/RecordOrigin) is skipped per tenant", async () => {
      // First dispatch + adjourn so the bridge records an origin for its reply.
      await postSigned(
        baseUrl,
        "discussion",
        discussionEvent({ repo: inboundRepo }),
      );
      const token = await tokenFor(service, tenantId);
      const meta = service.callbacks.peek(token, { tenant_id: tenantId });
      await postCallback(baseUrl, tenantId, token, {
        correlation_id: meta.correlationId,
        verdict: "adjourned",
        summary: "",
        replies: [{ body: "the bridge's own reply" }],
      });
      const before = harness.dispatches.length;
      const commentCalls = graphqlCalls.filter(
        (c) => c.query === ADD_DISCUSSION_COMMENT_MUTATION,
      );
      const postedCommentId = `C_${commentCalls.length}`;
      // A webhook for the comment the bridge itself posted must be recognized
      // as self-originated and dropped (204) — no re-dispatch.
      const res = await postSigned(
        baseUrl,
        "discussion_comment",
        commentEvent({ commentId: postedCommentId, repo: inboundRepo }),
      );
      expect(res.status).toBe(204);
      expect(harness.dispatches.length).toBe(before);
    });

    test("inbox inject + reconcile round-trips on the tenant-scoped queue", async () => {
      // Dispatch a fresh run. The dispatcher sets active_requester and a
      // pending callback, so a follow-up comment from the same requester is
      // injected into the run's inbox rather than re-dispatched.
      await postSigned(
        baseUrl,
        "discussion",
        discussionEvent({ repo: inboundRepo }),
      );
      const token = await tokenFor(service, tenantId);
      const meta = service.callbacks.peek(token, { tenant_id: tenantId });

      const inject = await postSigned(
        baseUrl,
        "discussion_comment",
        commentEvent({ repo: inboundRepo }),
      );
      expect(inject.status).toBe(200);
      const injectedBody = await inject.json();
      expect(injectedBody.injected).toBe(true);

      // The message landed on the tenant-scoped queue (EnqueueInbox). A
      // terminal callback for the open correlation drains it (DrainInbox) and
      // re-dispatches the unconsumed message.
      const before = harness.dispatches.length;
      await postCallback(baseUrl, tenantId, token, {
        correlation_id: meta.correlationId,
        verdict: "adjourned",
        summary: "",
        replies: [{ body: "ok" }],
        last_acted_seq: -1,
      });
      expect(harness.dispatches.length).toBe(before + 1);
    });

    if (multi) {
      test("a delivery from an unknown tenant is dropped (204)", async () => {
        const res = await postSigned(
          baseUrl,
          "discussion",
          discussionEvent({ repo: "stranger/repo" }),
        );
        expect(res.status).toBe(204);
        expect(harness.dispatches).toHaveLength(0);
      });

      test("hosted dispatch uses the per-user OAuth token, not a ghserver App-token mint", async () => {
        // Unified dispatch identity (spec 1273): hosted mode dispatches with
        // the dispatching user's per-user OAuth token on the resolved tenant
        // repo. No ghserver App-token mint happens for dispatch — the
        // reply/reaction path keeps its own ghserver credential.
        const res = await postSigned(
          baseUrl,
          "discussion",
          discussionEvent({ repo: inboundRepo }),
        );
        expect(res.status).toBe(200);
        expect(harness.dispatches).toHaveLength(1);
        const dispatched = harness.dispatches[0];
        expect(dispatched.url).toContain(`/repos/${inboundRepo}/actions/`);
        expect(dispatched.init.headers.Authorization).toBe(
          "Bearer ghs_per_user",
        );
        // Dispatch consults no ghserver mint.
        expect(mints).toHaveLength(0);
        const ctx = await service.store.loadByChannel(
          "github-discussions",
          "D_kw1",
          tenantId,
        );
        expect(Object.keys(ctx.pending_callbacks)).toHaveLength(1);
      });

      test("unlinked multi-tenant dispatcher gets the link prompt, fires no workflow_dispatch", async () => {
        // An unlinked dispatcher resolves through TokenResolver → link_required
        // in multi-tenant mode too (criterion 4). The bridge posts the link
        // prompt on the resolved repo and writes the pending row under the
        // resolved tenant — proving the tenant carrier threads through.
        const built = await newService({
          multi: true,
          tokenResult: {
            result: "link_required",
            link_required: { authorize_url: "https://github.com/login/x" },
          },
        });
        const linkBaseUrl = `http://127.0.0.1:${built.service.address().port}`;
        try {
          const res = await postSigned(
            linkBaseUrl,
            "discussion",
            discussionEvent({ repo: inboundRepo }),
          );
          expect(res.status).toBe(200);
          expect(built.harness.dispatches).toHaveLength(0);
          const commentCalls = built.graphqlCalls.filter(
            (c) => c.query === ADD_DISCUSSION_COMMENT_MUTATION,
          );
          expect(commentCalls).toHaveLength(1);
          expect(commentCalls[0].variables.i.body).toContain("tenant_id=");
        } finally {
          await built.service.stop();
          built.harness.restore();
        }
      });
    }
  });
}
