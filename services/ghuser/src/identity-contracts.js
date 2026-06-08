/**
 * @typedef {object} BeginContractArgs
 * @property {object} req - Inbound BeginRequest fields (surface, surface_user_id, client_state, …).
 * @property {object} bridgeClient - Injected bridge gRPC client.
 * @property {object} [logger] - Optional injected logger used for debug-level
 *   diagnostic crumbs on the fail-closed path; absent in unit tests, present
 *   in the server-wired path.
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

// Single-tenant value carried by every bridge RPC. msbridge writes
// `PutPendingDispatch` entries under this tenant id via
// `DefaultTenantResolver` (libraries/libbridge/src/tenant-resolver.js:39);
// ghuser must use the same value or the scoped-key lookup
// (`services/bridge/index.js:324`) cannot match. The forward-looking
// multi-tenant case (thread real tenant through `/authorize`) is
// deferred to a future multi-tenant spec — `VerifyPendingDispatch` and
// `PutPendingDispatch` must update in the same tag so the keyspace
// stays uniform (design § Key decisions row "tenant_id plumbing").
const SINGLE_TENANT_ID = "default";

/**
 * `bridge_pending_dispatch_proof` — cross-validates the asserted
 * `(surface, surface_user_id, client_state)` against a single-use
 * pending entry held by `services/bridge`. Evaluates at `Begin`.
 *
 * **Fail-closed on every non-OK return.** NOT_FOUND, FAILED_PRECONDITION
 * (mismatch or already-claimed), transport error, and any non-Empty
 * response shape all collapse to `proof_missing`. Collapsing denies an
 * attacker the enumeration oracle the design rejects in § Default for
 * new surfaces; it also means legitimate users see `proof_missing`
 * during a bridge outage — chosen over fail-open because fail-open
 * re-opens the original defect (design § Bridge availability failure
 * mode).
 *
 * @type {ContractRecord}
 */
export const bridgePendingDispatchProof = {
  evaluatedAt: "Begin",
  async evaluate({ req, bridgeClient, logger }) {
    // Empty client_state means no token to verify — fail-closed without
    // touching the bridge so a bare `/authorize` URL never reaches the
    // RPC layer.
    if (!req.client_state) return { outcome: "proof_missing" };
    try {
      await bridgeClient.VerifyPendingDispatch({
        link_token: req.client_state,
        expected_surface: req.surface,
        expected_surface_user_id: req.surface_user_id,
        tenant_id: SINGLE_TENANT_ID,
      });
      return { outcome: "ok" };
    } catch (err) {
      // Optional debug log lets operators distinguish bridge outage
      // (transport errors) from legitimate negative results without
      // breaking the fail-closed outcome shape.
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
 * (design § Default for new surfaces). Adding a new surface requires
 * registering one record here; there is no boot-time validation of
 * "configured surface set" because surfaces are discovered from request
 * fields, not config.
 */
export const IDENTITY_CONTRACTS = new Map([
  ["github-discussions", githubAccountEquality],
]);

/**
 * Contract every non-registered surface resolves to via {@link lookupContract}.
 * Today this is `bridgePendingDispatchProof`; if it ever changes, every
 * unregistered surface adopts the new default in lockstep.
 *
 * @type {ContractRecord}
 */
export const DEFAULT_CONTRACT = bridgePendingDispatchProof;

/**
 * Resolve a surface to its identity-proof contract.
 *
 * **Lookup-miss invariant**: a surface absent from {@link IDENTITY_CONTRACTS}
 * returns {@link DEFAULT_CONTRACT} — never `undefined`, and never a distinct
 * "unknown surface" outcome (that would give an enumeration oracle).
 *
 * @param {string} surface
 * @returns {ContractRecord}
 */
export function lookupContract(surface) {
  return IDENTITY_CONTRACTS.get(surface) ?? DEFAULT_CONTRACT;
}
