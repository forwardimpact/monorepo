/**
 * Hosted dispatch identity for multi-tenant bridges. The `workflow_dispatch`
 * credential is a repo-scoped GitHub App installation token minted by
 * `services/ghserver` for the resolved tenant's repository — not the per-user
 * OAuth token used by the self-hosted path (see design § Hosted dispatch
 * identity). Both `services/ghbridge` and `services/msbridge` share this
 * resolver in multi-tenant mode; the channel-specific reply credential (Bot
 * Framework for Teams, App installation for GitHub) is unaffected.
 *
 * This resolver satisfies the same duck-typed surface the `Dispatcher`
 * expects from a `TokenResolver`: `resolve(surface, requester, tenant) ->
 * DispatchAuth`. The `tenant` argument carries the registry row (with its
 * `repo`) the dispatcher resolved before requesting the credential, so the
 * mint is scoped to exactly that repository — there is no per-user link step.
 *
 * Lives in libbridge (not a channel adapter) because it imports no channel
 * SDK: it depends only on the duck-typed ghserver client, keeping libbridge's
 * "no channel SDKs" invariant intact.
 */
export class GhServerTokenResolver {
  #client;
  #requestedBy;

  /**
   * @param {object} client - ghserver gRPC client exposing
   *   `MintInstallationToken({owner, name, requested_by})`.
   * @param {object} [options]
   * @param {string} [options.requestedBy] - Audit tag forwarded as
   *   `requested_by` on the mint; identifies the calling bridge.
   */
  constructor(client, { requestedBy = "bridge" } = {}) {
    if (!client) throw new Error("ghserver client is required");
    this.#client = client;
    this.#requestedBy = requestedBy;
  }

  /**
   * @param {string} _surface - Unused; the App installation is repo-scoped.
   * @param {string} _requester - Unused; the App authors the dispatch.
   * @param {import("./tenant-resolver.js").Tenant} [tenant]
   * @returns {Promise<{kind: string, token?: string, error?: Error}>}
   */
  async resolve(_surface, _requester, tenant) {
    const repo = tenant?.repo;
    if (!repo?.owner || !repo?.name) {
      return {
        kind: "transient",
        error: new Error("tenant_repo_unresolved"),
      };
    }
    try {
      const { installation_token } = await this.#client.MintInstallationToken({
        owner: repo.owner,
        name: repo.name,
        requested_by: this.#requestedBy,
      });
      return { kind: "token", token: installation_token };
    } catch (err) {
      return { kind: "transient", error: err };
    }
  }
}
