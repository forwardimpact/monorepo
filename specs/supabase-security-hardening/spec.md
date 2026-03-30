# Supabase Edge Function Security Hardening

## Status

Proposed

## Problem

The Supabase edge functions in `products/map/supabase/functions/` have two
application-level vulnerabilities that allow attackers to inject forged data
into the engineering signal pipeline and make cross-origin authenticated
requests from untrusted websites.

Both findings are rated HIGH because they directly affect data integrity (the
foundation of Landmark's signal analysis) and authentication boundaries for all
edge functions.

## Findings

### 1. Missing Webhook Signature Verification

**Severity:** HIGH **File:**
`products/map/supabase/functions/github-webhook/index.ts`

The GitHub webhook handler accepts POST requests and immediately processes the
payload -- storing raw JSON to Supabase Storage, upserting rows into
`github_events`, and extracting artifacts (pull requests, reviews, commits) into
`github_artifacts`. At no point does it verify the `X-Hub-Signature-256` header
that GitHub sends with every webhook delivery.

**Risk:** Any attacker who discovers the function URL (predictable from the
Supabase project ID and function name) can forge webhook payloads. This enables:

- Injection of fake commits, pull requests, and reviews into `github_artifacts`
- Pollution of the `github_events` table with fabricated event data
- Corruption of Landmark's engineering signal analysis, which relies on these
  tables for objective marker evidence
- Association of forged artifacts with real people via the `organization_people`
  lookup (line 61-65), attributing fabricated work to real engineers

The current code checks only for the presence of `X-GitHub-Delivery` and
`X-GitHub-Event` headers (lines 8-13), both of which are trivially spoofed.

**OWASP classification:** Broken Authentication / Insufficient Verification

### 2. Wildcard CORS Configuration

**Severity:** HIGH **File:** `products/map/supabase/functions/_shared/cors.ts`

The shared CORS headers export sets `Access-Control-Allow-Origin: "*"`, allowing
any website on the internet to make cross-origin requests to every Supabase edge
function that uses these headers. The `Access-Control-Allow-Headers` list
includes `authorization` and `apikey`, confirming that these functions expect
authenticated requests.

**Risk:** A malicious website can make authenticated cross-origin requests to
the edge functions if the user's browser holds valid session tokens. This
enables:

- CSRF-like attacks against data-mutating endpoints (`people-upload`,
  `github-webhook`, `getdx-sync`, `transform`)
- Exfiltration of response data from read endpoints
- Bypassing of any origin-based access controls the Supabase project may enforce
  elsewhere

The wildcard origin is defined once in `_shared/cors.ts` and is intended to be
imported by all edge functions, making this a systemic issue rather than an
isolated misconfiguration.

**OWASP classification:** Security Misconfiguration

## Proposed Solution

### Webhook Signature Verification

Implement HMAC-SHA256 signature verification at the top of the request handler,
before any payload processing or database writes occur.

The approach:

1. Read the webhook secret from Supabase edge function secrets
   (`Deno.env.get("GITHUB_WEBHOOK_SECRET")`). Return 500 if the secret is not
   configured -- fail closed, not open.
2. Read the raw request body as an `ArrayBuffer` (not parsed JSON) to ensure the
   signature is computed over the exact bytes GitHub signed.
3. Extract the `X-Hub-Signature-256` header. Return 401 if missing.
4. Compute `HMAC-SHA256(secret, rawBody)` using the Web Crypto API
   (`crypto.subtle.importKey` + `crypto.subtle.sign`), which is available in the
   Deno runtime.
5. Compare the computed signature against the provided signature using a
   constant-time comparison to prevent timing attacks. Deno provides
   `crypto.subtle.timingSafeEqual` (or implement via `Uint8Array` comparison
   with `crypto.timingSafeEqual` equivalent). Return 401 if they do not match.
6. Only after verification succeeds, parse the raw body as JSON and proceed with
   existing processing logic.

The verification logic should be extracted into a reusable function in
`_shared/` since other webhook integrations (e.g., GetDX) may need similar
verification in the future.

### CORS Origin Allowlist

Replace the wildcard `*` origin with environment-driven origin validation.

The approach:

1. Define a `CORS_ALLOWED_ORIGINS` environment variable containing a
   comma-separated list of trusted origins (e.g.,
   `https://app.example.com,https://admin.example.com`).
2. Modify `_shared/cors.ts` to export a function (rather than a static object)
   that accepts the incoming `Request` and returns the appropriate CORS headers.
3. The function reads the `Origin` header from the request, checks it against
   the allowlist, and returns that specific origin in
   `Access-Control-Allow-Origin` if it matches. If the origin is not in the
   allowlist, omit the `Access-Control-Allow-Origin` header entirely (the
   browser will block the response).
4. Add `Vary: Origin` to responses so caches and CDNs do not serve a response
   with one origin's CORS headers to a request from a different origin.
5. Update all edge functions that handle OPTIONS preflight requests to use the
   new function.

For local development, the allowlist should default to `http://localhost:*`
patterns or a permissive set configured in `.env.local`. Production deployments
must set explicit origins.

## Files to Change

| File                                                        | Change                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------- |
| `products/map/supabase/functions/_shared/cors.ts`           | Replace static wildcard headers with origin-validating function |
| `products/map/supabase/functions/_shared/verify-webhook.ts` | New file: reusable HMAC-SHA256 signature verification           |
| `products/map/supabase/functions/github-webhook/index.ts`   | Add signature verification before payload processing            |
| `products/map/supabase/functions/transform/index.ts`        | Update CORS import to use new function                          |
| `products/map/supabase/functions/people-upload/index.ts`    | Update CORS import to use new function                          |
| `products/map/supabase/functions/getdx-sync/index.ts`       | Update CORS import to use new function                          |

## Testing

### Webhook Signature Verification

- **Missing secret:** Start the function without `GITHUB_WEBHOOK_SECRET` set.
  Confirm it returns 500.
- **Missing signature header:** Send a POST without `X-Hub-Signature-256`.
  Confirm it returns 401.
- **Invalid signature:** Send a POST with a well-formed but incorrect signature.
  Confirm it returns 401.
- **Valid signature:** Compute a correct HMAC-SHA256 signature for a test
  payload and send it. Confirm the function processes the webhook and
  returns 200.
- **Timing safety:** Verify the comparison uses a constant-time function (code
  review, not a runtime test).

### CORS Origin Allowlist

- **Allowed origin:** Send a request with an `Origin` header matching the
  allowlist. Confirm `Access-Control-Allow-Origin` is set to that origin and
  `Vary: Origin` is present.
- **Disallowed origin:** Send a request with an unrecognized `Origin`. Confirm
  `Access-Control-Allow-Origin` is absent from the response.
- **No origin header:** Send a request without an `Origin` header (e.g.,
  server-to-server). Confirm the function processes normally without CORS
  headers.
- **Preflight:** Send an OPTIONS request from an allowed origin. Confirm it
  returns 204 with correct CORS headers.
- **Preflight from disallowed origin:** Send an OPTIONS request from an
  unrecognized origin. Confirm CORS headers are absent.

## References

- [OWASP Webhook Security](https://cheatsheetseries.owasp.org/cheatsheets/Webhook_Security_Cheat_Sheet.html)
- [GitHub Webhook Documentation -- Validating Payloads](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [OWASP CORS Misconfiguration](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-side_Testing/07-Testing_Cross_Origin_Resource_Sharing)
- [MDN Access-Control-Allow-Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Origin)
