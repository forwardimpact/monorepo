# Shared Libraries

The packages under `libraries/` are agent-shaped utilities — designed for
agentic systems from the ground up. Agent-friendly CLIs and output formats,
retrieval primitives that surface rich grounded context, evaluation tooling that
closes the self-improvement loop, and service infrastructure with knobs agents
can read and tune via JSON.

## Catalog

<!-- BEGIN:catalog — Do not edit. Generated from each library's package.json. -->

| Library                | Description                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **libbridge**          | Threaded-channel bridge primitives — relay messages between human channels (GitHub Discussions, Microsoft Teams) and the Kata agent team. |
| **libcli**             | Agent-friendly CLIs — self-documenting entry points that humans and agents reach through the same interface.                              |
| **libcoaligned**       | Co-Aligned architecture checks — enforce instruction-layer length caps and JTBD invariants across the repo.                               |
| **libcodegen**         | Protobuf code generation — keep types in sync with proto definitions without hand-writing.                                                |
| **libconfig**          | Environment-aware application settings — services and CLIs load configuration without custom plumbing.                                    |
| **libdoc**             | Static documentation sites from markdown — publish docs without a framework.                                                              |
| **libeval**            | Agent evaluation framework — prove whether agent changes improved outcomes with reproducible evidence.                                    |
| **libformat**          | Render markdown to ANSI or HTML — formatted output in any surface without losing structure.                                               |
| **libgraph**           | RDF triple store with named ontologies — answer relationship questions without writing join logic.                                        |
| **libindex**           | JSONL-backed indexes with filtering and buffered writes — fast context lookup without an external search engine.                          |
| **libmacos**           | macOS bundle assembly, code signing, and OS permission helpers — desktop delivery without platform ceremony.                              |
| **libmcp**             | Config-driven gRPC-to-MCP tool registration — expose protobuf services as agent tools without glue code.                                  |
| **libmock**            | Shared mocks and test fixtures so every library and service tests the same way.                                                           |
| **libpack**            | Pack distribution — tarballs, bare git repos, and skill discovery indices                                                                 |
| **libpolicy**          | Access-control policy evaluation — scoped context access without per-service authorization logic.                                         |
| **libpreflight**       | Runtime-floor preflight — fail fast with a product-authored error when the host Node is below a package's declared floor.                 |
| **libprompt**          | Prompt templates from .prompt.md files — structured prompts without string concatenation.                                                 |
| **libproto**           | Shared protobuf schemas — one editable source for the service contracts every product imports.                                            |
| **librc**              | Service lifecycle management — start, stop, and check services without manual oversight.                                                  |
| **librepl**            | Agent-friendly interactive REPL — exploratory interfaces that humans and agents navigate the same way.                                    |
| **libresource**        | Typed resources with identifiers and rich context chunks — trustworthy, retrievable knowledge for agent grounding.                        |
| **librpc**             | gRPC server and client framework — ship service endpoints without reimplementing transport.                                               |
| **libsecret**          | Secret generation, JWT signing, and .env file management for services and CLIs.                                                           |
| **libskill**           | Derive skill matrices, agent profiles, and job definitions from standard data — the engineering standard made queryable.                  |
| **libstorage**         | Pluggable file storage — local, S3, or Supabase behind a single interface.                                                                |
| **libsupervise**       | Process supervision driven by JSON daemon manifests — services stay running and recoverable without manual intervention.                  |
| **libsyntheticgen**    | DSL parser and deterministic entity graph generator — repeatable eval fixtures so results are reproducible.                               |
| **libsyntheticprose**  | LLM-generated prose and YAML — realistic evaluation content so agent improvements are tested against lifelike data.                       |
| **libsyntheticrender** | Multi-format rendering of synthetic evaluation data — validate fixtures before they enter the eval pipeline.                              |
| **libtelemetry**       | Structured logging and trace spans — observable operations so problems surface before they escalate.                                      |
| **libtemplate**        | Mustache template loader with project-level overrides — consistent rendered output across surfaces.                                       |
| **libterrain**         | Full synthetic data pipeline — generate, render, and validate evaluation datasets end to end.                                             |
| **libtype**            | Generated protobuf types and namespaces — one source of truth for service contracts.                                                      |
| **libui**              | Agent-friendly web surfaces — share handler logic across web and terminal so capabilities ship once, not twice.                           |
| **libutil**            | Cross-cutting utilities: retry, hashing, token counting, and project discovery.                                                           |
| **libvector**          | Vector dot-product scoring — find semantically related content without a dedicated database.                                              |
| **libwiki**            | Wiki lifecycle primitives — stable memory for agent teams so coordination persists across sessions.                                       |
| **libxmr**             | Wheeler/Vacanti XmR control charts — distinguish signal from noise so agent teams act on real changes, not fluctuations.                  |

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

<job user="Platform Builders" goal="Bridge Threaded Channels to the Agent Team">

## Platform Builders: Bridge Threaded Channels to the Agent Team

**Trigger:** Building a chat or discussion adapter and reaching for last
project's callback registry, rate limiter, and history-bound prompt builder.

**Big Hire:** Help me ship a threaded-channel adapter without reimplementing the
intake skeleton, callback registry, durable thread state, and resume-trigger
contract. → **libbridge**

**Little Hire:** Help me register a callback token, build a bounded prompt, and
dispatch a workflow without managing each piece directly. → **libbridge**

**Competes With:** copy-pasting channel adapter boilerplate; per-channel
workflow YAML composition; ephemeral in-memory thread state that vanishes on
restart.

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

<job user="Platform Builders" goal="Ground Service Contracts in One Source">

## Platform Builders: Ground Service Contracts in One Source

**Trigger:** Shipping a proto that imports tool.proto and discovering the
published copy lives in another package the consumer never installed.

**Big Hire:** Help me publish service protos that resolve on any external
`npm install` without coordinating multiple package homes. → **libproto**

**Little Hire:** Help me import a shared proto and trust the consumer of my
service can read it. → **libproto**

**Competes With:** duplicating .proto files across packages; embedding shared
schemas inside transport or codegen libraries; tolerating ENOENT for non-Guide
installs.

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

<job user="Platform Builders" goal="Keep Instruction Layers Honest">

## Platform Builders: Keep Instruction Layers Honest

**Trigger:** Editing a CLAUDE.md or skill procedure and realizing the layer has
quietly grown past its budget.

**Big Hire:** Help me enforce instruction-layer length caps and JTBD invariants
without hand-rolling repo checks. → **libcoaligned**

**Little Hire:** Help me verify a docs change before commit and trust the
layered architecture has not drifted. → **libcoaligned**

**Competes With:** ad-hoc shell scripts; eyeballing word counts; tolerating slow
drift in the instruction architecture.

</job>

<job user="Platform Builders" goal="Keep Service Contracts Typed">

## Platform Builders: Keep Service Contracts Typed

**Trigger:** Adding a proto definition and realizing the JavaScript types are
already stale; registering a gRPC service as MCP tools and realizing the tool
schema is just the proto definition rewritten by hand; starting a new service
and reaching for last project's copy-pasted transport boilerplate; importing
service types in a product and finding three different hand-maintained copies of
the same definition.

**Big Hire:** Help me keep types in sync with proto definitions without
hand-writing; register gRPC services as MCP tools from config instead of writing
glue code; ship a service endpoint without reimplementing transport; import
service types from one generated source instead of maintaining copies. →
**libcodegen, libmcp, librpc, libtype**

**Little Hire:** Help me change a proto definition and trust the JavaScript
types follow; expose a new proto method as an agent tool without touching tool
registration; call a service without managing connections or retries; reference
a service type and trust it matches the proto definition. → **libcodegen,
libmcp, librpc, libtype**

**Competes With:** manual type definitions; hoping hand-written types match;
skipping types entirely; hand-written tool schemas; per-service MCP adapters;
leaving services invisible to agents; copy-pasting boilerplate; hand-writing
protobuf clients; tolerating the duplication; hand-maintained type copies;
inferring types from runtime responses.

</job>

<job user="Platform Builders" goal="Keep Services Running and Visible">

## Platform Builders: Keep Services Running and Visible

**Trigger:** Debugging a down service and realizing there is no single command
to check what is running; a service crashes overnight and no one notices until
the morning standup; debugging a production issue and realizing no trace spans
exist for the failing operation.

**Big Hire:** Help me manage service lifecycle from one interface instead of
scripting each start and stop; keep services running and recoverable without
manual intervention; make operations observable so problems surface before they
escalate. → **librc, libsupervise, libtelemetry**

**Little Hire:** Help me start, stop, or check a service without remembering its
specific incantation; add a daemon to a manifest and trust it restarts on
failure; add a log line or trace span without configuring a logging framework. →
**librc, libsupervise, libtelemetry**

**Competes With:** ad-hoc shell scripts; manual process management; tolerating
stale services; cron restarts; manual process monitoring; tolerating overnight
outages; console.log debugging; no observability; post-mortem log archaeology.

</job>

<job user="Platform Builders" goal="Prove Agent Changes">

## Platform Builders: Prove Agent Changes

**Trigger:** An eval passes locally but fails in CI and the only output is
'assertion failed.'; setting up an eval and realizing you need to coordinate
generation, rendering, and validation across three libraries.

**Big Hire:** Help me prove whether agent changes improved outcomes with
reproducible evidence; produce a complete eval dataset from a single DSL file. →
**libeval, libterrain**

**Little Hire:** Help me run an eval and get a trace that shows exactly what the
agent did; regenerate a dataset after a schema change and trust the pipeline
handles the rest. → **libeval, libterrain**

**Competes With:** manual before/after comparison; trusting gut feeling over
evidence; skipping evaluation entirely; scripting the pipeline by hand;
coordinating libraries manually; using stale fixtures and hoping they still
apply.

</job>

<job user="Platform Builders" goal="Ship Predictable CLIs">

## Platform Builders: Ship Predictable CLIs

**Trigger:** User runs an npx CLI on an unsupported Node and sees an
upstream-authored error.

**Big Hire:** Help me enforce a runtime floor before any heavy import evaluates.
→ **libpreflight**

**Little Hire:** Help me surface a product-authored Node-version error instead
of an upstream library's. → **libpreflight**

**Competes With:** inline checks in each bin; engines-strict; install-time
hooks.

</job>

<!-- END:jobs -->
