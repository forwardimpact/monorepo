/**
 * GitHub-channel tenant extraction. The channel-agnostic resolver lives in
 * `libbridge`; this module owns the GitHub-specific step of turning an
 * inbound webhook payload into the `(owner, name)` pair the resolver needs.
 *
 * A single GitHub App installation can cover many repositories. Every
 * webhook delivery names exactly one repository, so the resolver
 * disambiguates which `(installation_id, repo)` row to use by repo —
 * `resolveByRepo` returns the active tenant whose configured target is
 * that repository.
 */

/**
 * Read the `(owner, name)` repository pair from a GitHub webhook payload.
 *
 * @param {object} payload - The parsed webhook delivery body
 * @returns {{owner: string, name: string} | null}
 */
export function extractRepo(payload) {
  const full = payload?.repository?.full_name;
  if (typeof full === "string" && full.includes("/")) {
    const [owner, name] = full.split("/");
    if (owner && name) return { owner, name };
  }
  const owner = payload?.repository?.owner?.login;
  const name = payload?.repository?.name;
  if (typeof owner === "string" && typeof name === "string" && owner && name) {
    return { owner, name };
  }
  return null;
}

/**
 * Resolve the active tenant for a GitHub webhook delivery. Returns `null`
 * when the payload names no repository or when no active tenant owns it
 * (the resolver filters out non-active tenants).
 *
 * @param {object} payload - The parsed webhook delivery body
 * @param {import("@forwardimpact/libbridge").TenantResolver} tenantResolver
 * @returns {Promise<import("@forwardimpact/libbridge").Tenant | null>}
 */
export async function extractTenant(payload, tenantResolver) {
  const repo = extractRepo(payload);
  if (!repo) return null;
  return tenantResolver.resolveByRepo(repo);
}
