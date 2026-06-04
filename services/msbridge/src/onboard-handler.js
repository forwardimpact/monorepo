const CHANNEL = "msteams";

/**
 * Hosted Teams repo-mapping endpoint. After a tenant consents (registered
 * `pending_consent` by the consent handler), the customer maps their
 * target GitHub repository through `POST /onboard`. The handler binds the
 * mapping to the authenticated caller's Microsoft tenant and transitions
 * the tenant to `active`.
 *
 * The caller's identity is signature-bound: `authenticateTenant` returns
 * the verified Microsoft Entra tenant id (`tid` claim) of the request, or
 * `null` when the request is unauthenticated. That `tid` lives in a
 * different id-space than the registry's `tenant_id` (a UUID), so the
 * handler resolves the Entra `tid` to its registry row before writing.
 *
 * The consent handler registered the tenant as `pending_consent`, so an
 * active-only resolve (`ResolveByChannelKey`) would never see it — onboarding
 * is precisely the step that transitions `pending_consent` → `active`. The
 * handler therefore resolves and transitions the row in one state-agnostic
 * upsert: `UpsertByChannelKey({channel: "msteams", channel_tenant_key: tid,
 * state: "active"})` finds the row by `(channel, key)` regardless of state,
 * flips it active, and returns it with its registry `tenant_id` (a UUID). The
 * repo mapping is then written with `SetRepo({tenant_id, repo})`.
 *
 * The request body carries only the repo — a body-supplied registry id is
 * never trusted, and the channel key comes only from the authenticated `tid`,
 * so one tenant cannot onboard a repository on behalf of another.
 *
 * Exposed only in multi-tenant mode.
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

    // The caller's Entra tenant id is signature-bound; an unauthenticated
    // request resolves to null and is refused before any registry read.
    const callerTid = await authenticateTenant(c);
    if (!callerTid) {
      logger?.debug?.("onboard", "unauthenticated caller");
      return c.json({ error: "Unauthenticated" }, 401);
    }

    // Resolve-and-transition the caller's row in one state-agnostic upsert.
    // The consent handler registered the tid as `pending_consent`; onboarding
    // is the step that flips it `active`. An active-only resolve would never
    // see the pending row, so `UpsertByChannelKey` keyed by the authenticated
    // tid finds the row regardless of state, sets it active, and returns its
    // registry `tenant_id` (a UUID) — never a body-supplied value. Semantics:
    // a tid with no prior consent row is created fresh as `active`, because the
    // tid is signature-bound (the caller provably owns that Entra tenant), so
    // self-service onboarding without a prior consent activity is safe.
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
