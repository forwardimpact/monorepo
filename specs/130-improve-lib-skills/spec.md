# 130: Improve Library Skill Files

## Problem

The six `libs-*` skill files are the primary way agents discover library
capabilities. When an agent plans a task like "resolve data directories," it
searches skill files for concepts like "find directories" or "upward traversal."
If the skill file only lists `countTokens`, `generateHash`, `generateUuid` as
libutil's API, the agent will never discover `Finder` — and will reimplement
the capability from scratch.

An audit of all six skill files against the actual `index.js` exports reveals
three categories of problems:

### 1. Wrong names

Skill files reference classes and functions that no longer exist under those
names. An agent that tries to import `WindowBuilder` from libmemory will get a
runtime error — the actual export is `MemoryWindow`.

| Skill file | Claims | Actual export |
|------------|--------|---------------|
| libs-data-persistence | `parseJsonl` | `fromJsonLines` |
| libs-data-persistence | `Index` | `IndexBase` |
| libs-data-persistence | `PolicyIndex`, `createPolicyIndex` | `Policy`, `createPolicy` |
| libs-data-persistence | `PREFIXES` | `RDF_PREFIXES` |
| libs-data-persistence | `VectorIndex`, `VectorProcessor` | Not exported (only `calculateDotProduct`) |
| libs-llm-orchestration | `WindowBuilder` | `MemoryWindow` |
| libs-llm-orchestration | `AgentAction` | `AgentHands` |
| libs-service-infrastructure | `RpcServer`, `RpcClient` | `Server`, `Client` |
| libs-service-infrastructure | `serviceConfig`, `extensionConfig`, `scriptConfig` | `createServiceConfig`, `createExtensionConfig`, `createScriptConfig` |
| libs-system-utilities | `generateUuid` | `generateUUID` |
| libs-system-utilities | `createJwt` | `generateJWT` |
| libs-system-utilities | `setEnvVar` | `updateEnvFile` |
| libs-system-utilities | `TypeGenerator`, `ServiceGenerator` | `CodegenTypes`, `CodegenServices` |

### 2. Missing exports

Skill files list a handful of "main" exports and omit the rest. Agents cannot
use capabilities they cannot see.

| Library | Listed | Missing from skill file |
|---------|--------|------------------------|
| libutil | 3 functions | `Finder`, `BundleDownloader`, `TarExtractor`, `ZipExtractor`, `ProcessorBase`, `Retry`, `createRetry`, `createBundleDownloader`, `execLine`, `updateEnvFile`, `waitFor`, `parseJsonBody`, `createTokenizer` |
| libstorage | 2 exports | `LocalStorage`, `S3Storage`, `SupabaseStorage`, `fromJsonLines`, `toJsonLines`, `fromJson`, `toJson`, `isJsonLines`, `isJson` |
| libllm | 1 class | `createLlmApi`, `createProxyAwareFetch`, `normalizeVector`, `DEFAULT_BASE_URL` |
| libui | 3 functions | 40+ DOM helpers, `createReactive`, `createComputed`, `bind`, error classes, `createPagesRouter`, `createSlideRouter`, `markdownToHtml` |
| libsyntheticgen | 3 exports | `createDslParser`, `createEntityGenerator`, `FakerTool`, `SyntheaTool`, `SdvTool` and their factories |
| libsyntheticrender | 3 exports | `createRenderer`, `validateCrossContent`, `formatContent`, `generateDrugs`, `generatePlatforms`, `renderDataset`, `validateHTML` |

### 3. API-oriented rather than capability-oriented

The Libraries tables list class and function names (`Finder`, `countTokens`)
rather than describing what the library can do ("upward directory search,"
"token counting"). An agent searching for "find directories" will not match
`Finder` unless it already knows the name. Capability-oriented descriptions
enable concept-based discovery.

## Goal

Make every `libs-*` skill file an accurate, complete, capability-oriented index
of its libraries so that agents can discover the right tool for any task without
prior knowledge of API names.

## Why

- **Correct discovery** — agents find existing capabilities instead of
  reimplementing them.
- **No runtime errors** — agents import what actually exists, not stale names.
- **Concept search** — capability descriptions match how agents plan ("store
  files to cloud" finds libstorage, "evaluate access policies" finds libpolicy).
- **DI compliance** — accurate wiring examples prevent agents from violating
  the OO+DI architecture.
