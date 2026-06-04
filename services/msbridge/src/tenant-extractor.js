const CHANNEL = "msteams";

/**
 * Microsoft Teams tenant extraction. The channel-agnostic resolver lives
 * in `libbridge`; this module owns the Teams-specific step of reading the
 * Entra tenant id from an inbound Bot Framework activity.
 *
 * Every activity carries `channelData.tenant.id`. The resolver maps that
 * channel tenant key to an active tenant; activities from `pending_consent`
 * tenants resolve to `null` (the resolver filters out non-active tenants),
 * so a tenant that consented but has not finished onboarding cannot
 * dispatch.
 */

/**
 * Read the Entra tenant id from a Bot Framework activity.
 *
 * @param {object} activity
 * @returns {string | null}
 */
export function extractTenantKey(activity) {
  const id = activity?.channelData?.tenant?.id;
  return typeof id === "string" && id ? id : null;
}

/**
 * Resolve the active tenant for an inbound Bot Framework activity. Returns
 * `null` when the activity carries no tenant id or when no active tenant
 * owns it.
 *
 * @param {object} activity
 * @param {import("@forwardimpact/libbridge").TenantResolver} tenantResolver
 * @returns {Promise<import("@forwardimpact/libbridge").Tenant | null>}
 */
export async function extractTenant(activity, tenantResolver) {
  const key = extractTenantKey(activity);
  if (!key) return null;
  return tenantResolver.resolve({ channel: CHANNEL, key });
}
