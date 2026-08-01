/**
 * Public substrate capability surface (`@forwardimpact/libterrain/substrate`).
 * Consumers that embed the capability import from here. They include map's
 * staging pipeline, its Landmark smoke, and its `auth issue` operator verb.
 * No private copy of the persona query, the auth-user lookup, or the
 * provision reconciler then survives outside this library.
 */

export { SUBSTRATE_CONTRACT } from "./contract.js";
export { createSubstrateClient } from "./client.js";
export {
  findInvariantSatisfyingPersonas,
  loadDiscovery,
} from "./persona-query.js";
export { findAuthUser, runProvision } from "./auth-users.js";
export { runSubstrateCheck } from "../commands/substrate-check.js";
