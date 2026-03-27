# 130: Implementation Plan

## Approach

For each of the six `libs-*` skill files, apply three changes:

1. **Libraries table** — replace the `Main API` + `Purpose` columns with
   `Capabilities` + `Key Exports`. Capabilities use task-oriented language that
   matches how agents search. Key Exports lists all public classes and functions
   from the library's `index.js`.
2. **Decision Guide** — expand to cover the full API surface. Add entries for
   newly surfaced capabilities.
3. **DI Wiring** — ensure every class with a constructor is documented with its
   actual parameter names. Fix incorrect claims.

## Verification method

For each library in each skill file, diff the `Key Exports` column against the
library's `index.js` exports. Every public export should appear. Enumerate with:

```sh
grep "^export" libraries/{lib}/index.js
```

## Changes

### 1. `.claude/skills/libs-system-utilities/SKILL.md`

**Libraries table — fix names and surface missing exports:**

| Library      | Fix                                                                                                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| libutil      | `generateUuid` → `generateUUID`. Add `Finder`, `BundleDownloader`, `TarExtractor`, `ZipExtractor`, `ProcessorBase`, `Retry`, `createRetry`, `createBundleDownloader`, `execLine`, `updateEnvFile`, `waitFor`, `parseJsonBody`, `createTokenizer`. |
| libsecret    | `createJwt` → `generateJWT`, `setEnvVar` → `updateEnvFile`. Add `readEnvFile`, `getOrGenerateSecret`, `generateBase64Secret`, `generateHash`, `generateUUID`.                                                                                     |
| libsupervise | Add `OneshotProcess`, `ProcessState`, `createSupervisionTree`.                                                                                                                                                                                    |
| librc        | Add `waitForSocket`.                                                                                                                                                                                                                              |
| libcodegen   | `TypeGenerator` → `CodegenTypes`, `ServiceGenerator` → `CodegenServices`. Add `CodegenBase`, `CodegenDefinitions`.                                                                                                                                |

**Capabilities column examples:**

```
| Library      | Capabilities                                            | Key Exports                                    |
| ------------ | ------------------------------------------------------- | ---------------------------------------------- |
| libutil      | Path resolution and upward directory search, bundle     | Finder, BundleDownloader, TarExtractor,        |
|              | download and extraction, retry with backoff, child      | ZipExtractor, ProcessorBase, Retry, createRetry|
|              | process execution, token counting, hashing, env file    | createBundleDownloader, countTokens,           |
|              | management, JSON body parsing                           | createTokenizer, generateHash, generateUUID,   |
|              |                                                         | execLine, updateEnvFile, waitFor, parseJsonBody |
```

**DI Wiring — fix incorrect claim:**

Current claim: "libutil: Pure functions — no DI, no classes." Actual: libutil
exports `Finder`, `BundleDownloader`, `TarExtractor`, `ZipExtractor`,
`ProcessorBase`, `Retry` — all classes with constructor injection. Document
`Finder(fs, logger, process)`,
`BundleDownloader(createStorage, finder, logger, extractor)`,
`Retry(logger, options)`.

### 2. `.claude/skills/libs-data-persistence/SKILL.md`

**Libraries table — fix names and surface missing exports:**

| Library     | Fix                                                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| libstorage  | `parseJsonl` → `fromJsonLines`. Add `LocalStorage`, `S3Storage`, `SupabaseStorage`, `toJsonLines`, `fromJson`, `toJson`, `isJsonLines`, `isJson`.                                                                  |
| libindex    | `Index` → `IndexBase`.                                                                                                                                                                                             |
| libpolicy   | `PolicyIndex` → `Policy`, `createPolicyIndex` → `createPolicy`.                                                                                                                                                    |
| libgraph    | `PREFIXES` → `RDF_PREFIXES`. Remove `GraphIndex` (not exported). Add `isWildcard`, `parseGraphQuery`, `ShaclSerializer`.                                                                                           |
| libvector   | Remove `VectorIndex`, `VectorProcessor` (not exported from index.js). Add `calculateDotProduct` as the only public export. Note that VectorIndex and VectorProcessor must be imported directly from their modules. |
| libresource | Add `toType`, `toIdentifier`.                                                                                                                                                                                      |

### 3. `.claude/skills/libs-llm-orchestration/SKILL.md`

**Libraries table — fix names and surface missing exports:**

| Library   | Fix                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------- |
| libllm    | Add `createLlmApi`, `createProxyAwareFetch`, `normalizeVector`, `DEFAULT_BASE_URL`.             |
| libmemory | `WindowBuilder` → `MemoryWindow`. Remove `createWindow` (does not exist). Add `getModelBudget`. |
| libagent  | `AgentAction` → `AgentHands`.                                                                   |
| libprompt | No changes (correct).                                                                           |

**DI Wiring — fix class names:**

`WindowBuilder(deps)` → `MemoryWindow(deps)`. Update constructor signature to
match actual parameter names.

### 4. `.claude/skills/libs-service-infrastructure/SKILL.md`

**Libraries table — fix names and surface missing exports:**

| Library      | Fix                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| librpc       | `RpcServer` → `Server`, `RpcClient` → `Client`, `createClientFactory` → `createClient`. Add `Rpc`, `Interceptor`, `HmacAuth`, `createGrpc`, `createAuth`, `services`, `clients`, `createTracer`. |
| libconfig    | `serviceConfig` → `createServiceConfig`, `extensionConfig` → `createExtensionConfig`, `scriptConfig` → `createScriptConfig`. Add `createInitConfig`, `createConfig`, `Config`.                   |
| libtelemetry | Remove `Tracer` (not exported from index.js — import from `./tracer.js` directly). Add `Observer`, `createObserver`. Note the direct import path for Tracer.                                     |
| libtype      | No changes (correct).                                                                                                                                                                            |
| libharness   | Clarify that exports come from `./fixture/index.js` and `./mock/index.js` submodules.                                                                                                            |

### 5. `.claude/skills/libs-synthetic-data/SKILL.md`

**Libraries table — surface missing exports:**

| Library            | Fix                                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| libsyntheticgen    | Add `createDslParser`, `createEntityGenerator`, `collectProseKeys`, `FakerTool`, `createFakerTool`, `SyntheaTool`, `createSyntheaTool`, `SdvTool`, `createSdvTool`.   |
| libsyntheticprose  | Add `createProseEngine`, `loadSchemas`.                                                                                                                               |
| libsyntheticrender | Add `createRenderer`, `validateCrossContent`, `formatContent`, `generateDrugs`, `generatePlatforms`, `assignLinks`, `validateLinks`, `validateHTML`, `renderDataset`. |

### 6. `.claude/skills/libs-web-presentation/SKILL.md`

**Libraries table — surface missing exports:**

| Library     | Fix                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| libui       | Add reactive functions (`createReactive`, `createComputed`, `bind`), error classes (`NotFoundError`, `InvalidCombinationError`, `DataLoadError`), `withErrorBoundary`, `createPagesRouter`, `createSlideRouter`, `markdownToHtml`, `getItemsByIds`. List DOM helpers as a group ("40+ element functions: div, span, h1–h4, p, a, ul, li, table, etc.") rather than individually. |
| libformat   | Add `createHtmlFormatter`, `createTerminalFormatter`.                                                                                                                                                                                                                                                                                                                            |
| libweb      | Add `createValidationMiddleware`, `createCorsMiddleware`, `createAuthMiddleware`.                                                                                                                                                                                                                                                                                                |
| libdoc      | No changes (correct).                                                                                                                                                                                                                                                                                                                                                            |
| libtemplate | No changes (correct).                                                                                                                                                                                                                                                                                                                                                            |

## Files

| File                                                  | Action                                    |
| ----------------------------------------------------- | ----------------------------------------- |
| `.claude/skills/libs-system-utilities/SKILL.md`       | Fix names, surface exports, fix DI claims |
| `.claude/skills/libs-data-persistence/SKILL.md`       | Fix names, surface exports                |
| `.claude/skills/libs-llm-orchestration/SKILL.md`      | Fix names, surface exports, fix DI wiring |
| `.claude/skills/libs-service-infrastructure/SKILL.md` | Fix names, surface exports                |
| `.claude/skills/libs-synthetic-data/SKILL.md`         | Surface exports                           |
| `.claude/skills/libs-web-presentation/SKILL.md`       | Surface exports                           |

## Verification

For each of the six skill files:

1. Run `grep "^export" libraries/{lib}/index.js` for every library in the file
2. Confirm every public export appears in the `Key Exports` column
3. Confirm every name in `Key Exports` matches the actual export name exactly
4. Confirm DI Wiring section uses actual class names and constructor signatures
5. `npm run format -- .claude/skills/` — formatting clean
