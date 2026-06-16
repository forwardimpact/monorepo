/**
 * Bot Framework JWT verifier for the multi-tenant `POST /onboard` endpoint.
 *
 * Wraps the same Bot Framework authenticator
 * (`ConfigurationBotFrameworkAuthentication`) that the `/api/messages` path
 * uses, so onboarding and message intake validate inbound JWTs through one SDK
 * path — there is no parallel Microsoft signing-key fetch to maintain. The
 * SDK's `authenticateChannelRequest` performs full validation (signature
 * against Microsoft's published keys, audience = the bot's `MicrosoftAppId`,
 * issuer) and returns a `ClaimsIdentity`; the verified Entra tenant id is the
 * `tid` claim.
 *
 * A forged, expired, or wrong-audience token makes `authenticateChannelRequest`
 * throw, and an absent header is rejected before the SDK is reached — both map
 * to `null`, which the onboard handler turns into a 401.
 */

const TENANT_ID_CLAIM = "tid";

/**
 * Build the `authenticateTenant(c)` verifier the onboard handler depends on.
 *
 * @param {{ authenticateChannelRequest: (authHeader: string) => Promise<{
 *   isAuthenticated: boolean,
 *   getClaimValue: (claim: string) => string | null,
 * }> }} auth
 *   A Bot Framework authenticator (multi-mode
 *   `ConfigurationBotFrameworkAuthentication`).
 * @returns {(c: object) => Promise<string | null>} Resolves the caller's proven
 *   Entra tenant id (`tid`), or `null` when the request is unauthenticated.
 */
export function createOnboardVerifier(auth) {
  if (!auth || typeof auth.authenticateChannelRequest !== "function") {
    throw new Error("auth with authenticateChannelRequest is required");
  }
  return async (c) => {
    const authHeader = c.req.header("authorization") ?? "";
    if (!authHeader) return null;
    try {
      const identity = await auth.authenticateChannelRequest(authHeader);
      if (!identity?.isAuthenticated) return null;
      const tid = identity.getClaimValue(TENANT_ID_CLAIM);
      return tid || null;
    } catch {
      // Forged / expired / wrong-audience token: unauthenticated.
      return null;
    }
  };
}
