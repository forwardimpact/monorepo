# Services

The packages under `services/` are internal microservices that back the
products. They expose domain capabilities over gRPC and MCP, so any product can
compose them. They give agent-friendly interfaces, observable operations, and
protocol bridges that let agents use backend functionality natively.

## Catalog

<!-- BEGIN:catalog — Do not edit. Generated from each service's package.json. -->

| Service       | Description                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **bridge**    | Canonical threaded-discussion store — single source of truth for GitHub/Microsoft Teams bridge state.                                     |
| **embedding** | Text embeddings over gRPC — semantic representation without each product running its own inference.                                       |
| **ghbridge**  | GitHub Discussions bridge — relay messages between GitHub Discussion threads and the Kata agent team.                                     |
| **ghserver**  | GitHub App key custody and a surface that mints short-lived installation tokens for the hosted control plane.                             |
| **ghuser**    | GitHub user authentication — per-user OAuth token lifecycle for the Kata Agent User App.                                                  |
| **graph**     | RDF knowledge graph over gRPC — relationship queries without a separate store in each product.                                            |
| **map**       | Activity reads and writes over gRPC — the agent-facing gateway to Map's activity database.                                                |
| **mcp**       | Unified MCP server — agents reach backend services as tools without per-service integration.                                              |
| **msbridge**  | Microsoft Teams bridge onto libbridge — relay messages between Teams conversations and the Kata agent team.                               |
| **oauth**     | OAuth 2.1 authorization server adapter — protocol-only HTTP front that delegates to a configured provider backend over gRPC.              |
| **oidc**      | GitHub Actions OIDC exchange front — validates a workflow OIDC token and mints a repo-scoped installation token without signing material. |
| **pathway**   | Engineering standard queries over gRPC — career paths and agent profiles as derivable data for products.                                  |
| **span**      | OpenTelemetry span ingestion and storage over gRPC — prove whether agent changes improved outcomes.                                       |
| **tenancy**   | Tenant registry — `(channel, channel_tenant_key) → Tenant` lookup for the hosted control plane.                                           |
| **vector**    | Vector similarity search over gRPC — semantic retrieval without a dedicated database per product.                                         |

<!-- END:catalog -->

## Jobs To Be Done

<!-- BEGIN:jobs — Do not edit. Generated from each service's package.json. -->

<job user="Platform Builders" goal="Bridge Conversations to the Agent Team">

## Platform Builders: Bridge Conversations to the Agent Team

**Trigger:** Engineers discuss work in chat and GitHub Discussions while the
agent team is reachable only from GitHub, and every new channel adapter
re-solves intake, thread state, and tenant routing; engineers discuss work in
chat and GitHub Discussions. The agent team is reachable only from GitHub. Every
new channel adapter re-solves intake, thread state, and tenant routing.

**Big Hire:** Help me relay conversations between the channels engineers already
use and the agent team, with thread state and tenant resolution handled once;
relay conversations between the channels engineers already use and the agent
team. Keep thread state and tenant resolution in one place. → **bridge,
ghbridge, msbridge, tenancy**

**Little Hire:** Help me load or save a discussion record and trust it is
visible to every bridge; post a structured discussion reply from a workflow
callback and resume a recessed RFC when humans answer; dispatch a facilitate
session from a chat message. Return the verdict to the same thread; look up a
tenant by channel key, by GitHub repo, or by tenant id. Upsert on installation
or consent events. Record state transitions through
`pending_consent → active → revoked`. → **bridge, ghbridge, msbridge, tenancy**

**Competes With:** manually creating GitHub issues; copy-pasting between chat
and GitHub; per-channel duplication of intake skeletons; ephemeral thread state
that vanishes on restart; manual creation of GitHub issues; copy-and-paste
between chat and GitHub.

</job>

<job user="Platform Builders" goal="Broker Scoped Credentials for Agents">

## Platform Builders: Broker Scoped Credentials for Agents

**Trigger:** Agent infrastructure needs GitHub and OAuth tokens, but private
keys and long-lived secrets must stay out of workflows and public-facing
processes; agent infrastructure needs GitHub and OAuth tokens. Private keys and
long-lived secrets must stay out of workflows and public-facing processes.

**Big Hire:** Help me issue short-lived, scoped credentials to agents and
workflows while signing material stays in one custody service. → **ghserver,
ghuser, oauth, oidc**

**Little Hire:** Help me resolve the requesting repo to an active tenant,
enforce a per-tenant mint-rate ceiling, and return a fresh installation token
bound to the resolved installation; exchange an authorization code for a
user-to-server token, store the binding, and refresh it on expiry. Return a
typed link/re-auth result when the binding is missing or revoked; redirect an
authorize request to the upstream provider. Exchange a callback code for a
downstream token; validate the inbound OIDC token's signature, issuer, audience,
and repository claim. Then call the custody backend to mint a token scoped to
the asserted repository. → **ghserver, ghuser, oauth, oidc**

**Competes With:** shipping the App private key into every workflow as a
repository secret; long-lived personal access tokens; per-provider HTTP services
that mix protocol handling with exchange logic; the App private key in every
workflow as a repository secret; per-provider HTTP services that handle the
protocol and the exchange logic together.

</job>

<job user="Platform Builders" goal="Enable Agents on Every Surface">

## Platform Builders: Enable Agents on Every Surface

**Trigger:** Agents need to call platform services as tools. Every product
hand-writes MCP wrappers around the same gRPC methods.

**Big Hire:** Help me expose typed service contracts as MCP tools so agents
reach the same capabilities humans do, without per-product wrapper code. →
**mcp**

**Little Hire:** Help me add a service to the MCP surface without integration
code. → **mcp**

**Competes With:** hand-written MCP servers per product; HTTP shims around gRPC
services; agents with no tools.

</job>

<job user="Platform Builders" goal="Ground Agents in Context">

## Platform Builders: Ground Agents in Context

**Trigger:** An agent needs to answer relationship questions, search by meaning,
or read activity data. The only alternative is direct database access and
per-product plumbing.

**Big Hire:** Help me give agents graph queries, semantic search, embeddings,
and activity data through shared services that never leak schema or credentials.
→ **embedding, graph, map, vector**

**Little Hire:** Help me call one gRPC method instead of wiring HTTP, auth, and
retries per product; answer relationship questions without join logic; fetch
unscored artifacts or write evidence rows without direct Supabase access; search
for semantically related content without embeddings storage to manage. →
**embedding, graph, map, vector**

**Competes With:** direct database access from agents; per-product retrieval
endpoints; inline fetch calls; external search infrastructure; no semantic
search at all.

</job>

<job user="Platform Builders" goal="Integrate with the Engineering Standard">

## Platform Builders: Integrate with the Engineering Standard

**Trigger:** A developer builds a product feature that needs career paths or
agent profiles. The derivation logic must then live in the product.

**Big Hire:** Help me query the engineering standard from any product without
embedded derivation logic. → **pathway**

**Little Hire:** Help me fetch a derived role or agent profile without a second
implementation of the derivation. → **pathway**

**Competes With:** libskill embedded in each product; duplicate derivation
logic; hardcoded role definitions.

</job>

<job user="Platform Builders" goal="Prove Agent Changes">

## Platform Builders: Prove Agent Changes

**Trigger:** An engineer finishes an agent improvement. No centralized place
exists to store and compare spans.

**Big Hire:** Help me collect spans from any product without separate storage in
each one. → **span**

**Little Hire:** Help me send spans from a product. Trust they are queryable
later. → **span**

**Competes With:** per-product span files; manual log comparison; no
observability at all.

</job>

<!-- END:jobs -->
