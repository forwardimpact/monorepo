/**
 * @typedef {object} BeginContractArgs
 * @property {object} req - Inbound BeginRequest fields (surface, surface_user_id, client_state, …).
 * @property {object} bridgeClient - Injected bridge gRPC client.
 * @property {object} [logger] - Optional injected logger. The fail-closed
 *   path uses it for debug-level diagnostic crumbs. Unit tests do not pass
 *   it. The server-wired path passes it.
 *
 * @typedef {object} CompleteContractArgs
 * @property {object} flow - Consumed flow row from FlowStore.
 * @property {string} authorizedGithubId - Authenticated GitHub user id from token exchange.
 *
 * @typedef {object} ContractRecord
 * @property {"Begin" | "Complete"} evaluatedAt
 *   Dispatch picks the bag (Begin → {@link BeginContractArgs}, Complete →
 *   {@link CompleteContractArgs}) based on this field. Each contract
 *   destructures only the keys it needs.
 * @property {(args: BeginContractArgs | CompleteContractArgs) => Promise<{outcome: "ok" | "proof_missing" | "identity_mismatch"}>} evaluate
 */

/**
 * `bridge_pending_dispatch_proof` — cross-validates the asserted
 * `(surface, surface_user_id, client_state)` against a single-use
 * pending entry that `services/bridge` holds. Evaluates at `Begin`.
 *
 * **Fail-closed on every thrown error.** Any `throw` from
 * `bridgeClient.VerifyPendingDispatch` collapses to `proof_missing`. This
 * covers NOT_FOUND, FAILED_PRECONDITION (mismatch or already-claimed), a
 * transport error, and a malformed-message decode error. The contract
 * treats a resolve that does not throw as `ok`. librpc's generated client
 * raises on every non-OK gRPC status (design § Default for new surfaces).
 * So the "non-Empty response shape" concern is bridge-side. It is not
 * contract-side. The collapse denies an attacker the enumeration oracle
 * that the design rejects. The collapse also means legitimate users see
 * `proof_missing` during a bridge outage. The design chose this over
 * fail-open because fail-open re-opens the original defect (design
 * § Bridge availability failure mode).
 *
 * @type {ContractRecord}
 */
export const bridgePendingDispatchProof = {
  evaluatedAt: "Begin",
  async evaluate({ req, bridgeClient, logger }) {
    // Empty client_state means there is no token to verify. The contract
    // fails closed and does not call the bridge. A bare `/authorize` URL
    // then never reaches the RPC layer.
    if (!req.client_state) return { outcome: "proof_missing" };
    try {
      await bridgeClient.VerifyPendingDispatch({
        link_token: req.client_state,
        expected_surface: req.surface,
        expected_surface_user_id: req.surface_user_id,
        tenant_id: req.tenant_id,
      });
      return { outcome: "ok" };
    } catch (err) {
      // The optional debug log lets operators distinguish a bridge outage
      // (transport errors) from legitimate negative results. The log does
      // not break the fail-closed outcome shape.
      logger?.debug?.("identity-contract", "proof_missing", {
        surface: req.surface,
        reason: err?.code ?? err?.message ?? "unknown",
      });
      return { outcome: "proof_missing" };
    }
  },
};

/**
 * `github_account_equality` — preserves today's account-id check for
 * `github-discussions`. Evaluates at `Complete`. Needs
 * `flow.surface_user_id` and the authorized GitHub account id.
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
 * Surface → contract registry. A lookup miss is **not** distinguishable
 * from a failed proof. Both routes collapse to `proof_missing`
 * (design § Default for new surfaces). To add a new surface, register one
 * record here. There is no boot-time check of the "configured surface
 * set". The service discovers surfaces from request fields. It does not
 * read them from config.
 */
export const IDENTITY_CONTRACTS = new Map([
  ["github-discussions", githubAccountEquality],
]);

/**
 * The contract that every unregistered surface resolves to through
 * {@link lookupContract}. Today this is `bridgePendingDispatchProof`. If it
 * ever changes, every unregistered surface adopts the new default in
 * lockstep.
 *
 * @type {ContractRecord}
 */
export const DEFAULT_CONTRACT = bridgePendingDispatchProof;

/**
 * Resolve a surface to its identity-proof contract.
 *
 * **Lookup-miss invariant**: a surface absent from {@link IDENTITY_CONTRACTS}
 * returns {@link DEFAULT_CONTRACT}. It never returns `undefined`. It never
 * returns a distinct "unknown surface" outcome, because that would give an
 * enumeration oracle.
 *
 * @param {string} surface
 * @returns {ContractRecord}
 */
export function lookupContract(surface) {
  return IDENTITY_CONTRACTS.get(surface) ?? DEFAULT_CONTRACT;
}
