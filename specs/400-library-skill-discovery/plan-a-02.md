# Plan A Part 02 — Rewrite SKILL.md content (descriptions, tables, orphans)

Part 2 of 4 of [plan-a](plan-a.md) for [spec 400](spec.md). Depends on Part 01.

Rewrites the frontmatter descriptions, inner `Libraries` tables, and any body
text referencing the old group names across all six `libs-*/SKILL.md` files
plus `libskill/SKILL.md`. This is the largest part of the plan and the one
that produces the signal the skill router sees at load time.

## Scope

- Rewrite frontmatter `description` in every `libs-*/SKILL.md` and
  `libskill/SKILL.md` in capability-verb vocabulary, opening with "Use when".
- Rename the inner table columns from `Main API` / `Purpose` to
  `Capabilities` / `Key Exports` across all six `libs-*` files.
- Add one row per orphan: `libtool` (in `libs-llm-and-agents`), `libcli`,
  `librepl`, `libeval` (in `libs-cli-and-tooling`), `libuniverse` (in
  `libs-synthetic-data`). `libs-cli-and-tooling` also gains `libutil`,
  `libsecret`, `libsupervise`, `librc`, `libcodegen` rows inherited from the
  old `libs-system-utilities` table but with the new column headers and
  verified `Key Exports`.
- Populate every `Key Exports` cell by reading the library's actual public
  export surface (`libraries/<libname>/src/index.js` plus any subpath targets
  declared in `libraries/<libname>/package.json`'s `exports` map).
- Update body section intros ("When to Use", "Decision Guide", "Composition
  Recipes", "DI Wiring") where they reference the old group name or need to
  cover a newly added library.
- **Do not rewrite Decision Guide or Composition Recipes beyond adjustments
  required by the reorganisation.** Spec 130 already corrected these.

## Files touched

Seven files, all rewrites (no creates, no deletes):

1. `.claude/skills/libs-grpc-services/SKILL.md`
2. `.claude/skills/libs-storage/SKILL.md`
3. `.claude/skills/libs-llm-and-agents/SKILL.md`
4. `.claude/skills/libs-content/SKILL.md`
5. `.claude/skills/libs-cli-and-tooling/SKILL.md`
6. `.claude/skills/libs-synthetic-data/SKILL.md`
7. `.claude/skills/libskill/SKILL.md`

## Ordering

Rewrite files one at a time in the order listed above. After each file, run
`bun run check` to confirm format/lint pass. Commit all seven files together
at the end of the part — the branch does not need to be checkable at any
intermediate point.

For each file, the rewrite recipe is:

1. **Read the current file end-to-end.**
2. **Inventory the library's actual exports.** For each library row you will
   write, open `libraries/<libname>/src/index.js` plus every file referenced
   in `libraries/<libname>/package.json`'s `exports` map. Collect every name
   that appears as `export function X`, `export class X`, `export const X`,
   `export { X }`, `export { X } from …`, or `export default`. De-dupe. This
   is the source of truth for the `Key Exports` column.
3. **Draft the `Key Exports` cells.** Select a representative subset per row:
   the primary class(es) and factory function(s) plus the highest-value
   helpers. Do not list every export — the spec forbids the reverse check
   precisely because internal helpers shouldn't pollute the discovery
   surface. Aim for 3–6 names per row. Every name must resolve under Part
   04's script.
4. **Draft the `Capabilities` cells.** Verb-led phrases the way an agent
   phrases a task: "retry a flaky fetch", "supervise a daemon", "render
   markdown to terminal". Avoid library names.
5. **Rewrite the frontmatter `description`.** Gather every `Capabilities`
   phrase from step 4 across all rows in the table. Merge into one "Use when
   …" paragraph, under ~100 words. Every row's capabilities must appear in
   the description (the router only sees the frontmatter).
6. **Update body intros.** Replace any reference to the old group name. Spot
   the "When to Use" list, the Decision Guide heading introductions, and any
   "# <Group Title>" H1 (e.g., "# Web Presentation" → "# Content"). Leave
   recipe code blocks unchanged unless a library was added to the group
   (then add one recipe or DI block for the new library).
7. **Spot-verify the frontmatter.** Word count should be under ~120 (the
   ~100 target plus a 20-word buffer; anything over is flagged to the
   reviewer, not auto-blocked). Description must open with "Use when".

### Per-file rewrites

#### 1. `libs-grpc-services/SKILL.md`

- **Group title H1:** keep as "Service Infrastructure" or rename to "gRPC
  Services" for consistency with the new directory name. **Decision:** rename
  to "gRPC Services and Service Infrastructure". Naming the directory and the
  H1 with compatible words helps readers who grep for "service".
- **Members (5):** librpc, libconfig, libtelemetry, libtype, libharness.
  Unchanged from old `libs-service-infrastructure`.
- **`Key Exports` source-of-truth check (read at execution time):**

  | Library      | Entry file(s)                                                                                  |
  | ------------ | ---------------------------------------------------------------------------------------------- |
  | librpc       | `libraries/librpc/src/index.js`                                                                |
  | libconfig    | `libraries/libconfig/src/index.js`                                                             |
  | libtelemetry | `libraries/libtelemetry/src/index.js` + `./tracer.js` + `./visualizer.js` + `./index/trace.js` |
  | libtype      | `libraries/libtype/src/index.js` (re-exports from `./generated/types/types.js`)                |
  | libharness   | `libraries/libharness/src/index.js` (re-exports from `./fixture/index.js`, `./mock/index.js`)  |

  Known divergence from the current (stale) `Main API` column: librpc
  exports `Server`/`Client`/`createClient` (not `RpcServer`/`RpcClient`/
  `createClientFactory`). libconfig exports `createServiceConfig`/
  `createExtensionConfig`/`createScriptConfig` (not `serviceConfig`/…).
  libtelemetry's root index does **not** export `Tracer` — it lives at
  `./tracer.js`; if the Key Exports cell lists `Tracer`, the Part 04 check
  must be able to resolve it via the subpath export.
- **Body changes:** keep Decision Guide, Composition Recipes, DI Wiring
  unchanged content-wise; update any stray "service-infrastructure" text to
  the new group name. Update Recipe 1 code comments if they reference
  `RpcServer` (rename to `Server`) — Part 02 is the natural place to fix
  this stale reference from spec 130's pass.

#### 2. `libs-storage/SKILL.md`

- **H1:** "Data Persistence" → "Storage".
- **Members (6):** libstorage, libindex, libresource, libpolicy, libgraph,
  libvector. Unchanged.
- **`Key Exports`:** read entry files under `libraries/{libstorage,libindex,
  libresource,libpolicy,libgraph,libvector}/src/index.js` (plus any subpath
  exports declared in each `package.json`).
  - libstorage: `createStorage`, `parseJsonl`, `serializeJsonl`
  - libindex: `Index`, `BufferedIndex` (check current exports)
  - libresource: `ResourceIndex`, `createResourceIndex`, `toResourceId`
  - libpolicy: `PolicyIndex`, `createPolicyIndex`
  - libgraph: `GraphIndex`, `createGraphIndex`, `PREFIXES`
  - libvector: `VectorIndex`, `VectorProcessor` (verify — spec 130 flagged
    this as potentially missing)
- **Body changes:** smallest of the six. Change H1 and update any "data
  persistence" prose, but the Decision Guide and Recipes already use the
  correct names after spec 130.

#### 3. `libs-llm-and-agents/SKILL.md`

- **H1:** "LLM Orchestration" → "LLM and Agents".
- **Members (5):** libllm, libmemory, libprompt, libagent, **libtool**.
  `libtool` is new to this table.
- **`Key Exports`:**
  - libllm: `LlmApi`
  - libmemory: verify current exports (`WindowBuilder`, `createWindow`,
    `MemoryIndex`?)
  - libprompt: `PromptLoader`, `createPromptLoader`
  - libagent: `AgentMind`, `AgentAction` (verify)
  - libtool: `ToolProcessor`, `mapFieldToSchema`, `generateSchemaFromProtobuf`,
    `buildToolDescription` (from `libraries/libtool/src/index.js` — confirmed
    at planning time)
- **Body changes:** add a `libtool` row to the table; add one Decision Guide
  bullet ("libtool vs libagent — `ToolProcessor` for binding a protobuf tool
  service into an LLM-callable tool; `AgentMind` for running the
  conversation"); add one DI Wiring code block showing `ToolProcessor`
  construction.

#### 4. `libs-content/SKILL.md`

- **H1:** "Web Presentation" → "Content".
- **Members (5):** libui, libformat, libweb, libdoc, libtemplate. `libcli`
  and `librepl` move **out** to `libs-cli-and-tooling`.
- **`Key Exports`:** existing rows stay, minus libcli and librepl.
- **Body changes:** remove libcli and librepl from any Decision Guide /
  Composition Recipes / DI Wiring content that currently references them.
  (Grep inside the file before removing; if libcli/librepl appear only in
  the table, only the table row removal is needed.)
- **libdoc build outputs section** (currently at `libs-web-presentation/
  SKILL.md` lines 144–167): preserve verbatim.

#### 5. `libs-cli-and-tooling/SKILL.md`

- **H1:** "System Utilities" → "CLI and Tooling".
- **Members (8):** **libcli**, **librepl**, libutil, libsecret, libsupervise,
  librc, libcodegen, **libeval**. This is the biggest membership change —
  three libraries inherited from `libs-system-utilities` plus libcli, librepl
  (moved in) plus libeval (already in the old table).
- **`Key Exports`:**
  - libcli: `Cli`, `createCli`, `HelpRenderer`, `SummaryRenderer`,
    `formatTable`, `colorize` (subset — libcli exports 17+ names)
  - librepl: `Repl`
  - libutil: `generateHash`, `generateUUID`, `countTokens`, `createTokenizer`,
    `createBundleDownloader`, `Retry`, `createRetry`, `waitFor`,
    `parseJsonBody`, `updateEnvFile`, `Finder`, `BundleDownloader`,
    `TarExtractor` — pick a representative 4–6.
  - libsecret: `generateSecret`, `generateBase64Secret`, `generateJWT`,
    `readEnvFile`, `getOrGenerateSecret`, `updateEnvFile`, `generateHash`,
    `generateUUID`
  - libsupervise: `SupervisionTree`, `createSupervisionTree`, `LongrunProcess`,
    `OneshotProcess`, `LogWriter`, `ProcessState`
  - librc: `ServiceManager`, `sendCommand`, `waitForSocket`
  - libcodegen: `CodegenBase`, `CodegenTypes`, `CodegenServices`,
    `CodegenDefinitions`
  - libeval: `TraceCollector`, `createTraceCollector`, `AgentRunner`,
    `createAgentRunner`, `Supervisor`, `createSupervisor`, `TeeWriter`,
    `createTeeWriter`
- **Body changes:**
  - Decision Guide gains entries for libcli (CLI entry point vs REPL),
    librepl (vs inline readline), libeval (trace processing, agent running,
    supervisor loop). Remove libraries that moved **out** (libtool — moved
    to `libs-llm-and-agents`; nothing else moves out).
  - Composition Recipes: keep the two existing recipes (supervise a service,
    generate secrets, generate code from proto) and add one recipe each for
    libcli (create a CLI entry point using `Cli` + `HelpRenderer`), librepl
    (start a REPL with `Repl`), libeval (run an agent with `AgentRunner`).
  - DI Wiring: add blocks for libcli, librepl, libeval.
  - Cross-reference line to `libs-grpc-services` for the `libtelemetry.Logger`
    guidance ("for CLI logging, see libtelemetry in libs-grpc-services") —
    one sentence, no duplication.
  - Remove the libtool DI Wiring block if one exists (libtool was never in
    the old `libs-system-utilities`, but double-check nothing references it).
- **This is the highest-risk file.** It has the most rows, the longest
  description (8 libraries' verbs packed into ~100 words), and gains the
  most new content. Review the frontmatter description last, after the
  inner table is final, and count words.

#### 6. `libs-synthetic-data/SKILL.md`

- **H1:** "Synthetic Data Libraries" — unchanged.
- **Members (4):** libsyntheticgen, libsyntheticprose, libsyntheticrender,
  **libuniverse**. libuniverse is new to the table (currently referenced in
  the body but not listed in the three-row `Libraries` table).
- **`Key Exports`:**
  - libsyntheticgen: `DslParser`, `createDslParser`, `EntityGenerator`,
    `createEntityGenerator`, `createSeededRNG`, `collectProseKeys`,
    `PROFICIENCY_LEVELS`, `MATURITY_LEVELS`, `STAGE_NAMES`
  - libsyntheticprose: `ProseEngine`, `PathwayGenerator`, `createProseEngine`,
    `loadSchemas`
  - libsyntheticrender: `Renderer`, `createRenderer`, `ContentValidator`,
    `ContentFormatter`, `validateCrossContent`, `formatContent`,
    `generateDrugs`, `generatePlatforms`, `assignLinks`, `validateLinks`
  - libuniverse: `Pipeline`, `loadToSupabase` (plus the re-exports from the
    other three libraries — do **not** list re-exports in libuniverse's row,
    since they belong to their originating libraries)
- **Body changes:** add libuniverse row; the body Decision Guide already
  explains the `libsyntheticgen vs libuniverse` distinction (see line 38 of
  the current file), keep as-is; preserve the GetDX API References section,
  Verification section, and everything else below the Libraries table.

#### 7. `libskill/SKILL.md`

- **Frontmatter `description` rewrite.** Current description opens "Work with
  the @forwardimpact/libskill package" — the anti-pattern. Rewrite as "Use
  when deriving a job from Discipline × Level × Track, generating an agent
  profile, resolving skill modifiers, producing stage transition checklists,
  selecting interview questions by role, analysing career progression
  between levels, or matching candidates to jobs." (draft; adjust wording to
  stay under ~100 words and cover every function in
  `libraries/libskill/src/*.js`).
- **Body:** no changes. libskill is pure functions and the existing body is
  accurate after spec 130's pass; no inner `Libraries` table to restructure.

## Verification

Run at the package root after all seven files are rewritten, before committing:

1. **Grammar and structure check.**

   ```sh
   for f in .claude/skills/libs-*/SKILL.md .claude/skills/libskill/SKILL.md; do
     echo "=== $f ==="
     head -10 "$f"
   done
   ```

   Expected: every frontmatter `description` opens with "Use when".

2. **Column header check.**

   ```sh
   grep -n '^| Library' .claude/skills/libs-*/SKILL.md
   ```

   Expected: six lines, each reading `| Library | Capabilities | Key Exports |`.
   Zero hits with `Main API` or `Purpose`.

3. **Membership check.**

   Visually confirm against the truth table in `plan-a.md § New six-group
   truth table` that each file's `Libraries` table rows exactly match the
   expected members.

4. **Word-count check on descriptions.**

   ```sh
   for f in .claude/skills/libs-*/SKILL.md; do
     name=$(basename "$(dirname "$f")")
     desc=$(awk '/^description: >/,/^---$/' "$f" | sed '1d;$d' | tr '\n' ' ')
     words=$(echo "$desc" | wc -w)
     echo "$name: $words words"
   done
   ```

   Expected: six lines, each under ~120 words. Over 120 is a flag for the
   reviewer, not an auto-block.

5. **`bun run check` passes** (prettier reformats markdown tables, eslint
   is no-op on markdown). Format changes are expected; commit the
   reformatted output.

6. **`bun run test` passes** — unchanged, but running it confirms nothing in
   the SKILL.md rewrite affected any test.

7. **Part 04's `check:skill-exports`** is not yet wired in at this point.
   The Part 02 output is the canonical input that Part 04 validates against;
   any `Key Exports` name that doesn't resolve when Part 04 lands is a Part
   02 bug to be fixed before Part 04 commits.

## Risks

1. **Description word cap vs coverage.** Already flagged in the plan
   overview; main source of implementer judgement. Mitigation: review the
   `libs-cli-and-tooling` description last, after all capabilities are
   locked in.

2. **Stale names in existing tables.** The current `Main API` columns in
   some files contain names that do not match the actual exports (e.g.,
   `RpcServer` vs `Server` in librpc). **Do not copy stale names forward.**
   Read the live entry file every time.

3. **Reserved future extensibility.** If a library grows a new public export
   after Part 02 lands but before Part 04's check is running in CI, the
   advertised `Key Exports` cell is still valid (the check is
   strict-positive) but the Capabilities column drifts. This is acceptable;
   spec 130 and future spec are the continual correction mechanism.

4. **libsyntheticrender has many domain-specific helpers**
   (`generateDrugs`, `generatePlatforms`) that don't read like "synthetic
   data" verbs. Include them in Key Exports if they are public but keep
   Capabilities language at the level of "generate synthetic entities" — the
   specific names are in Key Exports, the router signal is in Capabilities
   and the frontmatter description.

5. **Recipe code in Composition Recipes may reference symbols that were
   renamed (e.g., `RpcServer`).** Fix as part of Part 02 — this is the last
   chance to catch spec 130 drift before Part 04 locks the contract.

## Commit

One commit for all seven files:

```
docs(skills): rewrite libs-* descriptions and tables (spec 400 part 2/4)

- Every libs-* SKILL.md frontmatter description now opens with "Use when"
  and lists capability verbs covering every public library export in the
  group.
- Inner Libraries tables use Capabilities / Key Exports columns.
- Add libtool to libs-llm-and-agents; libcli, librepl, libeval to
  libs-cli-and-tooling; libuniverse to libs-synthetic-data.
- Rewrite libskill frontmatter description from "Work with the package"
  to capability-verb form.
```

— Staff Engineer 🛠️
