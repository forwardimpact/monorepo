# Services

The packages under `services/` are internal microservices that back products —
exposing domain capabilities over gRPC (and MCP) for composition by any
product. Agent-friendly interfaces, observable operations, and protocol bridges
that let agents consume backend functionality natively.

## Catalog

<!-- BEGIN:catalog — Do not edit. Generated from each service's package.json. -->

| Service       | Description                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **bridge**    | Canonical threaded-discussion store — single source of truth for GitHub/Microsoft Teams bridge state.                        |
| **embedding** | Text embeddings over gRPC — semantic representation without each product running its own inference.                          |
| **ghauth**    | GitHub user authentication — per-user OAuth token lifecycle for the Kata Agent User App.                                     |
| **ghbridge**  | GitHub Discussions bridge — relay messages between GitHub Discussion threads and the Kata agent team.                        |
| **graph**     | RDF knowledge graph over gRPC — relationship queries without each product standing up its own store.                         |
| **map**       | Activity reads and writes over gRPC — the agent-facing gateway to Map's activity database.                                   |
| **mcp**       | Unified MCP server — agents reach backend services as tools without per-service integration.                                 |
| **msbridge**  | Microsoft Teams bridge onto libbridge — relay messages between Teams conversations and the Kata agent team.                  |
| **oauth**     | OAuth 2.1 authorization server adapter — protocol-only HTTP front that delegates to a configured provider backend over gRPC. |
| **pathway**   | Engineering standard queries over gRPC — career paths and agent profiles as derivable data for products.                     |
| **trace**     | OpenTelemetry span ingestion and storage over gRPC — prove whether agent changes improved outcomes.                          |
| **vector**    | Vector similarity search over gRPC — semantic retrieval without a dedicated database per product.                            |

<!-- END:catalog -->

## Jobs To Be Done

<!-- BEGIN:jobs — Do not edit. Generated from each service's package.json. -->

<job user="Platform Builders" goal="Bridge Conversation Platforms to the Agent Team">

## Platform Builders: Bridge Conversation Platforms to the Agent Team

**Trigger:** Engineers discuss work in Microsoft Teams and need to
context-switch to GitHub to invoke the agent team.

**Big Hire:** Help me relay messages between a chat platform and the Kata agent
team without leaving the conversation. → **msbridge**

**Little Hire:** Help me dispatch a facilitate session from a chat message and
return the verdict to the same thread. → **msbridge**

**Competes With:** manually creating GitHub issues; copy-pasting between chat
and GitHub; leaving the agent team unreachable from daily conversation.

</job>

<job user="Platform Builders" goal="Bridge GitHub Discussions to the Agent Team">

## Platform Builders: Bridge GitHub Discussions to the Agent Team

**Trigger:** Engineers run RFCs in GitHub Discussions and need the Kata agent
team to engage humans across the 14-day coordination horizon.

**Big Hire:** Help me relay messages between GitHub Discussion threads and the
Kata agent team without the workflow owning channel-specific reply logic. →
**ghbridge**

**Little Hire:** Help me post a structured discussion reply from a workflow
callback and resume a recessed RFC when humans answer. → **ghbridge**

**Competes With:** composing GraphQL mutation strings inside facilitator
prompts; one-shot workflow runs that cannot await human responses; per-channel
duplication of intake skeletons.

</job>

<job user="Platform Builders" goal="Embed Text for Retrieval">

## Platform Builders: Embed Text for Retrieval

**Trigger:** Building a search feature and realizing every product is
copy-pasting the same HTTP embedding call with its own error handling.

**Big Hire:** Help me get embeddings from a shared service without managing
inference infrastructure. → **embedding**

**Little Hire:** Help me call one gRPC method instead of wiring HTTP, auth, and
retries per product. → **embedding**

**Competes With:** inline fetch calls; per-product embedding wrappers; skipping
semantic search entirely.

</job>

<job user="Platform Builders" goal="Expose Activity Data to Agents">

## Platform Builders: Expose Activity Data to Agents

**Trigger:** Building an agent feature that reads or writes activity data and
realizing the agent would need direct DB access.

**Big Hire:** Help me read and write activity data from any agent without
leaking schema or credentials. → **map**

**Little Hire:** Help me fetch unscored artifacts or write evidence rows without
touching Supabase directly. → **map**

**Competes With:** opening Supabase directly from the agent; building
per-product activity endpoints; embedding query logic in the evaluation skill.

</job>

<job user="Platform Builders" goal="Expose an OAuth 2.1 authorization server without provider-specific code">

## Platform Builders: Expose an OAuth 2.1 authorization server without provider-specific code

**Trigger:** A new identity provider needs to plug into the same authorization
flow without changing the protocol layer.

**Big Hire:** Help me serve standard OAuth 2.1 endpoints that delegate every
provider-specific step to a gRPC backend, keeping the HTTP surface
provider-agnostic. → **oauth**

**Little Hire:** Help me redirect an authorize request to the upstream provider
and exchange a callback code for a downstream token. → **oauth**

**Competes With:** per-provider HTTP services that mix OAuth protocol handling
with provider-specific exchange logic.

</job>

<job user="Platform Builders" goal="Ground Agents in Context">

## Platform Builders: Ground Agents in Context

**Trigger:** Needing to know how two concepts relate and realizing the answer is
scattered across files no one wants to join by hand; adding semantic search to a
product and realizing each one would need its own vector store.

**Big Hire:** Help me traverse a knowledge graph from a product without standing
up my own store; run semantic search from any product without standing up a
per-product database. → **graph, vector**

**Little Hire:** Help me answer relationship questions without writing join
logic; search for semantically related content without managing embeddings
storage. → **graph, vector**

**Competes With:** ad-hoc joins across flat files; embedding a triple store in
each product; skipping the relationship question entirely; per-product vector
databases; keyword search instead of semantic; skipping retrieval entirely.

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

<job user="Platform Builders" goal="Keep Service Contracts Typed">

## Platform Builders: Keep Service Contracts Typed

**Trigger:** Adding a new gRPC service and realizing each one needs its own MCP
glue to become an agent tool.

**Big Hire:** Help me expose every backend service as agent tools through one
server. → **mcp**

**Little Hire:** Help me add a service to the MCP surface without writing
integration code. → **mcp**

**Competes With:** per-service MCP wrappers; hand-writing tool schemas for each
endpoint; leaving services unreachable by agents.

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

<job user="Platform Builders" goal="Resolve a per-user GitHub token for agent dispatch">

## Platform Builders: Resolve a per-user GitHub token for agent dispatch

**Trigger:** A chat surface needs to dispatch a workflow under the identity of
the human who asked, not a shared bot token.

**Big Hire:** Help me own the Kata Agent User App credential lifecycle
end-to-end so every surface resolves a per-user GitHub token through one gRPC
query. → **ghauth**

**Little Hire:** Help me exchange an authorization code for a user-to-server
token, store the binding, refresh on expiry, and return a typed link/re-auth
result when the binding is missing or revoked. → **ghauth**

**Competes With:** per-surface OAuth implementations duplicating the
authorization-code flow, token storage, and refresh logic across multiple bridge
services.

</job>

<job user="Platform Builders" goal="Share Threaded Conversation State Across Bridges">

## Platform Builders: Share Threaded Conversation State Across Bridges

**Trigger:** Adding a second bridge and realizing each one owns its own private
store with no way to query across channels.

**Big Hire:** Help me share threaded conversation state across bridges without
each one managing its own storage. → **bridge**

**Little Hire:** Help me load or save a discussion record and trust it is
visible to every bridge. → **bridge**

**Competes With:** per-bridge JSONL files; in-process discussion stores;
tolerating the partition.

</job>

<!-- END:jobs -->
