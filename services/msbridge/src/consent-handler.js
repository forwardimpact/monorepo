const CHANNEL = "msteams";

/**
 * Microsoft Teams consent onboarding. When the hosted Teams app is added
 * to a Microsoft Entra tenant, the Bot Framework fires an
 * `installationUpdate` activity with `action = "add"`. This handler
 * registers the tenant in the registry with `state = "pending_consent"` —
 * the repo mapping is set later through the hosted onboarding endpoint
 * (see `onboard-handler.js`), which transitions the tenant to `active`.
 *
 * The registry upsert is idempotent per channel key, so a redelivered
 * `installationUpdate` is safe.
 */

/**
 * Whether a Bot Framework activity is a consent (`installationUpdate` /
 * `action = "add"`) onboarding signal.
 *
 * @param {object} activity
 * @returns {boolean}
 */
export function isConsentActivity(activity) {
  return activity?.type === "installationUpdate" && activity?.action === "add";
}

/**
 * Register the consenting tenant in the registry as `pending_consent`.
 *
 * @param {object} activity - The Bot Framework activity
 * @param {object} deps
 * @param {{UpsertByChannelKey: (req: {channel: string, channel_tenant_key: string, state: string}) => Promise<object>}} deps.tenancyClient
 * @param {{debug?: Function, info?: Function}} [deps.logger]
 * @returns {Promise<{registered: boolean}>}
 */
export async function handleConsent(activity, { tenancyClient, logger }) {
  const channelTenantKey = activity?.channelData?.tenant?.id;
  if (typeof channelTenantKey !== "string" || !channelTenantKey) {
    logger?.debug?.("consent", "activity without tenant id");
    return { registered: false };
  }
  await tenancyClient.UpsertByChannelKey({
    channel: CHANNEL,
    channel_tenant_key: channelTenantKey,
    state: "pending_consent",
  });
  logger?.info?.("consent", "registered tenant", {
    channel_tenant_key: channelTenantKey,
  });
  return { registered: true };
}
