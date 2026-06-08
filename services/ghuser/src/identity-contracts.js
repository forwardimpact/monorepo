/**
 * @typedef {object} BeginContractArgs
 * @property {object} req - Inbound BeginRequest fields (surface, surface_user_id, client_state, …).
 * @property {object} bridgeClient - Injected bridge gRPC client.
 *
 * @typedef {object} CompleteContractArgs
 * @property {object} flow - Consumed flow row from FlowStore.
 * @property {string} authorizedGithubId - Authenticated GitHub user id from token exchange.
 *
 * @typedef {object} ContractRecord
 * @property {"Begin" | "Complete"} evaluatedAt
 * @property {(args: BeginContractArgs | CompleteContractArgs) => Promise<{outcome: "ok" | "proof_missing" | "identity_mismatch"}>} evaluate
 */

/**
 * `bridge_pending_dispatch_proof` — cross-validates the asserted
 * `(surface, surface_user_id, client_state)` against a single-use
 * pending entry held by `services/bridge`. Evaluates at `Begin`.
 * Fail-closed on any non-OK bridge return: NOT_FOUND,
 * FAILED_PRECONDITION, transport error, malformed response all collapse
 * to `proof_missing`.
 *
 * @type {ContractRecord}
 */
export const bridgePendingDispatchProof = {
  evaluatedAt: "Begin",
  async evaluate({ req, bridgeClient }) {
    if (!req.client_state) return { outcome: "proof_missing" };
    try {
      await bridgeClient.VerifyPendingDispatch({
        link_token: req.client_state,
        expected_surface: req.surface,
        expected_surface_user_id: req.surface_user_id,
        tenant_id: "",
      });
      return { outcome: "ok" };
    } catch {
      return { outcome: "proof_missing" };
    }
  },
};

/**
 * `github_account_equality` — preserves today's account-id check for
 * `github-discussions`. Evaluates at `Complete`; needs `flow.surface_user_id`
 * and the authorized GitHub account id.
 *
 * @type {ContractRecord}
 */
export const githubAccountEquality = {
  evaluatedAt: "Complete",
  async evaluate({ flow, authorizedGithubId }) {
    if (authorizedGithubId !== flow.surface_user_id) {
      return { outcome: "identity_mismatch" };
    }
    return { outcome: "ok" };
  },
};

/**
 * Surface → contract registry. Lookup miss is **not** distinguishable
 * from a failed proof — both routes collapse to `proof_missing`
 * (design § Default for new surfaces).
 */
export const IDENTITY_CONTRACTS = new Map([
  ["github-discussions", githubAccountEquality],
]);

export const DEFAULT_CONTRACT = bridgePendingDispatchProof;

/**
 * @param {string} surface
 * @returns {ContractRecord}
 */
export function lookupContract(surface) {
  return IDENTITY_CONTRACTS.get(surface) ?? DEFAULT_CONTRACT;
}
