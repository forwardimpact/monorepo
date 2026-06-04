/**
 * GitHub App onboarding. When the hosted App is installed on an
 * organization or repository, or when repositories are added to an
 * existing installation, GitHub fires `installation.created` /
 * `installation.repositories_added`. This handler registers each named
 * repository in the tenant registry so subsequent user events resolve to
 * an active tenant without operator intervention.
 *
 * The registry upsert is idempotent per `(installation_id, repo)` pair, so
 * a redelivered webhook or an `installation.created` that races a
 * `repositories_added` for the same repo set is safe.
 *
 * The uninstall / `repositories_removed` revoke path is not handled here;
 * a partial uninstall leaves the `active` row in place. See
 * `services/ghbridge/README.md`.
 */

const INSTALL_EVENTS = new Set(["installation", "installation_repositories"]);

/**
 * Pull the list of repositories named by an install-class webhook.
 * `installation.created` carries `repositories`; `repositories_added`
 * carries `repositories_added`.
 *
 * @param {object} payload
 * @returns {Array<{owner: string, name: string}>}
 */
function reposFromPayload(payload) {
  const list = payload?.repositories ?? payload?.repositories_added ?? [];
  const out = [];
  for (const r of list) {
    const full = r?.full_name;
    if (typeof full === "string" && full.includes("/")) {
      const [owner, name] = full.split("/");
      if (owner && name) out.push({ owner, name });
    }
  }
  return out;
}

/**
 * Whether a webhook delivery is an install-class onboarding event this
 * handler should consume.
 *
 * @param {string} event - The `x-github-event` header value
 * @param {object} payload
 * @returns {boolean}
 */
export function isInstallEvent(event, payload) {
  if (!INSTALL_EVENTS.has(event)) return false;
  const action = payload?.action;
  return action === "created" || action === "added";
}

/**
 * Register every repository named by an install-class webhook in the
 * tenant registry. Each call upserts `(installation_id, owner, name)` with
 * `state = "active"`.
 *
 * @param {object} payload - The parsed webhook delivery body
 * @param {object} deps
 * @param {{UpsertByPair: (req: {installation_id: string, owner: string, name: string}) => Promise<object>}} deps.tenancyClient
 * @param {{debug?: Function, info?: Function}} [deps.logger]
 * @returns {Promise<{upserted: number}>}
 */
export async function handleInstall(payload, { tenancyClient, logger }) {
  const installationId = payload?.installation?.id;
  if (installationId == null) {
    logger?.debug?.("install", "delivery without installation id");
    return { upserted: 0 };
  }
  const repos = reposFromPayload(payload);
  let upserted = 0;
  for (const { owner, name } of repos) {
    await tenancyClient.UpsertByPair({
      installation_id: String(installationId),
      owner,
      name,
    });
    upserted++;
  }
  logger?.info?.("install", "registered repositories", {
    installation_id: String(installationId),
    upserted,
  });
  return { upserted };
}
