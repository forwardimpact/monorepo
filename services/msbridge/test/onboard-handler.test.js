import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { createOnboardHandler } from "../src/onboard-handler.js";
import { createOnboardVerifier } from "../src/onboard-verifier.js";
import { handleConsent } from "../src/consent-handler.js";

function fakeContext(body, authHeader) {
  return {
    req: {
      json: async () => body,
      header: (name) =>
        name?.toLowerCase() === "authorization" ? authHeader : undefined,
    },
    json: (payload, status) => ({ payload, status: status ?? 200 }),
  };
}

/**
 * Bot Framework authenticator stub for the end-to-end verifier integration:
 * returns a `ClaimsIdentity`-shaped object carrying `tid`, or throws to model
 * a forged token.
 */
function fakeAuth({ tid, throws = false } = {}) {
  return {
    authenticateChannelRequest() {
      if (throws) throw new Error("token validation failed");
      return Promise.resolve({
        isAuthenticated: true,
        getClaimValue: (claim) => (claim === "tid" ? tid : null),
      });
    },
  };
}

/**
 * Faithful tenancy stub mirroring the real `services/tenancy` contract. Rows
 * are keyed by `(channel, channel_tenant_key)` — the Entra `tid` — and carry a
 * distinct registry `tenant_id` (a UUID), the id-space split the onboarding
 * contract must bridge. The handler must never write to a body-supplied id.
 *
 * `UpsertByChannelKey` finds the row by `(channel, channel_tenant_key)`
 * STATE-AGNOSTICALLY (so it sees a `pending_consent` row), updates its state,
 * and returns it with a stable `tenant_id`; if none exists it creates one.
 * This is the contract `onboard-handler` relies on to transition
 * `pending_consent` → `active`.
 *
 * @param {Array<{channel_tenant_key: string, tenant_id: string, state: string}>} [seed]
 *   Pre-existing rows (e.g. a consent-registered `pending_consent` row).
 */
function fakeTenancyClient(seed = []) {
  const calls = { setRepo: [], upsert: [] };
  let nextUuid = 0;
  const rows = seed.map((r) => ({ channel: "msteams", ...r }));
  return {
    calls,
    rows,
    // ACTIVE-ONLY, mirroring services/tenancy: a pending_consent row is
    // invisible here. Pre-fix onboard used this and 404'd on a pending row.
    ResolveByChannelKey: async ({ channel, key }) => {
      const row = rows.find(
        (r) =>
          r.channel === channel &&
          r.channel_tenant_key === key &&
          r.state === "active",
      );
      return row ? { ...row } : null;
    },
    UpsertByChannelKey: async (req) => {
      calls.upsert.push(req);
      const existing = rows.find(
        (r) =>
          r.channel === req.channel &&
          r.channel_tenant_key === req.channel_tenant_key,
      );
      if (existing) {
        existing.state = req.state;
        return { ...existing };
      }
      const created = {
        tenant_id: `uuid-${++nextUuid}`,
        channel: req.channel,
        channel_tenant_key: req.channel_tenant_key,
        state: req.state,
      };
      rows.push(created);
      return { ...created };
    },
    SetRepo: async (req) => {
      calls.setRepo.push(req);
      const row = rows.find((r) => r.tenant_id === req.tenant_id);
      if (row) row.repo = req.repo;
      return { tenant_id: req.tenant_id, repo: req.repo };
    },
  };
}

describe("msbridge onboard handler", () => {
  test("constructor requires authenticateTenant and tenancyClient", () => {
    expect(() =>
      createOnboardHandler({ tenancyClient: fakeTenancyClient() }),
    ).toThrow("authenticateTenant is required");
    expect(() =>
      createOnboardHandler({ authenticateTenant: () => null }),
    ).toThrow("tenancyClient is required");
  });

  test("transitions a pending_consent row to active and sets repo on its registry UUID", async () => {
    // The caller authenticates as Entra tid "entra-acme"; the consent handler
    // already registered that tid as a pending_consent row carrying a distinct
    // UUID "uuid-acme". Onboarding must SEE that pending row (state-agnostic)
    // and flip it active — an active-only resolve would 404 here, which is the
    // C1 bug the faithful stub now catches.
    const tenancyClient = fakeTenancyClient([
      {
        channel_tenant_key: "entra-acme",
        tenant_id: "uuid-acme",
        state: "pending_consent",
      },
    ]);
    const onboard = createOnboardHandler({
      authenticateTenant: () => "entra-acme",
      tenancyClient,
    });
    const res = await onboard(
      fakeContext({ repo: { owner: "acme", name: "web" } }),
    );
    expect(res.status).toBe(200);
    expect(res.payload).toEqual({ ok: true });
    // The upsert keyed by the authenticated tid flipped the row active.
    expect(tenancyClient.calls.upsert).toEqual([
      {
        channel: "msteams",
        channel_tenant_key: "entra-acme",
        state: "active",
      },
    ]);
    expect(tenancyClient.rows[0].state).toBe("active");
    // The repo write targets the resolved UUID, never the Entra tid.
    expect(tenancyClient.calls.setRepo).toEqual([
      { tenant_id: "uuid-acme", repo: { owner: "acme", name: "web" } },
    ]);
  });

  test("a body-supplied registry id cannot redirect the write", async () => {
    const tenancyClient = fakeTenancyClient([
      {
        channel_tenant_key: "entra-acme",
        tenant_id: "uuid-acme",
        state: "pending_consent",
      },
    ]);
    const onboard = createOnboardHandler({
      authenticateTenant: () => "entra-acme",
      tenancyClient,
    });
    // Attacker tries to bind a repo onto another tenant's UUID via the body.
    const res = await onboard(
      fakeContext({
        tenant_id: "uuid-victim",
        repo: { owner: "acme", name: "web" },
      }),
    );
    expect(res.status).toBe(200);
    // The key came from the authenticated tid; the body's tenant_id is ignored.
    expect(tenancyClient.calls.upsert[0].channel_tenant_key).toBe("entra-acme");
    expect(tenancyClient.calls.setRepo[0].tenant_id).toBe("uuid-acme");
  });

  test("unauthenticated caller is rejected with 401 and writes nothing", async () => {
    const tenancyClient = fakeTenancyClient([
      {
        channel_tenant_key: "entra-acme",
        tenant_id: "uuid-acme",
        state: "pending_consent",
      },
    ]);
    const onboard = createOnboardHandler({
      authenticateTenant: () => null,
      tenancyClient,
    });
    const res = await onboard(
      fakeContext({ repo: { owner: "acme", name: "web" } }),
    );
    expect(res.status).toBe(401);
    expect(tenancyClient.calls.upsert.length).toBe(0);
    expect(tenancyClient.calls.setRepo.length).toBe(0);
  });

  test("an authenticated tid with no prior consent is created fresh as active", async () => {
    // Chosen semantics: onboarding without a prior consent activity is allowed
    // because the tid is signature-bound. The upsert creates a fresh active row
    // and the repo binds to its newly minted UUID.
    const tenancyClient = fakeTenancyClient();
    const onboard = createOnboardHandler({
      authenticateTenant: () => "entra-fresh",
      tenancyClient,
    });
    const res = await onboard(
      fakeContext({ repo: { owner: "acme", name: "web" } }),
    );
    expect(res.status).toBe(200);
    expect(tenancyClient.rows).toHaveLength(1);
    expect(tenancyClient.rows[0].state).toBe("active");
    expect(tenancyClient.calls.setRepo[0].tenant_id).toBe(
      tenancyClient.rows[0].tenant_id,
    );
  });

  test("missing repo is rejected with 400 before any registry write", async () => {
    const tenancyClient = fakeTenancyClient([
      {
        channel_tenant_key: "entra-acme",
        tenant_id: "uuid-acme",
        state: "pending_consent",
      },
    ]);
    const onboard = createOnboardHandler({
      authenticateTenant: () => "entra-acme",
      tenancyClient,
    });
    const res = await onboard(fakeContext({}));
    expect(res.status).toBe(400);
    expect(tenancyClient.calls.upsert.length).toBe(0);
  });

  // End-to-end against the faithful stub contract: consent registers
  // pending_consent, then onboard transitions the SAME row to active and binds
  // the repo. Pre-fix onboard used the active-only ResolveByChannelKey, which
  // could never see the pending row → 404. This proves the C1 fix.
  test("consent then onboard transitions the same row to active with a repo", async () => {
    const tenancyClient = fakeTenancyClient();
    await handleConsent(
      {
        type: "installationUpdate",
        action: "add",
        channelData: { tenant: { id: "entra-acme" } },
      },
      { tenancyClient },
    );
    expect(tenancyClient.rows).toHaveLength(1);
    expect(tenancyClient.rows[0].state).toBe("pending_consent");
    const uuid = tenancyClient.rows[0].tenant_id;

    const onboard = createOnboardHandler({
      authenticateTenant: () => "entra-acme",
      tenancyClient,
    });
    const res = await onboard(
      fakeContext({ repo: { owner: "acme", name: "web" } }),
    );
    expect(res.status).toBe(200);
    // Same row, now active, with the repo bound to its UUID.
    expect(tenancyClient.rows).toHaveLength(1);
    expect(tenancyClient.rows[0].state).toBe("active");
    expect(tenancyClient.rows[0].tenant_id).toBe(uuid);
    expect(tenancyClient.rows[0].repo).toEqual({ owner: "acme", name: "web" });
  });
});

// End-to-end through the real Bot Framework verifier (over a fake authenticator):
// proves criterion 5's trio — a cryptographically proven tid onboards; a forged
// or absent proof returns 401 with no registry write.
describe("msbridge onboard handler with the Bot Framework verifier", () => {
  test("a proven tid transitions the tenant active and maps its repo", async () => {
    const tenancyClient = fakeTenancyClient([
      {
        channel_tenant_key: "entra-acme",
        tenant_id: "uuid-acme",
        state: "pending_consent",
      },
    ]);
    const onboard = createOnboardHandler({
      authenticateTenant: createOnboardVerifier(
        fakeAuth({ tid: "entra-acme" }),
      ),
      tenancyClient,
    });
    const res = await onboard(
      fakeContext(
        { repo: { owner: "acme", name: "web" } },
        "Bearer proven.jwt",
      ),
    );
    expect(res.status).toBe(200);
    expect(tenancyClient.rows[0].state).toBe("active");
    expect(tenancyClient.calls.setRepo).toEqual([
      { tenant_id: "uuid-acme", repo: { owner: "acme", name: "web" } },
    ]);
  });

  test("a forged proof returns 401 and writes nothing", async () => {
    const tenancyClient = fakeTenancyClient([
      {
        channel_tenant_key: "entra-acme",
        tenant_id: "uuid-acme",
        state: "pending_consent",
      },
    ]);
    const onboard = createOnboardHandler({
      authenticateTenant: createOnboardVerifier(fakeAuth({ throws: true })),
      tenancyClient,
    });
    const res = await onboard(
      fakeContext(
        { repo: { owner: "acme", name: "web" } },
        "Bearer forged.jwt",
      ),
    );
    expect(res.status).toBe(401);
    expect(tenancyClient.calls.upsert.length).toBe(0);
    expect(tenancyClient.calls.setRepo.length).toBe(0);
  });

  test("an absent proof returns 401 and writes nothing", async () => {
    const tenancyClient = fakeTenancyClient([
      {
        channel_tenant_key: "entra-acme",
        tenant_id: "uuid-acme",
        state: "pending_consent",
      },
    ]);
    const onboard = createOnboardHandler({
      authenticateTenant: createOnboardVerifier(
        fakeAuth({ tid: "entra-acme" }),
      ),
      tenancyClient,
    });
    const res = await onboard(
      fakeContext({ repo: { owner: "acme", name: "web" } }, undefined),
    );
    expect(res.status).toBe(401);
    expect(tenancyClient.calls.upsert.length).toBe(0);
    expect(tenancyClient.calls.setRepo.length).toBe(0);
  });
});
