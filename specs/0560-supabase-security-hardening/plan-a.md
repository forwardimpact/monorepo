# 560 — Supabase Edge Function Security Hardening — Plan A

## Approach

Four steps, strictly ordered. Steps 1–2 create the two shared modules; steps 3–4
wire them into edge functions. All changes are inside
`products/map/supabase/functions/`.

The constant-time comparison question (flagged in the design as plan-level) is
resolved here: a manual fixed-length byte XOR accumulator on the raw HMAC
digests, not `node:crypto.timingSafeEqual`. Rationale below in § Decisions.

## Steps

### Step 1 — Create WebhookVerifier (`_shared/verify-webhook.ts`)

New file. Implements the design's `verifyWebhookSignature` interface.

**File:** `products/map/supabase/functions/_shared/verify-webhook.ts` (CREATE)

**Algorithm:**

```
verifyWebhookSignature(req, secretEnvVar):
  1. secret = Deno.env.get(secretEnvVar)
     → if missing: return { ok: false, response: Response(500) }
  2. sig = req.headers.get("X-Hub-Signature-256")
     → if missing: return { ok: false, response: Response(401) }
  3. body = await req.arrayBuffer()
  4. key = crypto.subtle.importKey("raw", encode(secret), HMAC-SHA256)
  5. computed = crypto.subtle.sign("HMAC", key, body) → Uint8Array(32)
  6. expected = hexToBytes(sig.slice("sha256=".length))
     → if expected.length !== 32: return { ok: false, response: Response(401) }
  7. if !constantTimeEqual(computed, expected):
       return { ok: false, response: Response(401) }
  8. return { ok: true, body }
```

**Exports:**

```ts
verifyWebhookSignature(
  req: Request,
  secretEnvVar: string,
): Promise<
  { ok: true; body: ArrayBuffer } | { ok: false; response: Response }
>
```

**Internal functions (not exported):**

- `hexToBytes(hex: string): Uint8Array` — converts hex string to byte array.
  Returns the byte array without length validation (caller checks
  `result.length === 32`).
- `constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean` — XOR accumulator.
  Returns `false` immediately if lengths differ. **Calling contract:**
  `constantTimeEqual` must only be called after both inputs are validated to be
  exactly 32 bytes. Step 6 performs this validation for `expected`; `computed`
  is always 32 bytes (HMAC-SHA256 output). The length check inside the function
  is a defense-in-depth backstop, not the primary guard — timing leakage from
  the length branch is acceptable only because the caller already guarantees
  equal lengths.

**Verification:** Import in a Deno REPL or test file; call with known-good HMAC.
Confirm: missing env → 500, missing header → 401, wrong sig → 401, correct sig →
`{ ok: true, body }`. Additionally, code-review the `constantTimeEqual`
implementation to confirm it uses XOR accumulation with no early exits in the
byte loop (spec testing criterion: timing safety).

### Step 2 — Rewrite CorsHandler (`_shared/cors.ts`)

Replace the entire file. Current file is 5 lines exporting a static object that
nothing imports. New file exports two functions per the design.

**File:** `products/map/supabase/functions/_shared/cors.ts` (REPLACE)

**`corsHeaders(req: Request): Record<string, string>`:**

```
1. origin = req.headers.get("Origin")
   → if null: return {} (server-to-server, no CORS needed)
2. allowedOrigins = Deno.env.get("CORS_ALLOWED_ORIGINS")
3. if allowedOrigins is set:
     → split by comma, trim whitespace
     → if origin is in the list: return CORS allow headers
     → else: return {}
4. if allowedOrigins is not set (localhost default):
     → try: parse origin as URL (new URL(origin))
     → catch: return {} (malformed origin treated as unmatched)
     → if hostname === "localhost": return CORS allow headers
     → else: return {}
```

CORS allow headers (when origin matches):

```
Access-Control-Allow-Origin: <matched origin>
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type
Access-Control-Allow-Methods: POST, OPTIONS
Vary: Origin
```

**`handlePreflight(req: Request): Response`:**

```
1. headers = corsHeaders(req)
2. return new Response(null, { status: 204, headers })
```

Returns 204 regardless of origin match. Matched origins get CORS headers;
unmatched origins get 204 with no CORS headers (browser interprets as denial).

**Localhost matching detail:** Use `new URL(origin)` to parse, check
`url.hostname === "localhost"`. This prevents `http://localhost.evil.com` from
matching. Any port is allowed (`http://localhost:3000`,
`http://localhost:54321`).

**Verification:** Call `corsHeaders()` with allowed, disallowed, localhost, and
absent origins. Confirm header presence/absence for each case.

### Step 3 — Wire `github-webhook/index.ts`

**File:** `products/map/supabase/functions/github-webhook/index.ts` (MODIFY)

**Changes:**

1. Add imports at top:

   ```ts
   import { verifyWebhookSignature } from "../_shared/verify-webhook.ts";
   import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
   ```

2. Add OPTIONS handler as the first check in the handler, before the existing
   `if (req.method !== "POST")` guard. This ensures OPTIONS requests are handled
   by the CORS module instead of falling through to the 405 response:

   ```ts
   if (req.method === "OPTIONS") {
     return handlePreflight(req);
   }
   ```

3. Add signature verification after the POST method check, before header
   extraction. This replaces `const payload = await req.json()` with verified
   body parsing:

   ```ts
   const verification = await verifyWebhookSignature(req, "GITHUB_WEBHOOK_SECRET");
   if (!verification.ok) return verification.response;

   const payload = JSON.parse(new TextDecoder().decode(verification.body));
   ```

4. Merge CORS headers into the existing `json()` helper responses:

   ```ts
   function json(body: unknown, status = 200) {
     return new Response(JSON.stringify(body), {
       status,
       headers: { "Content-Type": "application/json", ...corsHeaders(req) },
     });
   }
   ```

   The `json` function must capture `req` from the outer scope. Move it inside
   the handler or pass `req` as a parameter. Preferred: convert to an inline
   arrow that closes over `req`:

   ```ts
   const json = (body: unknown, status = 200) =>
     new Response(JSON.stringify(body), {
       status,
       headers: { "Content-Type": "application/json", ...corsHeaders(req) },
     });
   ```

**Before:**

```ts
Deno.serve(async (req) => {
  if (req.method !== "POST") { ... }
  const deliveryId = ...
  const payload = await req.json();
  ...
});
```

**After:**

```ts
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handlePreflight(req);
  if (req.method !== "POST") { ... }

  const verification = await verifyWebhookSignature(req, "GITHUB_WEBHOOK_SECRET");
  if (!verification.ok) return verification.response;

  const payload = JSON.parse(new TextDecoder().decode(verification.body));
  const deliveryId = ...
  ...
});
```

**Ordering note:** Signature verification runs before header extraction
(`X-GitHub-Delivery`, `X-GitHub-Event`). The design requires "before any payload
processing or database writes." Header extraction is payload processing —
unauthenticated requests must not reach it.

### Step 4 — Wire CORS into remaining functions

Three functions gain OPTIONS handling and CORS response headers. No webhook
verification — that's github-webhook only.

**File:** `products/map/supabase/functions/people-upload/index.ts` (MODIFY)

1. Add import:
   `import { corsHeaders, handlePreflight } from "../_shared/cors.ts";`
2. Add OPTIONS handler as first check in the serve callback.
3. Change `json()` to merge `...corsHeaders(req)` into response headers.
4. Same `json` scoping fix as Step 3 (close over `req`).

**File:** `products/map/supabase/functions/transform/index.ts` (MODIFY)

1. Add import:
   `import { corsHeaders, handlePreflight } from "../_shared/cors.ts";`
2. Rename `_req` to `req`.
3. Add OPTIONS handler as first check.
4. Merge `...corsHeaders(req)` into the `Response` constructor's headers.

**File:** `products/map/supabase/functions/getdx-sync/index.ts` (MODIFY)

1. Add import:
   `import { corsHeaders, handlePreflight } from "../_shared/cors.ts";`
2. Rename `_req` to `req`.
3. Add OPTIONS handler as first check.
4. Change `json()` to merge `...corsHeaders(req)` into response headers.

**Verification per function:** Send OPTIONS → expect 204. Send request with
allowed origin → expect `Access-Control-Allow-Origin` in response. Send request
with disallowed origin → expect no CORS headers.

## Blast Radius

| File                        | Action  | Lines (est.) |
| --------------------------- | ------- | ------------ |
| `_shared/verify-webhook.ts` | CREATE  | ~45          |
| `_shared/cors.ts`           | REPLACE | ~35          |
| `github-webhook/index.ts`   | MODIFY  | ~15 net      |
| `people-upload/index.ts`    | MODIFY  | ~8 net       |
| `transform/index.ts`        | MODIFY  | ~8 net       |
| `getdx-sync/index.ts`       | MODIFY  | ~8 net       |

No files deleted. No files outside `products/map/supabase/functions/` touched.
No dependency changes. No schema changes.

## Decisions

### Constant-time comparison: manual XOR accumulator, not `node:crypto`

Supabase Edge Functions run on Deno Deploy. `node:crypto.timingSafeEqual` is
available in recent Deno versions but its availability on Supabase's Deno Deploy
runtime is not guaranteed — the runtime version lags upstream Deno. A manual XOR
accumulator on two 32-byte `Uint8Array` values is:

- Zero-dependency (no import)
- Correct for fixed-length HMAC digests (the length check is a format
  validation, not a timing-sensitive branch)
- Well-understood in security literature

The SE reviewer should verify that this is acceptable for the threat model. If
`node:crypto` is confirmed available on the target Deno Deploy version, the
implementation may switch — the interface is unchanged.

### Compare raw bytes, not hex strings

The GitHub `X-Hub-Signature-256` header is `sha256=<64 hex chars>`. The plan
converts the hex to a 32-byte `Uint8Array` and compares against the raw HMAC
output. This is preferred over comparing hex strings (64 bytes) because:

- Smaller comparison surface (32 vs 64 bytes)
- Length validation (must decode to exactly 32 bytes) catches malformed headers
  before the constant-time path

### `json()` scoping

Three functions (`github-webhook`, `people-upload`, `getdx-sync`) define a
standalone `json()` function outside the request handler. CORS headers require
the `req` object. Converting to an arrow function inside the handler is the
smallest change. `transform` has no helper function — CORS merges directly into
the `Response` constructor.

### Signature verification before header extraction

The design says "before any payload processing." The current code extracts
`X-GitHub-Delivery` and `X-GitHub-Event` headers before reading the body. These
headers are not dangerous to read, but the plan places verification first anyway
— the principle is that unauthenticated requests should execute as little
application logic as possible. No performance cost (HMAC is fast).

## Risks

1. **Deno `crypto.subtle` API surface.** The plan uses `importKey` and `sign`
   from Web Crypto, which is standard in Deno. Low risk — these are the same
   APIs the spec references.

2. **`new URL()` parsing in localhost match.** Invalid origin strings will
   throw. Mitigated in the Step 2 algorithm: try/catch around `new URL(origin)`
   returns `{}` on failure, treating unparseable origins as unmatched.

3. **`CORS_ALLOWED_ORIGINS` format.** Comma-separated, whitespace-trimmed. If a
   deployer adds a trailing slash (`https://app.example.com/`), it won't match
   an `Origin` header without the slash. Document this in a code comment at the
   parse site.

4. **Body consumption order.** `verifyWebhookSignature` consumes
   `req.arrayBuffer()`. The caller must use the returned `body` — a second
   `req.json()` or `req.text()` call will fail. This is enforced by the API
   design (body returned on success) but the implementer should verify no
   double-read exists.

## Libraries Used

No `@forwardimpact/lib*` packages are used. All code is self-contained within
the Supabase edge functions directory using Deno built-in APIs (`crypto.subtle`,
`TextEncoder`, `TextDecoder`, `Deno.env`, `URL`).

## Execution

Single agent: **staff-engineer**. Steps 1–4 are sequential (each depends on the
prior). Estimated size: ~120 lines of new/changed code across 6 files. No
decomposition needed — fits a single implementation session.

Tag **security-engineer** for review of the constant-time comparison
implementation and the localhost-matching logic before plan approval.
