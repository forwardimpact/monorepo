# 520 — APM-Compatible Pack Distribution

## Problem

Organizations deploying Pathway cannot install agent team packs through
Microsoft APM. A customer running `apm install` against the documented command
receives:

```
$ apm install --verbose https://pathway.bench.pfizer/packs/se-forward-deployed.tar.gz
[*] Validating 1 package...
  Trying git ls-remote for pathway.bench.pfizer
  git ls-remote rc=128: fatal: repository '...' not found
[x] https://pathway.bench.pfizer/packs/se-forward-deployed.tar.gz -- not accessible
```

`apm install` resolves packages through `git ls-remote` — it has no tarball-URL
code path. The generated command is structurally impossible for `apm install` to
process. However, APM's `apm unpack` command is designed for exactly this
scenario: extracting a pre-built bundle without git access.

Three separate issues prevent APM-based installation:

1. **Wrong command.** `getApmInstallCommand` emits a tarball URL targeting
   `apm install`, which only accepts git references. The correct path for
   static-site distribution is `apm unpack`, which accepts local bundles.

2. **Wrong manifest format.** `writeApmManifest` emits a custom `apm.yml` with a
   `skills:` array containing `url:` and `digest:` fields. APM's actual
   `apm.yml` is a package manifest with `name`, `version`, and optionally
   `dependencies`. The generated file is not a valid APM manifest and APM
   ignores it.

3. **Wrong pack layout.** APM packages use an `.apm/` internal structure
   (`.apm/skills/`, `.apm/agents/`) that APM maps to target directories
   (`.claude/skills/`, `.claude/agents/`) during install/unpack. Pathway packs
   contain the deployed `.claude/` layout directly, which APM does not recognize
   as package content.

The `npx skills` path and `curl | tar` extraction continue to work. Only the APM
integration — one of the two ecosystem channels spec 0320 established — is
broken.

## Why

### APM adoption is growing and Pathway packs are invisible to it

Organizations already using APM for prompt and skill management expect Pathway
packs to be APM-compatible. The current failure means packs cannot participate
in any APM workflow — not even the offline `apm unpack` path designed for static
distribution.

### APM has a built-in path for static distribution

`apm install` requires a git repository. But APM's `pack`/`unpack` pipeline
exists for exactly the scenario Pathway faces: distributing pre-built bundles
without a git server. `apm unpack` extracts a bundle into a project directory,
mapping `.apm/` contents to the target layout. This is APM's blessed path for
offline, air-gapped, and static hosting scenarios.

### The pack content already exists in the right shape

APM's package format stores skills under `.apm/skills/{name}/` and agents under
`.apm/agents/`. Pathway packs already contain these same files under
`.claude/skills/` and `.claude/agents/`. The transformation is a prefix change,
not a content change.

## What

Fix the Pathway build to emit APM-compatible pack bundles alongside the existing
tarball and `npx skills` channels, so that `apm unpack` works out of the box.
This is a clean-break migration: function names, archive naming, and manifest
format all change with no backwards-compatibility shims.

### Requirements

1. **APM-compatible bundle per pack.** `fit-pathway build` must produce a
   `.tar.gz` bundle at `packs/{name}.apm.tar.gz` for each valid discipline/track
   combination. The bundle must use APM's package structure: skills under
   `.apm/skills/{name}/`, agents under `.apm/agents/`, and an `apm.yml` at the
   bundle root.

2. **Valid package manifest inside each bundle.** Each bundle's `apm.yml` must
   be a valid APM package manifest with at least `name` and `version` fields.
   APM must recognize the bundle as a valid package during `apm unpack`.

3. **Correct install commands.** Each channel must have a command generator:
   `getRawCommand` (`curl -sL <url> | tar xz`), `getApmCommand`
   (`curl -sLO <url> && apm unpack <file>`), and `getSkillsCommand`
   (`npx skills add <url>`).

4. **Valid site-root `apm.yml`.** The `apm.yml` emitted at the site root must be
   a valid APM project manifest with pack bundles listed under
   `dependencies.apm` so that the file serves as a reference for available
   packs.

5. **Coexistence with existing channels.** The `.well-known/skills/` structure
   for `npx skills` and the `.raw.tar.gz` archives for direct extraction must
   continue to be emitted alongside the APM bundles. No existing install path
   may break.

6. **Deterministic, reproducible bundles.** Two builds of the same framework
   data at the same Pathway version must produce byte-identical APM bundles. The
   existing deterministic archive strategy (epoch timestamps, sorted file lists,
   `gzip -n`) applies to APM bundles as well.

7. **Clean break.** This is a breaking change to build output and internal APIs.
   Archive files are renamed from `{name}.tar.gz` to `{name}.raw.tar.gz` for
   symmetry with `{name}.apm.tar.gz`. All internal function names are renamed
   for symmetric channel naming (raw/apm/skills). No old names are preserved, no
   aliases, no re-exports. Tests are updated to match.

### Scope

**Affected capabilities:**

- Pack generation pipeline — new APM bundles, renamed raw archives, renamed
  functions
- Install command derivation — new `getApmCommand`, renamed `getSkillsCommand`
- Site-root manifest — rewritten as valid APM project manifest

**Not affected:**

- `install.sh` / `bundle.tar.gz` (CLI install path unchanged)
- Agent/skill derivation logic (content unchanged, only layout restructured)

### Content coverage

APM's primitive types cover skills (`.apm/skills/`) and agents (`.apm/agents/`).
Each skill's `scripts/`, `references/`, and other bundled resources are carried
alongside `SKILL.md` and remain accessible after unpack.

Two files in the current pack have no usable APM primitive:

- **`CLAUDE.md`** (team instructions) — APM's instructions primitive deploys to
  `.claude/instructions/`, which Claude Code does not read. Consumers must use
  the raw tarball path for team instructions.
- **`settings.json`** (Claude Code settings) — no APM primitive exists.
  Consumers must use the raw tarball path for settings.

The agent builder UI should note that `apm unpack` delivers skills and agent
profiles but not team instructions or settings.

### Success criteria

1. `apm unpack <bundle>.apm.tar.gz` installs skills and agent profiles into
   `.claude/` of the consumer's project. The installed skills and agents are
   content-identical to the canonical pack output for the same discipline/track
   combination.

2. The `apm.yml` inside each bundle is a valid APM package manifest recognized
   by `apm unpack`.

3. The `apm.yml` at the site root is a valid APM project manifest listing all
   available packs.

4. The `.well-known/skills/index.json` manifests and `.raw.tar.gz` archives
   continue to be emitted with content identical to the pre-change build
   (renamed from `.tar.gz` to `.raw.tar.gz`).

5. Two builds of the same input produce byte-identical APM bundles, raw
   tarballs, and manifests.

## Out of Scope

- **Native `apm install` support.** `apm install` requires a git repository.
  Serving bare git repos over dumb HTTP from static hosting is fragile (depends
  on CDN behavior and git's smart-to-dumb HTTP fallback) and complex (requires
  shelling out to git in the build pipeline). `apm unpack` is APM's designed
  path for static distribution and avoids both issues.
- **Publishing to the APM marketplace.** Listing packs in a central registry is
  a separate effort.
- **`settings.json` distribution via APM.** No APM primitive exists. The raw
  tarball remains the distribution path for settings.
- **Hosting configuration.** The build emits files; deployment is the
  organization's responsibility.
- **Backwards compatibility.** Old archive names (`.tar.gz` without the `.raw`
  qualifier) and old function names (`archivePack`, `writePackRepository`,
  `getApmInstallCommand`, etc.) are not preserved. This is a clean break.

## References

- Spec 0320 — Pathway Ecosystem Distribution (parent spec, `plan implemented`)
- [APM documentation](https://microsoft.github.io/apm/) — package format, unpack
  command, bundle structure
- [APM sample package](https://github.com/microsoft/apm-sample-package) —
  canonical `.apm/` directory layout
- `products/pathway/src/commands/build-packs.js` — current pack generation
- `products/pathway/src/pages/agent-builder-install.js` — install command
  derivation
- Customer report: `apm install` failure against
  `pathway.bench.pfizer/packs/se-forward-deployed.tar.gz`
