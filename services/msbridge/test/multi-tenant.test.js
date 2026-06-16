import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  createMockLogger,
  createMockTracer,
  createMockClock,
} from "@forwardimpact/libmock";
import { RegistryTenantResolver } from "@forwardimpact/libbridge";

import { MsBridgeService } from "../index.js";
import {
  makeConfig,
  makeAdapter,
  makeGhuserClient,
} from "./msbridge-helpers.js";
import {
  DEFAULT_TICKET_SECRET,
  DEFAULT_TRUSTED_ORIGINS,
  createStatefulDiscussionClient,
} from "./helpers.js";

// Full multi-tenant path for msbridge against the tightened stateful mock:
// inbound activity → Entra-tid extraction → resolve → ghserver mint → dispatch
// → callback. Both modes run the same code; only the resolver and dispatch
// credential differ. Each assertion fails against pre-fix code (raw inbox
// callers omitted tenant_id; msbridge multi used per-user OAuth instead of the
// ghserver-minted App token).

const ENTRA_TID = "entra-acme";

function stubTenancyClient() {
  const tenant = {
    tenant_id: "uuid-acme",
    channel: "msteams",
    channel_tenant_key: ENTRA_TID,
    repo: { owner: "acme", name: "web" },
    state: "active",
  };
  return {
    tenant,
    ResolveByChannelKey: async ({ key }) => (key === ENTRA_TID ? tenant : null),
    ResolveByRepo: async ({ owner, name }) =>
      owner === "acme" && name === "web" ? tenant : null,
    ResolveByTenantId: async ({ tenant_id }) =>
      tenant_id === "uuid-acme" ? tenant : null,
  };
}

/**
 * Build an adapter whose `process` drives `#handleNewMessage` with a supplied
 * activity, and whose `continueConversationAsync` captures posted replies.
 */
function makeDrivableAdapter() {
  const sent = [];
  let current = null;
  const adapter = {
    sent,
    setActivity(activity) {
      current = activity;
    },
    process: async (_req, res, callback) => {
      const turnContext = {
        activity: current,
        sendActivity: async (a) => sent.push(a),
      };
      await callback(turnContext);
      if (res && !res.headersSent) res.status(200).end();
    },
    continueConversationAsync: async (_appId, _ref, callback) => {
      await callback({ sendActivity: async (a) => sent.push(a) });
    },
    onTurnError: null,
  };
  return adapter;
}

function messageActivity({
  threadId = "t-1",
  text = "hi",
  userId = "u1",
  tid,
} = {}) {
  return {
    type: "message",
    text,
    from: { id: userId },
    conversation: { id: threadId },
    channelData: tid ? { tenant: { id: tid } } : {},
    id: "act-1",
  };
}

for (const mode of ["single", "multi"]) {
  const multi = mode === "multi";
  const tenantId = multi ? "uuid-acme" : "default";

  describe(`msbridge multi-tenant path (${mode})`, () => {
    let service;
    let adapter;
    let baseUrl;
    let dispatches;
    let mints;
    let restoreFetch;

    beforeEach(async () => {
      dispatches = [];
      mints = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, init) => {
        const target = String(url);
        if (target.startsWith("https://api.github.com/")) {
          dispatches.push({ url: target, init });
          return new Response("{}", { status: 204 });
        }
        return originalFetch(url, init);
      };
      restoreFetch = () => {
        globalThis.fetch = originalFetch;
      };

      adapter = makeDrivableAdapter();
      const tenancy = multi ? stubTenancyClient() : null;
      const deps = {
        logger: createMockLogger(),
        tracer: createMockTracer(),
        clock: createMockClock(),
        discussionClient: createStatefulDiscussionClient(),
        ghuserClient: makeGhuserClient(),
        adapter,
        trustedOrigins: DEFAULT_TRUSTED_ORIGINS,
        ticketSecret: DEFAULT_TICKET_SECRET,
      };
      if (multi) {
        deps.tenantResolver = new RegistryTenantResolver({ client: tenancy });
        deps.tenancyClient = tenancy;
        deps.ghserverClient = {
          MintInstallationToken: async (req) => {
            mints.push(req);
            return { installation_token: "ghs_minted" };
          },
        };
        // Multi-tenant mounts /onboard, which now requires a real verifier
        // (no default-deny fallback). These tests exercise dispatch/inbox, not
        // onboarding, so a stub verifier suffices.
        deps.authenticateTenant = () => "entra-test";
      }
      service = new MsBridgeService(
        makeConfig(
          multi
            ? { tenancy_mode: "multi", github_repo: "" }
            : { tenancy_mode: "single" },
        ),
        deps,
      );
      await service.start();
      baseUrl = `http://127.0.0.1:${service.address().port}`;
    });

    afterEach(async () => {
      await service.stop();
      restoreFetch();
    });

    async function deliver(activity) {
      adapter.setActivity(activity);
      return fetch(`${baseUrl}/api/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    }

    test("inbound activity resolves the tenant, mints, and dispatches the resolved repo", async () => {
      await deliver(messageActivity({ tid: multi ? ENTRA_TID : undefined }));
      expect(dispatches).toHaveLength(1);
      const sent = JSON.parse(dispatches[0].init.body);
      expect(sent.inputs.callback_url).toContain(`/api/callback/${tenantId}/`);
      expect(sent.inputs.inbox_url).toContain(`/api/inbox/${tenantId}/`);
      if (multi) {
        // Hosted dispatch identity: the workflow_dispatch fires on the
        // resolved tenant repo with the ghserver-minted App token, not the
        // per-user OAuth token.
        expect(dispatches[0].url).toContain("/repos/acme/web/actions/");
        expect(dispatches[0].init.headers.Authorization).toBe(
          "Bearer ghs_minted",
        );
        expect(mints).toEqual([
          { owner: "acme", name: "web", requested_by: "msbridge" },
        ]);
      } else {
        expect(dispatches[0].url).toContain("/repos/owner/repo/actions/");
        expect(dispatches[0].init.headers.Authorization).toBe(
          "Bearer ghs_per_user",
        );
        expect(mints).toHaveLength(0);
      }
      // The discussion is stored under the resolved tenant.
      const ctx = await service.store.loadByChannel("msteams", "t-1", tenantId);
      expect(ctx.tenant_id).toBe(tenantId);
    });

    test("adjourned callback reconciles the tenant-scoped inbox", async () => {
      await deliver(messageActivity({ tid: multi ? ENTRA_TID : undefined }));
      const ctx = await service.store.loadByChannel("msteams", "t-1", tenantId);
      const token = Object.keys(ctx.pending_callbacks)[0];
      const meta = service.callbacks.peek(token, { tenant_id: tenantId });

      // Same requester sends a follow-up while the run is active → injected
      // onto the tenant-scoped queue (EnqueueInbox).
      await deliver(
        messageActivity({ text: "more", tid: multi ? ENTRA_TID : undefined }),
      );

      const before = dispatches.length;
      const res = await fetch(`${baseUrl}/api/callback/${tenantId}/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correlation_id: meta.correlationId,
          verdict: "adjourned",
          summary: "",
          replies: [{ body: "ok" }],
          last_acted_seq: -1,
        }),
      });
      expect(res.status).toBe(200);
      // DrainInbox found the injected message and re-dispatched it.
      expect(dispatches.length).toBe(before + 1);
    });

    if (multi) {
      test("an activity from an unknown tenant is dropped (no dispatch)", async () => {
        await deliver(messageActivity({ tid: "entra-stranger" }));
        expect(dispatches).toHaveLength(0);
      });
    }
  });
}
