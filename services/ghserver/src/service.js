import { services } from "@forwardimpact/librpc";
import grpc from "@grpc/grpc-js";

const { GhserverBase } = services;

/**
 * Split a GitHub `channel_tenant_key` (`"{installation_id}:{owner}/{name}"`,
 * the shape `TenantStore.upsertByPair` writes) into its installation id.
 * A malformed key is a registry invariant violation, not a caller fault,
 * so the handler maps the thrown error to gRPC `INTERNAL`.
 *
 * @param {string} key
 * @returns {string} installation_id
 */
function parseInstallationId(key) {
  const match = /^([^:]+):[^/]+\/.+$/.exec(key ?? "");
  if (!match) {
    const err = new Error(`malformed channel_tenant_key: ${key}`);
    err.code = grpc.status.INTERNAL;
    throw err;
  }
  return match[1];
}

/**
 * GitHub App key custody — mints repo-scoped installation tokens.
 *
 * Every `MintInstallationToken` call resolves the requesting repo to an
 * `active` tenant via `services/tenancy`, enforces a per-tenant
 * mint-rate ceiling, and only then mints a token through the in-process
 * App-key custody. The App private key never leaves this service; the
 * only publicly-reachable control-plane process (`services/oidc`) holds
 * no signing material and reaches this service over the internal
 * network.
 *
 * @augments GhserverBase
 */
export class GhserverService extends GhserverBase {
  #tenancy;
  #appAuth;
  #rateCeiling;
  #logger;

  /**
   * @param {object} config
   * @param {object} deps
   * @param {{ResolveByRepo: (req: {owner: string, name: string}) => Promise<object>}} deps.tenancy
   *   Tenancy registry client (typed `TenancyClient` at the composition root).
   * @param {ReturnType<import("./app-auth.js").createAppAuthCustody>} deps.appAuth
   *   In-process App-key custody.
   * @param {import("./rate-ceiling.js").RateCeiling} deps.rateCeiling
   * @param {object} [deps.logger]
   */
  constructor(config, { tenancy, appAuth, rateCeiling, logger }) {
    super(config);
    if (!tenancy) throw new Error("tenancy client is required");
    if (!appAuth) throw new Error("appAuth is required");
    if (!rateCeiling) throw new Error("rateCeiling is required");
    this.#tenancy = tenancy;
    this.#appAuth = appAuth;
    this.#rateCeiling = rateCeiling;
    this.#logger = logger;
  }

  /**
   * @param {{owner: string, name: string, requested_by: string}} req
   * @returns {Promise<{installation_token: string, expires_at: number}>}
   */
  async MintInstallationToken({ owner, name, requested_by }) {
    const tenant = await this.#tenancy.ResolveByRepo({ owner, name });
    if (!tenant?.tenant_id || tenant.state !== "active") {
      const err = new Error("no active tenant for repo");
      err.code = grpc.status.NOT_FOUND;
      throw err;
    }
    if (this.#rateCeiling.exceeds(tenant.tenant_id)) {
      const err = new Error("per-tenant mint-rate ceiling exceeded");
      err.code = grpc.status.RESOURCE_EXHAUSTED;
      throw err;
    }
    const installation_id = parseInstallationId(tenant.channel_tenant_key);
    const { token, expires_at } = await this.#appAuth.mintInstallationToken({
      owner,
      name,
      installation_id,
    });
    this.#rateCeiling.record(tenant.tenant_id);
    this.#logger?.event?.("token.minted", {
      tenant_id: tenant.tenant_id,
      repo: `${owner}/${name}`,
      requested_by,
    });
    return { installation_token: token, expires_at };
  }
}
