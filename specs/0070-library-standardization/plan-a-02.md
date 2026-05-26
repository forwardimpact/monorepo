# Plan 02 — Consolidate Library Skills into Capability Groups

Replace 22 individual library SKILL.md files with 5 capability-group skills.
Clean break — delete all individual library skills in the same commit that adds
the group skills. No transition period, no coexistence.

## Current state

22 library skills, each ~55 lines, each following the same template:

```
When to Use → Key Concepts → Usage Patterns (2–3 isolated examples) → Integration
```

**Why this fails:**

1. **22 descriptions in the system prompt** — The agent sees 22 similarly-worded
   triggers. Most share phrases like "Use for…" and "building services". The
   agent either picks the wrong one or ignores all of them.

2. **Isolated API demos** — Each skill shows `new ClassName(dep)` in isolation.
   But service development requires wiring 3–5 libraries together. No skill
   shows this composition.

3. **No decision guidance** — When should the agent use libindex vs libresource
   vs libgraph? All three store data. The individual skills don't explain the
   boundaries.

## Target state

5 group skills + 1 individual (libskill). Total system prompt surface area drops
from 22 descriptions to 6.

```
.claude/skills/
  libs-service-infrastructure/SKILL.md    NEW (replaces 5 skills)
  libs-data-persistence/SKILL.md          NEW (replaces 6 skills)
  libs-llm-orchestration/SKILL.md         NEW (replaces 4 skills)
  libs-web-presentation/SKILL.md          NEW (replaces 5 skills)
  libs-system-utilities/SKILL.md          NEW (replaces 5 skills)
  libskill/SKILL.md                       KEEP (unique pure-function pattern)
```

**Deleted** (22 files): libagent, libcodegen, libconfig, libdoc, libformat,
libgraph, libharness, libindex, libllm, libmemory, libpolicy, libprompt, librc,
libresource, librpc, libsecret, libstorage, libsupervise, libtelemetry, libtype,
libui, libuniverse, libutil, libvector, libweb.

## Group skill template

Each group skill follows this structure (~120–150 lines):

```markdown
---
name: libs-{capability}
description: >
  {One sentence: what capability this group enables.}
  Libraries: {comma-separated list}.
  {One sentence: when to activate this skill.}
---

# {Capability Name}

## When to Use

{3–4 bullet points describing task categories that trigger this skill}

## Libraries

| Library | Main API | Purpose |
| --- | --- | --- |
| lib... | `ClassName` / `createXxx()` | One-line purpose |

## Decision Guide

{When to use X vs Y — disambiguate libraries with overlapping concerns}

## Composition Recipes

### Recipe 1: {Common real task}

{Complete working example showing 2–4 libraries wired together}

### Recipe 2: {Another common task}

{Complete working example}

### Recipe 3: {Testing pattern}

{How to mock/test this library group using libharness}

## DI Wiring

{Constructor signatures and factory function reference for all libraries
in this group — the agent's quick-reference for instantiation}
```

## Group 1: libs-service-infrastructure

**Libraries:** librpc, libconfig, libtelemetry, libtype, libharness

**Trigger:** Building or modifying gRPC services, service configuration,
logging, tracing, or service tests.

**Description for frontmatter:**

> Service infrastructure for gRPC microservices. librpc provides Server/Client
> base classes. libconfig loads service settings. libtelemetry provides
> structured logging and tracing. libtype provides Protocol Buffer types.
> libharness provides test mocks. Use when building, modifying, or testing gRPC
> services.

**Decision guide content:**

- librpc Server vs Client — Server for implementing handlers, Client for calling
  other services
- libconfig `serviceConfig` vs `extensionConfig` vs `scriptConfig` — service for
  long-running daemons, extension for plugins, script for CLI tools
- libtelemetry Logger vs Observer — Logger for structured log lines, Observer
  for wrapping operations with timing spans

**Composition recipes:**

1. **Create a new gRPC service** — serviceConfig → createLogger → createTracer →
   new Server(proto, handlers) → server.start()
2. **Call another service** — createClient(proto) → client.method(request)
3. **Test a service handler** — createMockConfig + createMockLogger +
   createMockGrpcCall → handler(call, callback)

## Group 2: libs-data-persistence

**Libraries:** libstorage, libindex, libresource, libpolicy, libgraph, libvector

**Trigger:** Storing files, querying indexes, managing typed resources, access
control, knowledge graphs, or vector similarity search.

**Description for frontmatter:**

> Data persistence and retrieval. libstorage provides multi-backend file storage
> (local, S3, Supabase). libindex provides JSONL-backed indexes. libresource
> adds typed resources with authorization. libpolicy evaluates access control.
> libgraph stores RDF triples. libvector stores embeddings for similarity
> search. Use when persisting, querying, or securing data.

**Decision guide content:**

- libstorage vs libindex — storage for raw files (get/put/list), index for
  structured records with filtering
- libindex vs libresource — index for simple JSONL collections, resource for
  typed entities with access control and policy evaluation
- libgraph vs libvector — graph for relationship queries (who reports to whom,
  what skills belong to a capability), vector for semantic similarity (find
  documents similar to a query)
- libpolicy — always used through libresource, rarely accessed directly

**Composition recipes:**

1. **Store and retrieve typed resources** — createStorage(prefix) →
   createResourceIndex(prefix) → index.save(resource) → index.find(query)
2. **Build a knowledge graph** — createGraphIndex(prefix) →
   graphIndex.addTriple(s, p, o) → graphIndex.query(pattern)
3. **Semantic search pipeline** — VectorProcessor(vectorIndex, resourceIndex,
   llm, logger) → processor.index(documents) → vectorIndex.search(embedding)

## Group 3: libs-llm-orchestration

**Libraries:** libllm, libmemory, libprompt, libagent

**Trigger:** Making LLM completions, managing conversation memory, loading
prompt templates, or building conversational agents.

**Description for frontmatter:**

> LLM orchestration for AI features. libllm provides the API client for
> completions and embeddings. libmemory manages conversation history within
> token budgets. libprompt loads and renders prompt templates. libagent
> orchestrates multi-turn conversations with tool use. Use when integrating LLM
> capabilities, building agents, or managing AI context windows.

**Decision guide content:**

- libllm alone vs libagent — use libllm for single-shot completions (embeddings,
  classification); use libagent for multi-turn conversations with tool calling
  and memory
- libprompt vs inline strings — always use libprompt for system prompts
  (supports variable substitution, file-based management); inline strings only
  for dynamic user messages
- libmemory — used internally by libagent; access directly only when building
  custom memory strategies

**Composition recipes:**

1. **Single-shot LLM call** — createLlmApi() → llm.createCompletions(messages)
2. **Multi-turn agent** — createPromptLoader(dir) → new AgentMind(config,
   callbacks, resourceIndex, agentHands) → agent.chat(userMessage)
3. **Custom memory window** — new MemoryWindow(resourceId, resourceIndex,
   memoryIndex) → window.build(tokenBudget)

## Group 4: libs-web-presentation

**Libraries:** libui, libformat, libweb, libdoc, libtemplate

**Trigger:** Building web UIs, rendering markdown, HTTP middleware,
documentation sites, or template rendering.

**Description for frontmatter:**

> Web presentation and content rendering. libui provides DOM helpers, reactive
> state, and routing for web apps. libformat converts markdown to HTML or ANSI.
> libweb provides auth, CORS, and validation middleware for Hono. libdoc builds
> static documentation sites. libtemplate loads Mustache templates. Use when
> building web interfaces, rendering content, or serving documentation.

**Decision guide content:**

- libui vs libformat — libui for interactive web apps with routing and state;
  libformat for converting markdown content to HTML or terminal output
- libweb — middleware only, used in the web service (Hono framework); not needed
  for static sites
- libdoc vs libtemplate — libdoc for complete documentation sites from markdown
  folders; libtemplate for individual template rendering in any context
- libui is pure functions (functional DOM) — no classes, no DI

**Composition recipes:**

1. **Web app page** — libui: createElement, createRouter, createReactive →
   render(app, root)
2. **Markdown API response** — createHtmlFormatter() → formatter.render(md)
3. **Documentation site** — new DocsBuilder(deps) → builder.build(srcDir,
   outDir)

## Group 5: libs-system-utilities

**Libraries:** libutil, libsecret, libsupervise, librc, libcodegen

**Trigger:** Process supervision, service lifecycle management, code generation
from protobuf, hashing, secrets, or environment configuration.

**Description for frontmatter:**

> System utilities for infrastructure tasks. libutil provides hashing, token
> counting, and process execution. libsecret generates secrets and JWTs.
> libsupervise provides process supervision with restart policies. librc manages
> service lifecycles via Unix sockets. libcodegen generates code from Protocol
> Buffer definitions. Use for infrastructure automation, service management, or
> code generation.

**Decision guide content:**

- libsupervise vs librc — libsupervise for direct process supervision
  (LongrunProcess, OneshotProcess); librc for service management via the svscan
  daemon (start/stop/status commands)
- libutil `generateHash` vs libsecret `generateHash` — libutil for general
  content hashing; libsecret for cryptographic secrets and JWT creation
- libcodegen — run once after proto changes (`make codegen`), not used at
  runtime

**Composition recipes:**

1. **Supervise a service** — new LongrunProcess(name, cmd, opts) → new
   SupervisionTree(logDir) → tree.add(process) → tree.start()
2. **Generate secrets for environment** — generateSecret() → updateEnvFile() →
   generateJWT(secret, payload)
3. **Generate code from proto** — new CodegenTypes(root, path, deps) →
   codegen.generate()

## Implementation

This is a single atomic commit: create group skills, delete individual skills,
update all references. No intermediate state where both exist.

### Step 1: Complete Plan 01 first

The OO+DI migrations must land before writing group skills. The composition
recipes and DI wiring sections document the final API — writing them against the
old API would require a second pass. Do it once, do it right.

### Step 2: Write group skill files and delete individual skills (one commit)

In a single commit:

1. Create 5 new SKILL.md files in `.claude/skills/libs-{capability}/`. Each
   follows the template above with composition recipes showing the
   post-migration APIs.

2. Delete all 22 individual library skill directories:

   ```sh
   rm -rf .claude/skills/lib{agent,codegen,config,doc,format,graph,harness,index,llm,memory,policy,prompt,rc,resource,rpc,secret,storage,supervise,telemetry,type,ui,universe,util,vector,web}
   ```

3. Update CLAUDE.md and any project-level config that references individual
   library skills. Replace with group skill references.

4. Update `.claude/settings.json` if it contains skill-specific permissions.

No coexistence period. The old skills are deleted in the same commit the new
ones are created.

### Step 3: Update libskill skill

Refresh libskill's content to include composition patterns showing how libskill
integrates with map (upstream) and pathway (downstream). Add a note that
libskill is intentionally pure functions — the only library exempt from OO+DI.

### Step 4: Verify agent behaviour

Test with representative prompts:

1. "Add a new gRPC endpoint to the agent service" — should activate
   libs-service-infrastructure
2. "Store user preferences with access control" — should activate
   libs-data-persistence
3. "Build an LLM-powered summarization feature" — should activate
   libs-llm-orchestration
4. "Add a new page to the pathway web app" — should activate
   libs-web-presentation
5. "Set up process supervision for a new service" — should activate
   libs-system-utilities

If a group skill underperforms, fix the group skill — don't restore individual
skills. The fix is better instructions, not more skills.
