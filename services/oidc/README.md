# Oidc

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

GitHub Actions OIDC exchange front — validates a workflow OIDC token and mints a
repo-scoped installation token without holding signing material.

<!-- END:description -->

## What this service owns

`services/oidc` is the **public-facing** front of the hosted control plane's
credential path. A GitHub Actions workflow presents its OIDC token. The
service verifies that identity and returns a repo-scoped installation token
that `services/ghserver` mints. It holds **no** signing material. It mirrors
the `services/oauth` → `services/ghuser` protocol-front pattern, where the one
process that listens publicly never touches the App private key.

### Token exchange contract

```text
POST /token
Authorization: bearer <github-actions-oidc-token>
→ 200 { installation_token, expires_at }
```

The workflow requests its OIDC token with the configured audience
(`fit-ghserver`). `services/oidc`:

1. Verifies the JWS signature against the issuer's JWKS, plus `iss`,
   `aud`, `exp`, and `nbf`.
2. Extracts the `repository` claim as `{owner}/{name}`.
3. Calls `services/ghserver.MintInstallationToken({ owner, name })` over
   the control-plane internal network.
4. Returns the installation token.

### Failure mapping

| Condition                       | HTTP |
| ------------------------------- | ---- |
| Missing `Authorization: bearer` | 401  |
| Invalid signature / expired     | 401  |
| Wrong issuer / wrong audience   | 403  |
| Missing `repository` claim      | 400  |
| Repo not provisioned (mint)     | 404  |
| Per-tenant rate limit (mint)    | 429  |

## JWKS rotation

GitHub's OIDC issuer or JWKS endpoint may rotate. The service caches the JWKS
for a bounded TTL (`jwks_ttl_ms`, default 10 minutes). On a
signature-verification failure the validator invalidates the cache once and
retries. It recovers from rotation without a forced restart.

## Configuration

Loaded with `createServiceConfig("oidc")`:

| Env var                    | Default                                          | Purpose                                  |
| -------------------------- | ------------------------------------------------ | ---------------------------------------- |
| `SERVICE_OIDC_PROVIDER`    | `ghserver`                                        | Mint backend (resolved as a gRPC client) |
| `SERVICE_OIDC_ISSUER`      | `https://token.actions.githubusercontent.com`     | Expected OIDC `iss`                       |
| `SERVICE_OIDC_AUDIENCE`    | `fit-ghserver`                                     | Expected OIDC `aud`                       |
| `SERVICE_OIDC_JWKS_TTL_MS` | `600000`                                          | JWKS cache TTL (ms)                      |
| `SERVICE_OIDC_PORT`        | `3008`                                            | Listen port                              |

## Running

Add `oidc` to `config/config.json` under `init.services` (see
[`config/CLAUDE.md`](../../config/CLAUDE.md) for entry format). In
single-tenant deployments you do **not** start the service. The bridge reads
`KATA_APP_PRIVATE_KEY` directly. `services/oidc` uses the same tunnel-fronted
ingress pattern that `services/oauth` already uses.
