# Library Standardization and Skill Consolidation

Standardize all libraries to a single architectural pattern (OO+DI) and
consolidate Claude skills into capability-based groups so coding agents reliably
discover and use libraries.

```
specs/070-library-standardization/
  spec.md                       This document (WHAT and WHY)
  plan-01-oo-di-migration.md    Migrate non-conforming libraries to OO+DI
  plan-02-skill-consolidation.md  Consolidate library skills into capability groups
```

## Why

Two problems slow down development in the monorepo:

### 1. Inconsistent library architecture

Most libraries follow OO+DI (classes with constructor-injected dependencies and
convenience factory functions). Three libraries deviate:

| Library          | Current pattern                               | Problem                                                                                                                                                                     |
| ---------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **libuniverse**  | Procedural functions, module-level singletons | Cannot unit-test pipeline stages in isolation; ProseEngine creates its own PromptLoader at module scope; no DI seams for fs, config, or LLM                                 |
| **libutil**      | Mixed — 5 classes with DI + 9 loose functions | Loose functions (`generateHash`, `countTokens`, `execLine`, `waitFor`) have no injection points; `createBundleDownloader` uses dynamic imports to work around circular deps |
| **libsupervise** | Classes, but module-level logger singleton    | `SupervisionTree` creates `const logger = createLogger("tree")` at module scope — untestable, violates DI                                                                   |

When a contributor opens a non-conforming library they see a different pattern
than everywhere else, leading to copy-paste of the wrong style into new code.
Standardizing removes ambiguity: every library (except libskill) uses classes
with constructor injection.

### 2. Library skills overwhelm the coding agent

The monorepo defines **22 individual library skills** (one SKILL.md per
library). When a coding agent receives all 22 skill descriptions in its system
prompt, it faces two problems:

1. **Selection paralysis.** The agent must choose from 22 similarly-structured
   options. In practice it rarely picks the right library skill — or picks none
   at all — because the descriptions overlap and the sheer count dilutes
   relevance signals.

2. **Missing context.** A single library skill teaches the API of that library
   in isolation. But real tasks require composing 3–5 libraries together (e.g.,
   building a service requires librpc + libconfig + libtelemetry + libstorage).
   No single skill provides the composition recipe.

The result: library skills are rarely activated, and when they are, the agent
still lacks the integration knowledge to use the library correctly within the
broader system.

## What

### Standard library pattern

Every library (except libskill and libui) follows one pattern:

```
┌──────────────────────────────────────────────┐
│  Class with constructor-injected dependencies │
│                                               │
│  constructor(dep1, dep2, dep3) {              │
│    // validate, assign to private fields      │
│  }                                            │
│                                               │
│  method() { /* uses this.dep1 */ }            │
└──────────────────────────────────────────────┘
           ▲
           │ wraps
┌──────────────────────────────────────────────┐
│  Factory function: createXxx(options)         │
│                                               │
│  Wires real dependencies, returns instance    │
│  Handles async init (load/connect) if needed  │
└──────────────────────────────────────────────┘
```

**Rules:**

1. Classes accept all collaborators through the constructor — no module-level
   singletons, no inline `createLogger()` calls, no dynamic imports, no default
   parameter fallbacks that silently create real dependencies.
2. Constructors validate that all required dependencies are provided and throw
   if any are missing. No optional dependencies — if a class needs it, require
   it.
3. Factory functions are the only place where real implementations are wired.
   They exist for convenience; tests bypass them entirely and inject mocks
   directly via the constructor.
4. Pure utility functions (hash, uuid, token counting) are acceptable only in
   libutil as standalone exports when they are truly stateless and have zero
   dependencies beyond Node.js built-ins.

**Exceptions:**

- **libskill** — Pure functions by design. Derivation logic is stateless; the
  call site provides all data. No migration needed.
- **libui** — Pure functions for DOM. A functional approach is the standard
  pattern for declarative UI libraries. No migration needed.
- **libsecret** — Pure cryptographic utilities. Stateless, no dependencies
  beyond Node.js crypto. No migration needed.
- **libtype** — Generated protobuf code. Not subject to handwritten patterns.

### Capability-based skill groups

Replace 22 individual library skills with **5 capability group skills**:

| Group skill                | Libraries covered                                                 | When activated                                                                                      |
| -------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **service-infrastructure** | librpc, libconfig, libtelemetry, libtype, libharness              | Building or modifying gRPC services, service configuration, logging/tracing                         |
| **data-persistence**       | libstorage, libindex, libresource, libpolicy, libgraph, libvector | Storing data, querying indexes, managing resources, access control, knowledge graphs, vector search |
| **llm-orchestration**      | libllm, libmemory, libprompt, libagent                            | LLM completions, embeddings, conversation memory, prompt templates, agent orchestration             |
| **web-presentation**       | libui, libformat, libweb, libdoc, libtemplate                     | Web UIs, markdown rendering, HTTP middleware, documentation sites                                   |
| **system-utilities**       | libutil, libsecret, libsupervise, librc, libcodegen               | Process supervision, service management, code generation, hashing, secrets                          |

Each group skill contains:

1. **Capability overview** — What this group of libraries enables (2–3
   sentences).
2. **Library quick-reference** — One-line summary per library with main
   class/factory.
3. **Composition recipes** — 2–3 complete examples showing how the libraries
   work together for real tasks (not isolated API demos).
4. **Decision guide** — "Use X when…, use Y when…" for libraries that overlap in
   responsibility.
5. **DI wiring patterns** — How to construct and compose instances, showing the
   factory functions and constructor signatures.

### What stays as individual skills

Product skills remain individual because they represent distinct user workflows:

- fit-pathway, fit-basecamp, fit-map, fit-universe
- libskill (sole exception — large API surface, unique pure-function pattern)

### Naming convention

Group skills use the pattern `libs-{capability}`:

- `libs-service-infrastructure`
- `libs-data-persistence`
- `libs-llm-orchestration`
- `libs-web-presentation`
- `libs-system-utilities`

## Clean break principle

There are no external consumers of these libraries. Every change is a clean
break — old interfaces are deleted, not aliased. Specifically:

- **No default parameters that create real dependencies.** Constructors require
  all deps; callers must pass them explicitly. Factory functions are the only
  place that wires real implementations.
- **No convenience aliases for removed functions.** When a bare function becomes
  a class method, the old export is deleted. No re-export, no deprecation
  notice, no shim.
- **All call sites update in the same commit as the library change.** Every
  service, product, CLI, and test that imports the changed library is updated
  atomically. No phased rollout.
- **Old skill files are deleted, not archived.** The 22 individual library
  skills are removed from `.claude/skills/` entirely. Git history is the
  archive.

## Success criteria

1. Every library constructor accepts all collaborators as required parameters.
   Zero module-level singletons. Zero inline dependency creation. Zero default
   fallbacks to real implementations.
2. Every library has a `createXxx` factory function that wires real deps.
   Constructors never do this themselves.
3. All call sites (services, products, CLIs, tests) are updated in the same
   commit as the library migration. No broken intermediate states.
4. All existing tests pass after migration (`npm run check`).
5. Library skill count drops from 22 individual files to 5 group files + 1
   individual (libskill). No individual library skills remain.
6. Coding agents can compose multi-library solutions from a single skill
   activation (verified by manual testing with representative tasks).

## Out of scope

- Changing libskill's pure-function architecture.
- Changing libui's functional DOM approach.
- Adding new libraries or merging existing ones.
- Changing the library dependency graph.
