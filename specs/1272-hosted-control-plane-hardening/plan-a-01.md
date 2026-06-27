# Plan 1272 Part 01 — Move A: ghserver peer-auth + key custody

Implements design [Move A](design-a.md#components) (criteria 1–4): a
peer-authenticated `MintInstallationToken` surface and externalized App-key
custody with in-place rotation. Read [spec § criteria 1–4](spec.md) and design
Key Decisions 1–2 before executing. Bind-address isolation (`src/bind-guard.js`)
stays as defense-in-depth; this move adds per-caller identity on top of it.

Libraries used: librpc (server interceptor, `Server`), libconfig (config keys),
libtype (no proto change — metadata only).

## Step A1 — Peer-token verifier collaborator

One sentence: add an asymmetric per-caller peer-token verifier that validates a
short-lived JWT (`aud=ghserver`, `exp` minutes) and returns the caller identity.

- Created: `services/ghserver/src/peer-auth.js`
- Modified: `services/ghserver/index.js` (export `createPeerVerifier`)

Concrete change — `createPeerVerifier({ publicKeys, clock })` returns
`{ verify(authorizationHeader) → { peer_identity } | null }`:

- Parse `Bearer <jwt>` from the `authorization` metadata value; absent/malformed
  → return `null`.
- Verify the JWT signature against the public key registered for the token's
  `iss` (caller id), check `aud === "ghserver"` and `exp > clock.now()`.
- On success return `{ peer_identity: iss }`; on any failure return `null`.
- `publicKeys` is a `Map<callerId, pem>` supplied by the key resolver (Step A3),
  not embedded — one trust root shared with the App key custody.

Verification: `bun test test/peer-auth.test.js` (valid token → identity;
expired, wrong-aud, unknown-issuer, absent → null).

## Step A2 — Server interceptor wiring + reject path

One sentence: require a verified peer token on every `MintInstallationToken`
call, returning gRPC `UNAUTHENTICATED` before any `ResolveByRepo`.

- Modified: `services/ghserver/server.js` (build verifier, pass as a server
  interceptor), `services/ghserver/src/service.js` (read `peer_identity` from
  call context; reject when absent)

Concrete change:

- In `server.js`, construct the verifier (Step A1) from resolver-supplied public
  keys and register it as a `Server` interceptor that reads the `authorization`
  metadata, calls `verify`, and either attaches `peer_identity` to the call
  context or fails the call with `grpc.status.UNAUTHENTICATED`.
- `MintInstallationToken` asserts `peer_identity` is present (defense-in-depth;
  the interceptor already rejected the call) before resolving the repo.

Verification: `bun test test/ghserver.test.js` (unauthenticated caller →
`UNAUTHENTICATED`; valid peer → mint proceeds).

## Step A3 — Externalized key resolver with in-place rotation

One sentence: fetch the App PEM (and peer public keys) from external custody at
startup, cache, and re-fetch on a signed-request failure so rotation lands
without a process restart.

- Created: `services/ghserver/src/key-resolver.js`
- Modified: `services/ghserver/server.js` (replace `assertNonEmpty(private_key)`
  - literal `createAppAuthCustody({ private_key })` with the resolver),
  `services/ghserver/src/app-auth.js` (accept a `privateKeyProvider` instead of
  a literal `private_key`)

Concrete change — `createKeyResolver({ custodyClient, clock })` exposes:

- `appPrivateKey()` → cached PEM; on a mint that fails signature, the resolver
  re-fetches once and retries, so a rotated key lands without redeploy.
- `peerPublicKeys()` → the `Map` consumed by Step A1.
- `custodyClient` is an injectable adapter (KMS / Secrets Manager); `server.js`
  binds the concrete one, the test injects a fake.
- Remove the `private_key` config key and its `assertNonEmpty` so no plaintext
  key path survives in the merged config (criterion 3).

Verification: `bun test test/key-resolver.test.js` (sign-after-rotate: first
fetch returns key1, signed-request failure triggers re-fetch returning key2,
retry succeeds) and `node scripts/check-byok-boundary.mjs` stays green
(parent agent owns `scripts/`; coordinate the run, do not edit the script).

## Step A4 — Rotation operator section

One sentence: document the key-rotation procedure for operators.

- Modified: `services/ghserver/README.md`

Concrete change: replace the "Credential custody and the deferred substrate"
section with an operator "Key rotation" section: where the key lives (external
custody), how to rotate (write the new key to custody; the resolver re-fetches
on the next signed-request failure, no redeploy), and the peer-token trust root
(per-caller public keys in the same custody). Drop the "deferred substrate" and
"unauthenticated at the peer level" language.

Verification: `services/ghserver/README.md` rotation section present; no
"deferred substrate" / "unauthenticated at the peer level" strings remain.

## Risks

- The custody client API is operator-environment-specific; keep it behind the
  injectable `custodyClient` adapter so the production binding in `server.js` is
  the only environment-coupled code and the resolver itself is testable.
- Rejected alternatives (mTLS; shared HMAC across callers — the existing
  `librpc/src/auth.js` `HmacAuth`) are recorded in design Key Decision 1; do not
  re-introduce a shared secret here.

— Staff Engineer 🛠️
