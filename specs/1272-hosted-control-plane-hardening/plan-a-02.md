# Plan 1272 Part 02 — Move B: verified Teams /onboard

Implements design [Move B](design-a.md#onboarding-b) (criterion 5): inject a Bot
Framework JWT verifier so `POST /onboard` accepts only a cryptographically
proven Entra `tid`. Read [spec § criterion 5](spec.md) and design Key Decision 3
before executing. Single-tenant deployments never mount `/onboard`; the verifier
is a `multi`-mode-only collaborator.

Libraries used: botbuilder (`ConfigurationBotFrameworkAuthentication`,
`ClaimsIdentity`), librpc/libconfig (unchanged — no new keys).

## Step B1 — Bot Framework onboard verifier collaborator

One sentence: add a verifier that wraps the same
`ConfigurationBotFrameworkAuthentication` the `/api/messages` path uses and
returns the request's proven Entra `tid`.

- Created: `services/msbridge/src/onboard-verifier.js`
- Modified: `services/msbridge/src/teams.js` (export `AuthenticationConstants`
  or the literal `tid` claim name only if needed — prefer the literal `"tid"`,
  which `ClaimsIdentity.getClaimValue("tid")` already returns)

Concrete change — `createOnboardVerifier(auth)` returns an
`authenticateTenant(c)` function:

```js
// auth is the multi-mode ConfigurationBotFrameworkAuthentication
// instance (same SDK object used on /api/messages).
export function createOnboardVerifier(auth) {
  return async (c) => {
    const authHeader = c.req.header("authorization") ?? "";
    if (!authHeader) return null;
    try {
      const identity = await auth.authenticateChannelRequest(authHeader);
      if (!identity?.isAuthenticated) return null;
      const tid = identity.getClaimValue("tid");
      return tid || null;
    } catch {
      return null; // forged / expired / wrong-audience → unauthenticated
    }
  };
}
```

- `authenticateChannelRequest(authHeader)` performs full Bot Framework JWT
  validation (signature against Microsoft's signing keys, `aud === MicrosoftAppId`,
  issuer) — the SDK owns the JWKS fetch, so the bridge maintains no parallel
  signing-key path (design Key Decision 3 rejected the direct-JWKS alternative).
- A forged, expired, or absent token yields `null`; the handler maps `null` → 401.

Verification: `bun test test/onboard-verifier.test.js` (authenticated identity
with `tid` → tid; `isAuthenticated=false` → null; `authenticateChannelRequest`
throws → null; absent header → null).

## Step B2 — Build the verifier from the multi-mode authenticator

One sentence: expose the multi-mode `ConfigurationBotFrameworkAuthentication`
instance so `server.js` can build the verifier from it.

- Modified: `services/msbridge/src/teams.js`

Concrete change: factor the multi-mode authenticator construction out of
`createDefaultAdapter` into a reused factory. Add
`createMultiTenantAuthentication(config)` returning
`new ConfigurationBotFrameworkAuthentication({ MicrosoftAppId, MicrosoftAppPassword,
MicrosoftAppType: "MultiTenant" })`; `createDefaultAdapter`'s `multi` branch
calls it and wraps the result in a `CloudAdapter`. The onboard verifier
(built in `server.js`, Step B3) constructs its own instance via the same
factory — design Key Decision 3's "one verification path, one SDK upgrade
surface" is satisfied by sharing the *factory and SDK class*, not a single live
object (the adapter is built inside the `MsBridgeService` constructor at
index.js:153, the verifier in `server.js`, so they cannot share one instance
without a larger wiring change out of scope here). Single-tenant branch
unchanged.

Verification: `bun test test/*.test.js` (existing adapter/runtime tests green —
the multi-mode adapter still constructs).

## Step B3 — Wire the verifier in server.js (remove default-deny)

One sentence: build the real verifier in `multi` mode and inject it; in `single`
mode inject nothing (the endpoint is never mounted).

- Modified: `services/msbridge/server.js`

Concrete change: replace `const authenticateTenant = undefined;` (server.js:94)
and its deferred-substrate comment with:

```js
// Multi-tenant /onboard requires a cryptographically proven Entra tid. The
// verifier wraps the same Bot Framework authenticator the /api/messages path
// uses (design Key Decision 3), so one SDK path validates both. Single-tenant
// never mounts /onboard, so no verifier is built.
let authenticateTenant;
if (config.tenancy_mode === "multi") {
  authenticateTenant = createOnboardVerifier(
    createMultiTenantAuthentication(config),
  );
}
```

Add the imports for `createOnboardVerifier` and `createMultiTenantAuthentication`.

Verification: `bun test test/startup.test.js` plus a multi-mode construction
test (service builds with a real verifier wired).

## Step B4 — Remove the default-deny fallback in the handler mount

One sentence: drop the `authenticateTenant ?? (() => null)` default-deny shim so
that wiring is explicit — multi requires a verifier, single never mounts.

- Modified: `services/msbridge/index.js`

Concrete change in `#mountOnboard` (index.js:267–272): pass `authenticateTenant`
straight through (no `?? (() => null)`). The constructor already only calls
`#mountOnboard` inside `if (this.#multiTenant)` (index.js:251), so a multi-mode
service with no verifier now fails fast at `createOnboardHandler`
(`authenticateTenant is required`) instead of silently default-denying. Rewrite
the `#mountOnboard` doc comment: drop "Default-deny: a missing verifier never
authenticates" and "deferred substrate"; state that multi-mode injects a real
Bot Framework verifier and single-tenant never mounts the endpoint.

Verification: `bun test test/onboard-handler.test.js` (constructor-required test
still green) and the multi-mode construction test from B3.

## Step B5 — Test suite: proven / forged / absent

One sentence: assert the three criterion-5 outcomes against the verifier and
handler.

- Created: `services/msbridge/test/onboard-verifier.test.js`
- Modified: `services/msbridge/test/onboard-handler.test.js`

Concrete change:

- `onboard-verifier.test.js` covers Step B1's four cases with a fake `auth`
  whose `authenticateChannelRequest` returns a `ClaimsIdentity`-shaped stub
  (`{ isAuthenticated, getClaimValue }`), throws for a forged token, and is
  never reached for an absent header.
- `onboard-handler.test.js`: keep the existing direct-handler cases; the
  `fakeContext` already stubs `req.header`. Add a small integration test that
  feeds a verifier built over a fake `auth` through `createOnboardHandler` to
  prove the criterion-5 trio end to end: proven `tid` → 200 + `active` + repo;
  forged proof (auth throws) → 401, no writes; absent header → 401, no writes.

Verification: `bun test test/onboard-verifier.test.js test/onboard-handler.test.js`
(proven → active + SetRepo; forged → 401, zero upsert/setRepo; absent → 401,
zero upsert/setRepo).

## Step B6 — Drop default-deny / no-verifier docs

One sentence: remove the "default-deny / no verifier injected" language now that
the verifier ships.

- Modified: `services/msbridge/README.md`, `services/msbridge/azure-app.md`

Concrete change:

- README § Multi-tenant onboarding: replace the paragraph beginning "Full Bot
  Framework JWT signature validation … is a peer-authentication substrate …
  default-deny (every request returns 401)" with one stating the verifier ships:
  the handler validates the inbound Bot Framework bearer JWT via the same
  `ConfigurationBotFrameworkAuthentication` used on `/api/messages` and accepts
  only a proven `tid`; an absent or forged proof returns 401.
- `azure-app.md` § Hosted: replace the blockquote "Full Bot Framework JWT
  signature validation for `/onboard` … is deferred; until the verifier lands,
  `/onboard` is **default-deny**" with a statement that `/onboard` validates the
  caller's Bot Framework JWT (proven `tid` required). Leave the Bot Framework
  **credential custody** deferral note intact — that is out of scope per spec.

Verification: no "default-deny" / "no production verifier" / "until the verifier
lands" strings remain in either doc; `rg -n "default-deny|until the verifier"
services/msbridge` returns nothing.

## Risks

- `authenticateChannelRequest` is the channel-service token path
  (`aud === MicrosoftAppId`); confirm the SDK accepts the Teams/Entra token the
  customer presents to `/onboard`. If the customer presents a Graph/Entra user
  token rather than a Bot Framework channel token, the verifier rejects it — the
  tester must drive `/onboard` with a Bot Framework-issued bearer for the bot's
  `MicrosoftAppId` audience. Documented in Step B6's README note.
- `c.req.header` is case-insensitive in Hono; read `"authorization"`.

— Staff Engineer 🛠️
