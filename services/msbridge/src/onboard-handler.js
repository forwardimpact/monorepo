const CHANNEL = "msteams";

/**
 * Hosted Teams repo-mapping endpoint. After a tenant consents, the consent
 * handler registers it as `pending_consent`. The customer then maps their
 * target GitHub repository through `POST /onboard`. The handler binds the
 * mapping to the authenticated caller's Microsoft tenant. It then
 * transitions the tenant to `active`.
 *
 * A signature binds the caller's identity. `authenticateTenant` returns
 * the verified Microsoft Entra tenant id (`tid` claim) of the request. It
 * returns `null` when the request is unauthenticated. That `tid` lives in a
 * different id-space than the registry's `tenant_id` (a UUID). So the
 * handler resolves the Entra `tid` to its registry row before it writes.
 *
 * The consent handler registered the tenant as `pending_consent`, so an
 * active-only resolve (`ResolveByChannelKey`) would never see it. Onboarding
 * is precisely the step that transitions `pending_consent` → `active`. So the
 * handler resolves and transitions the row in one state-agnostic upsert.
 * `UpsertByChannelKey({channel: "msteams", channel_tenant_key: tid,
 * state: "active"})` finds the row by `(channel, key)` regardless of state.
 * It flips the row active. It returns the row with its registry `tenant_id`
 * (a UUID). The handler then writes the repo mapping with
 * `SetRepo({tenant_id, repo})`.
 *
 * The request body carries only the repo. The handler never trusts a
 * body-supplied registry id. The channel key comes only from the
 * authenticated `tid`. So one tenant cannot onboard a repository on behalf
 * of another.
 *
 * Only multi-tenant mode exposes this endpoint.
 */

/**
 * Build the `POST /onboard` Hono handler.
 *
 * @param {object} deps
 * @param {(c: object) => Promise<string | null> | (string | null)} deps.authenticateTenant
 *   Returns the verified Microsoft Entra tenant id (`tid`) of the caller, or null.
 * @param {{
 *   UpsertByChannelKey: (req: {channel: string, channel_tenant_key: string, state: string}) => Promise<object>,
 *   SetRepo: Function,
 * }} deps.tenancyClient
 * @param {{debug?: Function, info?: Function}} [deps.logger]
 * @returns {(c: object) => Promise<Response>}
 */
export function createOnboardHandler({
  authenticateTenant,
  tenancyClient,
  logger,
}) {
  if (typeof authenticateTenant !== "function") {
    throw new Error("authenticateTenant is required");
  }
  if (!tenancyClient) throw new Error("tenancyClient is required");

  return async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const owner = body?.repo?.owner;
    const name = body?.repo?.name;
    if (
      typeof owner !== "string" ||
      !owner ||
      typeof name !== "string" ||
      !name
    ) {
      return c.json({ error: "repo is required" }, 400);
    }

    // A signature binds the caller's Entra tenant id. An unauthenticated
    // request resolves to null. The handler refuses it before any registry
    // read.
    const callerTid = await authenticateTenant(c);
    if (!callerTid) {
      logger?.debug?.("onboard", "unauthenticated caller");
      return c.json({ error: "Unauthenticated" }, 401);
    }

    // Resolve-and-transition the caller's row in one state-agnostic upsert.
    // The consent handler registered the tid as `pending_consent`. Onboarding
    // is the step that flips it `active`. An active-only resolve would never
    // see the pending row. So `UpsertByChannelKey` keyed by the authenticated
    // tid finds the row regardless of state, sets it active, and returns its
    // registry `tenant_id` (a UUID). It never returns a body-supplied value.
    // Note the semantics. The upsert creates a tid with no prior consent row
    // fresh as `active`. A signature binds the tid, so the caller provably
    // owns that Entra tenant. So self-service onboarding with no prior
    // consent activity is safe.
    const row = await tenancyClient.UpsertByChannelKey({
      channel: CHANNEL,
      channel_tenant_key: callerTid,
      state: "active",
    });
    const tenantId = row?.tenant_id;
    if (!tenantId) {
      logger?.debug?.("onboard", "registry upsert returned no tenant id", {
        channel_tenant_key: callerTid,
      });
      return c.json({ error: "Tenant registration failed" }, 500);
    }

    await tenancyClient.SetRepo({ tenant_id: tenantId, repo: { owner, name } });
    logger?.info?.("onboard", "tenant onboarded", { tenant_id: tenantId });
    return c.json({ ok: true }, 200);
  };
}
