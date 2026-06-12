# Services

The packages under `services/` are internal microservices that back products —
exposing domain capabilities over gRPC (and MCP) for composition by any
product. Agent-friendly interfaces, observable operations, and protocol bridges
that let agents consume backend functionality natively.

## Catalog

<!-- BEGIN:catalog — Do not edit. Generated from each service's package.json. -->

| Service       | Description                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **bridge**    | Canonical threaded-discussion store — single source of truth for GitHub/Microsoft Teams bridge state.                                             |
| **embedding** | Text embeddings over gRPC — semantic representation without each product running its own inference.                                               |
| **ghbridge**  | GitHub Discussions bridge — relay messages between GitHub Discussion threads and the Kata agent team.                                             |
| **ghserver**  | GitHub App key custody and short-lived installation-token minting surface for the hosted control plane.                                           |
| **ghuser**    | GitHub user authentication — per-user OAuth token lifecycle for the Kata Agent User App.                                                          |
| **graph**     | RDF knowledge graph over gRPC — relationship queries without each product standing up its own store.                                              |
| **map**       | Activity reads and writes over gRPC — the agent-facing gateway to Map's activity database.                                                        |
| **mcp**       | Unified MCP server — agents reach backend services as tools without per-service integration.                                                      |
| **msbridge**  | Microsoft Teams bridge onto libbridge — relay messages between Teams conversations and the Kata agent team.                                       |
| **oauth**     | OAuth 2.1 authorization server adapter — protocol-only HTTP front that delegates to a configured provider backend over gRPC.                      |
| **oidc**      | GitHub Actions OIDC exchange front — validates a workflow OIDC token and mints a repo-scoped installation token without holding signing material. |
| **pathway**   | Engineering standard queries over gRPC — career paths and agent profiles as derivable data for products.                                          |
| **tenancy**   | Tenant registry — `(channel, channel_tenant_key) → Tenant` lookup for the hosted control plane.                                                   |
| **trace**     | OpenTelemetry span ingestion and storage over gRPC — prove whether agent changes improved outcomes.                                               |
| **vector**    | Vector similarity search over gRPC — semantic retrieval without a dedicated database per product.                                                 |

<!-- END:catalog -->

## Jobs To Be Done

<!-- BEGIN:jobs — Do not edit. Generated from each service's package.json. -->

<job user="Platform Builders" goal="Bridge Conversations to the Agent Team">

## Platform Builders: Bridge Conversations to the Agent Team

**Trigger:** Engineers discuss work in chat and GitHub Discussions while the
agent team is reachable only from GitHub, and every new channel adapter
re-solves intake, thread state, and tenant routing.

**Big Hire:** Help me relay conversations between the channels engineers already
use and the agent team, with thread state and tenant resolution handled once. →
**bridge, ghbridge, msbridge, tenancy**

**Little Hire:** Help me load or save a discussion record and trust it is
visible to every bridge; post a structured discussion reply from a workflow
callback and resume a recessed RFC when humans answer; dispatch a facilitate
session from a chat message and return the verdict to the same thread; look up a
tenant by channel key, by GitHub repo, or by tenant id; upsert on installation
or consent events; record state transitions through
`pending_consent → active → revoked`. → **bridge, ghbridge, msbridge, tenancy**

**Competes With:** manually creating GitHub issues; copy-pasting between chat
and GitHub; per-channel duplication of intake skeletons; ephemeral thread state
that vanishes on restart.

</job>

<job user="Platform Builders" goal="Broker Scoped Credentials for Agents">

## Platform Builders: Broker Scoped Credentials for Agents

**Trigger:** Agent infrastructure needs GitHub and OAuth tokens, but private
keys and long-lived secrets must stay out of workflows and public-facing
processes.

**Big Hire:** Help me issue short-lived, scoped credentials to agents and
workflows while signing material stays in one custody service. → **ghserver,
ghuser, oauth, oidc**

**Little Hire:** Help me resolve the requesting repo to an active tenant,
enforce a per-tenant mint-rate ceiling, and return a fresh installation token
bound to the resolved installation; exchange an authorization code for a
user-to-server token, store the binding, refresh on expiry, and return a typed
link/re-auth result when the binding is missing or revoked; redirect an
authorize request to the upstream provider and exchange a callback code for a
downstream token; validate the inbound OIDC token's signature, issuer, audience,
and repository claim, then call the custody backend to mint a token scoped to
the asserted repository. → **ghserver, ghuser, oauth, oidc**

**Competes With:** shipping the App private key into every workflow as a
repository secret; long-lived personal access tokens; per-provider HTTP services
that mix protocol handling with exchange logic.

</job>

<job user="Platform Builders" goal="Enable Agents on Every Surface">

## Platform Builders: Enable Agents on Every Surface

**Trigger:** Agents need to call platform services as tools, and every product
is hand-writing MCP wrappers around the same gRPC methods.

**Big Hire:** Help me expose typed service contracts as MCP tools so agents
reach the same capabilities humans do, without per-product wrapper code. →
**mcp**

**Little Hire:** Help me add a service to the MCP surface without writing
integration code. → **mcp**

**Competes With:** hand-written MCP servers per product; HTTP shims around gRPC
services; agents working without tools.

</job>

<job user="Platform Builders" goal="Ground Agents in Context">

## Platform Builders: Ground Agents in Context

**Trigger:** An agent needs to answer relationship questions, search by meaning,
or read activity data, and the only alternative is direct database access and
per-product plumbing.

**Big Hire:** Help me give agents graph queries, semantic search, embeddings,
and activity data through shared services that never leak schema or credentials.
→ **embedding, graph, map, vector**

**Little Hire:** Help me call one gRPC method instead of wiring HTTP, auth, and
retries per product; answer relationship questions without writing join logic;
fetch unscored artifacts or write evidence rows without touching Supabase
directly; search for semantically related content without managing embeddings
storage. → **embedding, graph, map, vector**

**Competes With:** direct database access from agents; per-product retrieval
endpoints; inline fetch calls; external search infrastructure; skipping semantic
search entirely.

</job>

<job user="Platform Builders" goal="Integrate with the Engineering Standard">

## Platform Builders: Integrate with the Engineering Standard

**Trigger:** Building a product feature that needs career paths or agent
profiles and realizing the derivation logic would have to live in the product.

**Big Hire:** Help me query the engineering standard from any product without
embedding derivation logic. → **pathway**

**Little Hire:** Help me fetch a derived role or agent profile without
reimplementing the derivation. → **pathway**

**Competes With:** embedding libskill in each product; duplicating derivation
logic; hardcoding role definitions.

</job>

<job user="Platform Builders" goal="Prove Agent Changes">

## Platform Builders: Prove Agent Changes

**Trigger:** Finishing an agent improvement and realizing there is no
centralized place to store and compare trace spans.

**Big Hire:** Help me collect trace spans from any product without each one
managing its own storage. → **trace**

**Little Hire:** Help me send spans from a product and trust they are queryable
later. → **trace**

**Competes With:** per-product trace files; manual log comparison; skipping
observability entirely.

</job>

<!-- END:jobs -->
