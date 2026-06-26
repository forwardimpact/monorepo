# Shared Libraries

The packages under `libraries/` are agent-shaped utilities — designed for
agentic systems from the ground up. Agent-friendly CLIs and output formats,
retrieval primitives that surface rich grounded context, evaluation tooling that
closes the self-improvement loop, and service infrastructure with knobs agents
can read and tune via JSON.

## Catalog

<!-- BEGIN:catalog — Do not edit. Generated from each library's package.json. -->

| Library                | Description                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **libbridge**          | Threaded-channel bridge primitives — relay messages between human channels (GitHub Discussions, Microsoft Teams) and the Kata agent team.       |
| **libcli**             | Agent-friendly CLIs — self-documenting entry points that humans and agents reach through the same interface.                                    |
| **libcoaligned**       | Co-Aligned architecture checks — enforce instruction-layer length caps, JTBD invariants, and the repo's own declarative invariant rule modules. |
| **libcodegen**         | Protobuf code generation — keep types in sync with proto definitions without hand-writing.                                                      |
| **libconfig**          | Environment-aware application settings — services and CLIs load configuration without custom plumbing.                                          |
| **libdoc**             | Static documentation sites from markdown — publish docs without a framework.                                                                    |
| **libformat**          | Render markdown to ANSI or HTML — formatted output in any surface without losing structure.                                                     |
| **libgraph**           | RDF triple store with named ontologies — answer relationship questions without writing join logic.                                              |
| **libharness**         | Agent evaluation framework — prove whether agent changes improved outcomes with reproducible evidence.                                          |
| **libhttp**            | HTTP service framework — ship a Hono service endpoint without reimplementing lifecycle, security headers, or health checks.                     |
| **libindex**           | JSONL-backed indexes with filtering and buffered writes — fast context lookup without an external search engine.                                |
| **libmacos**           | macOS bundle assembly, code signing, and OS permission helpers — desktop delivery without platform ceremony.                                    |
| **libmcp**             | Config-driven gRPC-to-MCP tool registration — expose protobuf services as agent tools without glue code.                                        |
| **libmock**            | Shared mocks and test fixtures so every library and service tests the same way.                                                                 |
| **libpack**            | Pack distribution — tarballs, bare git repos, and skill discovery indices                                                                       |
| **libpolicy**          | Access-control policy evaluation — scoped context access without per-service authorization logic.                                               |
| **libpreflight**       | Fail fast at process start with product-authored errors — runtime-floor checks and required-config assertions before heavy imports resolve.     |
| **libprompt**          | Prompt templates from .prompt.md files — structured prompts without string concatenation.                                                       |
| **libproto**           | Shared protobuf schemas — one editable source for the service contracts every product imports.                                                  |
| **librc**              | Service lifecycle management — start, stop, and check services without manual oversight.                                                        |
| **librepl**            | Agent-friendly interactive REPL — exploratory interfaces that humans and agents navigate the same way.                                          |
| **libresource**        | Typed resources with identifiers and rich context chunks — trustworthy, retrievable knowledge for agent grounding.                              |
| **librpc**             | gRPC server and client framework — ship service endpoints without reimplementing transport.                                                     |
| **libsecret**          | Secret generation, JWT signing, and .env file management for services and CLIs.                                                                 |
| **libskill**           | Derive skill matrices, agent profiles, and job definitions from standard data — the engineering standard made queryable.                        |
| **libstorage**         | Pluggable file storage — local, S3, or Supabase behind a single interface.                                                                      |
| **libsupervise**       | Process supervision driven by JSON daemon manifests — services stay running and recoverable without manual intervention.                        |
| **libsyntheticgen**    | DSL parser and deterministic entity graph generator — repeatable eval fixtures so results are reproducible.                                     |
| **libsyntheticprose**  | LLM-generated prose and YAML — realistic evaluation content so agent improvements are tested against lifelike data.                             |
| **libsyntheticrender** | Multi-format rendering of synthetic evaluation data — validate fixtures before they enter the eval pipeline.                                    |
| **libtelemetry**       | Structured logging and trace spans — observable operations so problems surface before they escalate.                                            |
| **libtemplate**        | Mustache template loader with project-level overrides — consistent rendered output across surfaces.                                             |
| **libterrain**         | Full synthetic data pipeline — generate, render, and validate evaluation datasets end to end.                                                   |
| **libtype**            | Generated protobuf types and namespaces — one source of truth for service contracts.                                                            |
| **libui**              | Agent-friendly web surfaces — share handler logic across web and terminal so capabilities ship once, not twice.                                 |
| **libutil**            | Cross-cutting utilities: retry, hashing, token counting, and project discovery.                                                                 |
| **libvector**          | Vector dot-product scoring — find semantically related content without a dedicated database.                                                    |
| **libwiki**            | Wiki lifecycle primitives — stable memory for agent teams so coordination persists across sessions.                                             |
| **libxmr**             | Wheeler/Vacanti XmR control charts — distinguish signal from noise so agent teams act on real changes, not fluctuations.                        |

<!-- END:catalog -->

## Jobs To Be Done

<!-- BEGIN:jobs — Do not edit. Generated from each library's package.json. -->

<job user="Empowered Engineers" goal="Operate a Predictable Agent Team">

## Empowered Engineers: Operate a Predictable Agent Team

**Trigger:** An agent finishes a session and its findings vanish because there
is no shared memory to write them to; a metric changes and the team debates
whether it is a real shift or just noise.

**Big Hire:** Help me give agent teams stable memory that persists across
sessions; distinguish signal from noise so the team acts on real changes, not
fluctuations. → **libwiki, libxmr**

**Little Hire:** Help me send a memo or update a storyboard without managing the
wiki infrastructure; chart a metric and see whether the latest point is within
expected variation. → **libwiki, libxmr**

**Competes With:** git commit messages as memory; ephemeral conversation
context; starting every session from scratch; eyeballing trend lines; arbitrary
thresholds; ignoring metrics because no one trusts them.

</job>

<job user="Platform Builders" goal="Bridge Conversations to the Agent Team">

## Platform Builders: Bridge Conversations to the Agent Team

**Trigger:** Engineers discuss work in chat and GitHub Discussions while the
agent team is reachable only from GitHub, and every new channel adapter
re-solves intake, thread state, and tenant routing.

**Big Hire:** Help me relay conversations between the channels engineers already
use and the agent team, with thread state and tenant resolution handled once. →
**libbridge**

**Little Hire:** Help me register a callback token, build a bounded prompt, and
dispatch a workflow without managing each piece directly. → **libbridge**

**Competes With:** manually creating GitHub issues; copy-pasting between chat
and GitHub; per-channel duplication of intake skeletons; ephemeral thread state
that vanishes on restart.

</job>

<job user="Platform Builders" goal="Enable Agents on Every Surface">

## Platform Builders: Enable Agents on Every Surface

**Trigger:** Building an interface and realizing agents can't discover or
navigate it the same way humans do; rendering output in a new surface and
getting broken structure or inconsistent results; building a web view for a
product and realizing the handler logic is already written for the CLI but
locked to the terminal.

**Big Hire:** Help me give agents and humans the same interface so capabilities
don't need separate paths; render structured, consistent output across surfaces
without per-target formatting code; ship a web surface reusing the same handler
logic as the terminal. → **libcli, libformat, librepl, libtemplate, libui**

**Little Hire:** Help me add a capability and know both humans and agents can
reach it without a separate integration; add a rendering target or override
without duplicating formatting logic; add a capability once and have it appear
in both web and terminal. → **libcli, libformat, librepl, libtemplate, libui**

**Competes With:** hand-written argument parsing; separate agent and human
interfaces; tolerating agents that can't self-serve; raw unformatted output;
per-surface formatting code; tolerating inconsistent rendering; duplicating
handlers per surface; terminal-only products; building a separate web app from
scratch.

</job>

<job user="Platform Builders" goal="Ground Agents in Context">

## Platform Builders: Ground Agents in Context

**Trigger:** Needing to know how two concepts relate and realizing the answer is
scattered across files no one maintains; searching for context in a growing
dataset and realizing a full-text engine is overkill but grep is too slow;
passing context to an agent and realizing the payload is an untyped blob with no
provenance or access control; adding semantic search to a tool and realizing it
needs a vector database just to score a few hundred embeddings.

**Big Hire:** Help me answer relationship questions without writing join logic;
look up context fast without an external search engine; give agents typed,
retrievable knowledge they can trust; find semantically related content without
a dedicated database. → **libgraph, libindex, libresource, libvector**

**Little Hire:** Help me query a named ontology and trust the triples are
consistent; filter and scan a JSONL index without loading it all into memory;
resolve a resource by identifier and get a rich context chunk, not a raw file;
score a query against an index and get ranked results in memory. → **libgraph,
libindex, libresource, libvector**

**Competes With:** ad-hoc file joins; embedding relationship data in each
consumer; skipping the relationship question; full-text search engines; raw file
scanning; loading entire datasets into memory; passing raw file contents;
untyped JSON payloads; skipping provenance and hoping the agent figures it out;
external vector databases; keyword search instead of semantic; skipping
retrieval entirely.

</job>

<job user="Platform Builders" goal="Integrate with the Engineering Standard">

## Platform Builders: Integrate with the Engineering Standard

**Trigger:** Needing engineers to install skill packs and realizing each
ecosystem expects a different artifact format; building a product feature that
needs skill matrices or job definitions and realizing the YAML is raw data, not
queryable structure.

**Big Hire:** Help me distribute skill packs so agents and engineers can install
them through their preferred tool; turn engineering standard definitions into
queryable, derivable data. → **libpack, libskill**

**Little Hire:** Help me add a distribution format without reimplementing the
staging and orchestration loop; derive a skill matrix or agent profile without
parsing YAML by hand. → **libpack, libskill**

**Competes With:** inlining pack logic in each product command; hand-rolling tar
and git plumbing per consumer; maintaining parallel format-specific scripts;
parsing YAML files directly; hardcoding role definitions; skipping derivation
and displaying raw data.

</job>

<job user="Platform Builders" goal="Keep Service Contracts Typed">

## Platform Builders: Keep Service Contracts Typed

**Trigger:** A service contract changes and the drift surfaces at runtime, in a
client, an endpoint, or an MCP tool that no longer matches the proto.

**Big Hire:** Help me generate types, clients, endpoints, and MCP tools from one
proto source so contracts cannot drift. → **libcodegen, libhttp, libmcp,
libproto, librpc, libtype**

**Little Hire:** Help me change a proto definition and trust the JavaScript
types follow; mount routes on a configured app and call start(); expose a new
proto method as an agent tool without touching tool registration; import a
shared proto and trust the consumer of my service can read it; call a service
without managing connections or retries; reference a service type and trust it
matches the proto definition. → **libcodegen, libhttp, libmcp, libproto, librpc,
libtype**

**Competes With:** hand-rolled clients and JSON contracts; per-service endpoint
boilerplate; hand-written MCP wrappers; trusting that callers and services
agree.

</job>

<job user="Platform Builders" goal="Prove Agent Changes">

## Platform Builders: Prove Agent Changes

**Trigger:** An eval passes locally but fails in CI and the only output is
'assertion failed.'; setting up an eval and realizing you need to coordinate
generation, rendering, and validation across three libraries.

**Big Hire:** Help me prove whether agent changes improved outcomes with
reproducible evidence; produce a complete eval dataset from a single DSL file. →
**libharness, libterrain**

**Little Hire:** Help me run an eval and get a trace that shows exactly what the
agent did; regenerate a dataset after a schema change and trust the pipeline
handles the rest. → **libharness, libterrain**

**Competes With:** manual before/after comparison; trusting gut feeling over
evidence; skipping evaluation entirely; scripting the pipeline by hand;
coordinating libraries manually; using stale fixtures and hoping they still
apply.

</job>

<job user="Platform Builders" goal="Run a Predictable Platform">

## Platform Builders: Run a Predictable Platform

**Trigger:** A service fails on a customer machine and the cause is a missing
precondition, an unsupervised process, missing telemetry, or stale instructions.

**Big Hire:** Help me check preconditions before anything heavy runs, supervise
long-running processes, emit structured telemetry, and keep instruction files
honest. → **libcoaligned, libpreflight, librc, libsupervise, libtelemetry**

**Little Hire:** Help me verify a docs change before commit and trust the
layered architecture has not drifted; surface a product-authored error for an
unsupported runtime or empty config before anything heavy constructs partially;
start, stop, or check a service without remembering its specific incantation;
add a daemon to a manifest and trust it restarts on failure; add a log line or
trace span without configuring a logging framework. → **libcoaligned,
libpreflight, librc, libsupervise, libtelemetry**

**Competes With:** failing deep in execution instead of at startup; ad-hoc
process management; console.log debugging; instruction files nobody validates.

</job>

<!-- END:jobs -->
