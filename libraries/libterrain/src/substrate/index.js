/**
 * Public substrate capability surface (`@forwardimpact/libterrain/substrate`).
 * Consumers embedding the capability (e.g. map's staging pipeline, its
 * Landmark smoke, and its `auth issue` operator verb) import from here so
 * no private copy of the persona query, auth-user lookup, or provisioning
 * reconciler survives outside this library.
 */

export { SUBSTRATE_CONTRACT } from "./contract.js";
export { createSubstrateClient } from "./client.js";
export {
  findInvariantSatisfyingPersonas,
  loadDiscovery,
} from "./persona-query.js";
export { findAuthUser, runProvision } from "./auth-users.js";
