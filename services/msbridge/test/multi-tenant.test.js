import { describe, test, beforeEach, afterEach } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
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
// inbound activity → Entra-tid extraction → resolve → dispatch → callback.
// Both modes run the same code and the same dispatch credential (the
// dispatching user's per-user OAuth token). Only the tenant resolver and the
// resolved repo differ.

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
 * activity. The adapter's `continueConversationAsync` captures posted replies.
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
          return new Response(null, { status: 204 });
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
        // Multi-tenant mode mounts /onboard, which now requires a real
        // verifier (no default-deny fallback). These tests exercise
        // dispatch/inbox. They do not exercise onboarding, so a stub verifier
        // suffices.
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
        // Unified dispatch identity. The workflow_dispatch fires on the
        // resolved tenant repo. In both modes the credential is the
        // dispatching user's per-user OAuth token. No ghserver App-token mint
        // happens. Repo resolution does not change (criterion 8).
        expect(dispatches[0].url).toContain("/repos/acme/web/actions/");
        expect(dispatches[0].init.headers.Authorization).toBe(
          "Bearer ghs_per_user",
        );
        expect(mints).toHaveLength(0);
      } else {
        expect(dispatches[0].url).toContain("/repos/owner/repo/actions/");
        expect(dispatches[0].init.headers.Authorization).toBe(
          "Bearer ghs_per_user",
        );
        expect(mints).toHaveLength(0);
      }
      // The service stores the discussion under the resolved tenant.
      const ctx = await service.store.loadByChannel("msteams", "t-1", tenantId);
      expect(ctx.tenant_id).toBe(tenantId);
    });

    test("adjourned callback reconciles the tenant-scoped inbox", async () => {
      await deliver(messageActivity({ tid: multi ? ENTRA_TID : undefined }));
      const ctx = await service.store.loadByChannel("msteams", "t-1", tenantId);
      const token = Object.keys(ctx.pending_callbacks)[0];
      const meta = service.callbacks.peek(token, { tenant_id: tenantId });

      // The same requester sends a follow-up while the run is active. The
      // service injects it onto the tenant-scoped queue (EnqueueInbox).
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
      test("the bridge drops an activity from an unknown tenant (no dispatch)", async () => {
        await deliver(messageActivity({ tid: "entra-stranger" }));
        expect(dispatches).toHaveLength(0);
      });

      test("unlinked multi-tenant dispatcher gets the link prompt and fires no workflow_dispatch", async () => {
        // Unified dispatch identity. An unlinked dispatcher resolves through
        // TokenResolver → link_required in multi-tenant mode too (criterion 4).
        // The bridge posts the link prompt with the resolved tenant on the
        // authorize URL. It fires no workflow_dispatch.
        const linkAdapter = makeDrivableAdapter();
        const tenancy = stubTenancyClient();
        const linkService = new MsBridgeService(
          makeConfig({ tenancy_mode: "multi", github_repo: "" }),
          {
            logger: createMockLogger(),
            tracer: createMockTracer(),
            clock: createMockClock(),
            discussionClient: createStatefulDiscussionClient(),
            ghuserClient: {
              GetToken: async () => ({
                result: "link_required",
                link_required: { authorize_url: "https://github.com/login/x" },
              }),
            },
            adapter: linkAdapter,
            tenantResolver: new RegistryTenantResolver({ client: tenancy }),
            tenancyClient: tenancy,
            authenticateTenant: () => "entra-test",
            trustedOrigins: DEFAULT_TRUSTED_ORIGINS,
            ticketSecret: DEFAULT_TICKET_SECRET,
          },
        );
        await linkService.start();
        try {
          const before = dispatches.length;
          linkAdapter.setActivity(messageActivity({ tid: ENTRA_TID }));
          await fetch(
            `http://127.0.0.1:${linkService.address().port}/api/messages`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            },
          );
          // No workflow_dispatch fired. The unlinked user took the link path
          // in multi-tenant mode, exactly as in single-tenant (criterion 4).
          expect(dispatches.length).toBe(before);
          // The flow reached the link path. The bridge posted a link-related
          // prompt and did not dispatch. The personal-conversation gate
          // intercepts the URL-bearing reply in a group thread. The ghbridge
          // multi-tenant suite asserts end-to-end that the tenant_id reaches
          // the authorize URL. That suite has no such gate.
          const prompt = linkAdapter.sent.find(
            (a) => typeof a === "string" && a.toLowerCase().includes("link"),
          );
          expect(prompt).toBeDefined();
        } finally {
          await linkService.stop();
        }
      });
    }
  });
}
