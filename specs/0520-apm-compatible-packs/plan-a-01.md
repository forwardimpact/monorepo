# 520 — Plan Part 01: Rename Functions for Symmetric Channel Naming

Mechanical rename pass. No logic changes. Establishes the `{verb}{Channel}`
naming convention before new APM functionality is added.

## Steps

### Step 1: Rename in `build-packs.js`

**File:** `products/pathway/src/commands/build-packs.js`

| Old name                   | New name               | Line (approx)                       |
| -------------------------- | ---------------------- | ----------------------------------- |
| `archivePack`              | `archiveRawPack`       | :263 (function declaration)         |
| `archivePack`              | `archiveRawPack`       | :542 (call site in `generatePacks`) |
| `writePackRepository`      | `writeSkillsPack`      | :351 (function declaration)         |
| `writePackRepository`      | `writeSkillsPack`      | :557 (call site in `generatePacks`) |
| `writeAggregateRepository` | `writeSkillsAggregate` | :393 (function declaration)         |
| `writeAggregateRepository` | `writeSkillsAggregate` | :569 (call site in `generatePacks`) |

`writeApmManifest` keeps its name (already symmetric).

Also rename the archive extension in `generatePacks`:

- Line ~541: `${agentName}.tar.gz` → `${agentName}.raw.tar.gz`
- Line ~548: URL `.tar.gz` → `.raw.tar.gz`

Update the logger lines to reflect `.raw.tar.gz`:

- Line ~552: `packs/${agentName}.tar.gz` → `packs/${agentName}.raw.tar.gz`

### Step 2: Rename in `agent-builder-install.js`

**File:** `products/pathway/src/pages/agent-builder-install.js`

| Old name               | New name           |
| ---------------------- | ------------------ |
| `getApmInstallCommand` | `getApmCommand`    |
| `getSkillsAddCommand`  | `getSkillsCommand` |

In `getApmCommand`, update the archive extension:

- `${packName}.tar.gz` → `${packName}.apm.tar.gz` (both in the URL and the
  `apm unpack` argument)

Update the JSDoc comments to match the new names.

Update `createInstallSection` to call `getApmCommand` and `getSkillsCommand`.

### Step 3: Update module comments

Update the module-level JSDoc in `build-packs.js` (lines 1–13) to reference all
three channels (raw, apm, skills) and spec 0520 instead of only spec 0320.

Also update the module-level JSDoc in `agent-builder-install.js` (lines 1–11) to
reference all three channels (raw, apm, skills) and spec 0520. Mention that
`getRawCommand` will be added in a subsequent step — or defer this comment
update to part 02, step 6 when the function actually exists. Either approach is
acceptable since all parts land in one PR.

## Verification

After this part, the codebase compiles and the existing test suite fails on:

- **Name mismatches** — tests still import `getApmInstallCommand` and
  `getSkillsAddCommand` (resolved in part 03).
- **Extension mismatches** — tests assert `.tar.gz` but archives are now
  `.raw.tar.gz` (resolved in part 03).
- **Missing `.apm.tar.gz`** — `getApmCommand` now references `.apm.tar.gz` but
  APM bundles are not emitted until part 02. The "apm unpack command references
  a real archive" integration test will fail for this reason specifically
  (resolved by part 02 + part 03 together).

Quick smoke check:

```text
grep -r "archivePack\b" products/pathway/src/  # should return 0 matches
grep -r "writePackRepository\b" products/pathway/src/  # should return 0 matches
grep -r "writeAggregateRepository\b" products/pathway/src/  # should return 0 matches
grep -r "getApmInstallCommand\b" products/pathway/src/  # should return 0 matches
grep -r "getSkillsAddCommand\b" products/pathway/src/  # should return 0 matches
```
