# Spec 1320: Per-user GitHub authentication for chat-surface dispatch

**Persona / job:** Teams Using Agents —
[Run a continuously improving agent team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team).
(Secondary: Platform Builders gain a reusable auth capability rather than
per-surface glue.)

## Problem

When a human dispatches the Kata Agent Team from a chat surface, the
`workflow_dispatch` call runs under a **single shared GitHub token**, not the
identity of the person who asked:

- `msbridge` constructs its `Dispatcher` with `getGithubToken` closing over a
  static configured token (`ghToken`).
- `ghbridge` constructs its `Dispatcher` with `getGithubToken` returning the
  **Kata Agent Team** App installation token.

Two consequences follow from this evidence:

- **No per-user authorization.** Anyone who can post in the channel triggers a
  dispatch carrying the team's full privileges. GitHub never gets the chance to
  enforce whether *that requester* may run the workflow on the repo. The trust
  decision is re-implemented in-channel (contributor allowlists) instead of
  delegated to GitHub's own permission model.
- **No attribution.** The run is not traceable to the human who initiated it,
  only to the shared identity.

A third surface is planned — **Claude Chat**, the seventh entry the Kata
surfaces model in KATA.md will gain (separate follow-up spec) — which will need
the same per-user GitHub authority. Without a shared mechanism, each surface
re-implements the authorization-code flow, token storage, refresh, and
revocation handling. That duplication is both wasteful and a security hazard:
authorization-flow and token-lifecycle handling are easy to get subtly wrong,
and spreading secret-bearing code across three services widens the attack
surface.

There is today **no shared way** for a human on any chat surface to link their
GitHub identity once and have subsequent agent dispatches performed under their
own GitHub authority.

## Proposal

Introduce two services that, together, let any chat surface resolve a
**per-user GitHub token** for dispatch. The split follows the same shape as the
existing `services/mcp/` service: a thin protocol-only front service that holds
no domain secrets and delegates to gRPC backend(s).

| Service          | Interface | Responsibility                                                                                                                 |
| ---------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `services/oauth/`  | HTTP      | Speaks the OAuth 2.1 authorization-server protocol only. Holds no provider secrets and no tokens. Delegates every provider-specific step to a configured gRPC provider backend. |
| `services/ghauth/` | gRPC      | Implements all GitHub specifics: the **Kata Agent User** App (user-to-server) authorization-code exchange, refresh, and revoke; durable storage of the user↔identity↔token binding; and a query returning a usable token (or a typed "link required" / "re-auth required" result) for a given surface user. |

The relationship mirrors `services/mcp/` ↔ its gRPC backends in **role**, not in
exact wiring: `mcp` is a protocol-only HTTP adapter that translates MCP requests
into typed gRPC calls against backend services, exposing what `config.json`
declares; `oauth` is a protocol-only HTTP adapter that translates the OAuth
dance into typed gRPC calls against a provider backend it is configured to use.
Neither front service contains domain logic; both keep the protocol layer thin
and the backend stateful. A future second identity provider drops in as a new
gRPC service plus configuration, without changing `oauth`'s code.

`ghauth` is consumed two ways: by `oauth` (driving the user-facing authorization
dance over HTTP) and **directly over gRPC** by internal services that need a
token for a known surface user. The first such consumers will be `msbridge` and
`ghbridge` (separate follow-up spec); this spec's contract is designed to fully
satisfy their needs.

### Grounding consumers (in-scope requirements; consumers built later)

The deliverables here are only `oauth` + `ghauth`. The `ghauth` contract is
nonetheless a committed requirement of this spec, shaped against what the
bridges will require:

- A bridge holds a `(channel, participant.external_id)` pair for the human who
  posted. The `ghauth` query interface must accept exactly this shape — a
  surface identifier plus the surface's native user id — and return a token
  consumable as `libbridge`'s `Dispatcher` `getGithubToken` result (whose
  contract is `() => Promise<string> | string`).
- When the surface user has not linked GitHub, the query must return a typed
  "link required" result carrying the authorize URL the bridge can show the
  user, **not** an opaque error.
- When a stored token is revoked or expired and cannot be refreshed, the query
  must return a typed "re-auth required" result, distinguishable from a
  transient failure, so the bridge can prompt re-linking rather than retrying.

These three properties are validated by `ghauth`'s own tests in this spec; the
end-to-end exercise through a real bridge belongs to the follow-up spec.

## Two GitHub Apps (clarified; only one in scope)

| App                  | Auth model       | Owned by                          | This spec       |
| -------------------- | ---------------- | --------------------------------- | --------------- |
| **Kata Agent Team**  | server-to-server | existing config / agent workflows | unchanged       |
| **Kata Agent User**  | user-to-server   | `services/ghauth/` (new secrets)  | introduced here |

`ghauth` owns only the **Kata Agent User** App's credentials. The Team App's
secrets and usage are untouched.

## Scope

**In scope:**

- `services/oauth/` — new HTTP service exposing the OAuth 2.1 authorization-
  server protocol surface (the standard authorization-server endpoints plus a
  provider-callback endpoint), with the provider backend chosen from
  configuration rather than hard-coded.
- `services/ghauth/` — new gRPC service: Kata Agent User App authorization-code
  exchange / refresh / revoke; durable, restart-surviving storage of the
  `(surface, surface_user_id)` ↔ GitHub identity ↔ token binding; query
  interface returning a usable token or a typed link/re-auth result.
- Configuration and `fit-rc` `init.services` entries for both services, per the
  `services/CLAUDE.md` convention.
- Service `README.md` + `package.json` metadata for both, per
  `services/CLAUDE.md`.

**Out of scope (explicit):**

- `services/kata/` (the Claude Chat dispatch-tool service).
- `services/mcp/` changes and Claude Chat connector registration.
- `msbridge` / `ghbridge` adopting the new interface (follow-up spec).
- The **Kata Agent Team** App (recorded in the table above; not modified).
- Cross-surface identity unification (treating the same human as one identity
  across two surfaces). Each `(surface, surface_user_id)` binding is
  independent.

## Success criteria

| # | Criterion | Verification |
| - | --------- | ------------ |
| 1 | `ghauth` starts under `fit-rc` and a smoke gRPC call returns a response (not a connection error). | `bunx fit-rc start ghauth`; `services/ghauth/test/smoke.test.js` |
| 2 | `oauth` serves a valid OAuth 2.1 authorization-server metadata document, and its authorize endpoint issues a redirect to the configured provider's authorization URL. | `services/oauth/test/metadata.test.js`, `services/oauth/test/authorize.test.js` |
| 3 | The provider backend is chosen from configuration; `services/oauth/`'s **source** contains no GitHub-specific code. | `rg -i 'github|octokit' services/oauth/ -g '!test/' -g '!*.md'` returns nothing (incidental mentions in tests/docs allowed) |
| 4 | For a linked surface user with a valid stored token, the query returns that token unchanged. | `services/ghauth/test/query-linked.test.js` |
| 5 | For an unlinked surface user, the query returns a typed "link required" result carrying an authorize URL (and no token). | `services/ghauth/test/query-unlinked.test.js` |
| 6 | For a stored token that is expired and cannot be refreshed (or has been revoked), the query returns a typed "re-auth required" result, distinct from both a valid token and a transient error. | `services/ghauth/test/query-reauth.test.js` |
| 7 | A token binding written before a restart is readable after a fresh service start. | `services/ghauth/test/persistence.test.js` |
| 8 | The query interface accepts a `(surface, surface_user_id)` argument pair and, for a linked user, yields a value of type `string` (directly usable as a `getGithubToken` result). | `services/ghauth/test/query-contract.test.js` |
