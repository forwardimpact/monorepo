# 520 — Plan: APM-Compatible Pack Distribution

## Approach

The design identifies three new pieces of work (layout transformer,
`archiveApmPack`, rewritten `writeApmManifest`) plus a set of renames. The
implementation sequences these so the clean-break rename happens first as a
mechanical step, then the new APM functionality layers on top. This avoids
mixing rename noise with logic changes, making each commit independently
reviewable.

The plan decomposes into three parts because the rename, the new APM pipeline,
and the test/UI updates are independent once the rename lands.

## Blast Radius

### Created

| File                                               | Purpose                                                                                                                          |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `products/pathway/src/commands/build-packs-apm.js` | APM-specific logic: `transformToApmLayout` and `archiveApmPack` (extracted to stay within `build-packs.js` max-lines lint limit) |

### Modified

| File                                                  | What changes                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `products/pathway/src/commands/build-packs.js`        | Rename `archivePack` → `archiveRawPack`, `writePackRepository` → `writeSkillsPack`, `writeAggregateRepository` → `writeSkillsAggregate`; rewrite `writeApmManifest`; export `collectPaths`, `resetTimestamps`, `slugify`; drop digest computation; update `generatePacks` orchestration |
| `products/pathway/src/pages/agent-builder-install.js` | Rename `getApmInstallCommand` → `getApmCommand`, `getSkillsAddCommand` → `getSkillsCommand`; add `getRawCommand`; update archive extensions to `.apm.tar.gz` / `.raw.tar.gz`; add raw channel to install section UI                                                                     |
| `products/pathway/test/build-packs.test.js`           | Update archive extension assertions from `.tar.gz` to `.raw.tar.gz`; add APM bundle tests (layout, manifest, determinism); update `apm.yml` assertions for new format                                                                                                                   |
| `products/pathway/test/agent-builder-install.test.js` | Rename test references; update expected command strings; add `getRawCommand` tests                                                                                                                                                                                                      |

### Deleted

_(none — old function names are replaced in-place, not deleted as separate
symbols)_

## Libraries Used

No new shared library dependencies. The implementation uses the same imports
already present in `build-packs.js`:

- `@forwardimpact/libtelemetry` — `createLogger`
- `@forwardimpact/map/loader` — `createDataLoader`
- `@forwardimpact/libtemplate` — `createTemplateLoader`
- `@forwardimpact/libskill/agent` — `generateAgentProfile`,
  `deriveReferenceLevel`, `deriveAgentSkills`, `generateSkillMarkdown`,
  `interpolateTeamInstructions`, `getDisciplineAbbreviation`, `toKebabCase`

The existing Node built-ins (`fs/promises`, `child_process`, `path`) continue to
be used. The `crypto` import is removed from `build-packs.js` (digest
computation dropped). `build-packs-apm.js` uses `fs/promises`, `child_process`,
and `path` — all already available, no additions.

---

## Part Index

| Part                         | Summary                                                                         | Depends on |
| ---------------------------- | ------------------------------------------------------------------------------- | ---------- |
| [plan-a-01.md](plan-a-01.md) | Rename existing functions for symmetric channel naming                          | —          |
| [plan-a-02.md](plan-a-02.md) | Add APM pipeline (layout transformer, archiveApmPack, rewrite writeApmManifest) | Part 01    |
| [plan-a-03.md](plan-a-03.md) | Update tests and install section UI                                             | Part 02    |

## Ordering and Dependencies

Parts are strictly sequential: part 01 is the rename foundation, part 02 builds
APM logic on the renamed functions, and part 03 updates tests and UI to match
both changes. Tests are expected to fail after parts 01 and 02 because they
still reference old names and formats — part 03 resolves this. All three parts
should land in a single PR branch; they are separate for reviewability, not for
independent merging.

## Risks

1. **Archive extension rename breaks downstream consumers.** The spec declares
   this a clean break with no backwards compatibility. Consumers referencing
   `.tar.gz` must update to `.raw.tar.gz`. This is by design, not accidental.

2. **BSD tar vs GNU tar flag differences.** The deterministic archive strategy
   already handles this (no `--sort=name`, timestamps reset in JS). The new
   `archiveApmPack` reuses the same strategy — no new tar flags.

3. **APM `.agent.md` extension requirement.** APM expects agent files to use the
   `.agent.md` extension. The layout transformer must rename `{name}.md` →
   `{name}.agent.md`. If APM changes this convention, the transform breaks. Low
   risk — the extension is documented in APM's sample package.

## Execution

All three parts are strictly sequential and modify the same files, so they
cannot run in parallel. Route all parts to `staff-engineer`.
