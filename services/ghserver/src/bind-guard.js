// Loopback / private-range classification for the ghserver bind address.
//
// The gRPC mint surface is unauthenticated at the peer level in the
// initial delivery (the substrate — mTLS / signed JWT / mesh credential
// — is the deferred follow-on per design § "What this design does not
// cover"). Until that lands, caller restriction relies on the service
// binding to the control-plane's internal network only. This guard
// refuses to start the service on a non-loopback / non-private address
// unless the operator explicitly opts in with `allow_public_bind`.

const LOOPBACK_V4 = /^127\./;
const PRIVATE_10 = /^10\./;
const PRIVATE_172 = /^172\.(1[6-9]|2\d|3[0-1])\./;
const PRIVATE_192 = /^192\.168\./;
const PRIVATE_FD = /^fd[0-9a-f]{2}:/i;

/**
 * @param {string} address - The host the service will bind to.
 * @returns {boolean} True if the address is loopback or in a private range.
 */
export function isPrivateBindAddress(address) {
  const a = String(address ?? "").trim();
  if (a === "::1" || a === "localhost") return true;
  return (
    LOOPBACK_V4.test(a) ||
    PRIVATE_10.test(a) ||
    PRIVATE_172.test(a) ||
    PRIVATE_192.test(a) ||
    PRIVATE_FD.test(a)
  );
}

/**
 * Throw if `address` is public and `allow_public_bind` is not set.
 *
 * `0.0.0.0` (all interfaces) is treated as public — it exposes the mint
 * surface on every interface including the public one.
 *
 * @param {string} address
 * @param {boolean} allow_public_bind
 * @returns {void}
 */
export function assertBindAllowed(address, allow_public_bind) {
  if (allow_public_bind) return;
  if (isPrivateBindAddress(address)) return;
  throw new Error(
    `ghserver refuses to bind to non-private address "${address}" ` +
      "without allow_public_bind=true — the gRPC mint surface is " +
      "unauthenticated at the peer level and must stay on the " +
      "control-plane internal network (design § gRPC peer authentication).",
  );
}
