# 320 — Pathway Ecosystem Distribution for Agents and Skills

Pathway today has exactly one way to put agents and skills in front of an
engineer: `curl -fsSL https://<org>/install.sh | bash`. That script installs
`@forwardimpact/pathway` globally via npm, downloads `bundle.tar.gz`, extracts
its `data/` directory into `~/.fit/data/pathway/` (and its `package.json` into
`~/.fit/data/package.json`), and leaves the engineer to run
`fit-pathway agent <discipline> --track=<track> --output=./agents` to derive a
Claude Code agent team. It works, but it is the only door. Engineers who want to
use emerging ecosystem tools — Vercel's `npx skills add <source>`, Microsoft's
Agentic Package Manager (APM) — cannot reach Pathway agents or skills through
those tools. Pathway is invisible to the package managers that engineers are
beginning to reach for first.

This spec proposes adding a second distribution surface, served from the same
static site that already hosts `install.sh` and `bundle.tar.gz`. The new surface
exposes pre-generated agent/skill packs in a format that both `npx skills` and
APM can install directly, so an engineer can adopt a Pathway agent team without
ever running the Pathway CLI.

## Why

### One distribution path is a reach problem

The current install flow assumes the engineer already knows about Pathway and is
willing to pipe a shell script. Engineers adopting agentic tools are
increasingly starting from the package manager their editor or team already
uses. If the first question an engineer asks is "does my skill manager have
this?" and the answer is no, Pathway is not considered further. The gap is not
in what Pathway can generate — `fit-pathway agent` already produces Claude
Code-format agent profiles and SKILL.md files with full team instructions — it
is in how those artefacts get to the engineer.

### Ecosystem tools are converging on a shared shape

Both `npx skills` and APM expect the publisher to host something the tool can
fetch: a manifest that lists available packs, and a downloadable archive per
pack containing the agent/skill files plus metadata. The shapes differ in naming
and JSON structure, but the underlying artefact — a directory of SKILL.md files
and an agent profile with a small manifest — is close enough that a single build
can satisfy both if the spec is designed with both in mind from the start.

### The build pipeline is already where this belongs

`fit-pathway build` (`products/pathway/src/commands/build.js`) already renders
the static site, generates `bundle.tar.gz`, and renders `install.sh` from a
template when `framework.distribution.siteUrl` is configured. Adding agent/skill
pack generation to the same command — same inputs, same output directory — keeps
the publishing story coherent: one `bun run build`, one deploy, one origin
hosting everything an engineer needs regardless of how they arrive.

### Pathway already knows the packs

`fit-pathway agent --list` enumerates every valid discipline/track combination.
For each combination,
`fit-pathway agent <discipline> --track=<track> --output=<dir>` already produces
exactly the set of files that belongs in a pack: the agent profile per stage,
the derived skill files, the team instructions, and the Claude Code settings.
The work in this spec is to loop over the valid combinations at build time,
capture each output as a pack, wrap it in the manifest shapes the ecosystem
tools expect, and publish the result alongside `install.sh`.

## What

Extend the Pathway build output so the same static site that hosts `install.sh`
also hosts a discoverable set of pre-generated agent/skill packs, each
installable by both `npx skills` and Microsoft APM without any additional
Pathway tooling on the engineer's machine.

### Requirements

1. **Pre-generated packs, one per valid agent combination.** `fit-pathway build`
   must generate one installable pack per valid discipline/track combination
   returned by the existing agent-listing logic. Each pack contains the agent
   profile files for every stage, the derived skill files, the interpolated team
   instructions, and the Claude Code settings — the same artefacts
   `fit-pathway agent <discipline> --track=<track> --output=<dir>` produces
   today.

2. **A single discoverable endpoint serves both tools.** The published site must
   expose a registry/index that both `npx skills` and APM can parse to discover
   the available packs. A single source of truth is required — the generator may
   emit multiple manifest files (one shaped for each tool) but they must be
   derived from the same underlying list, so adding a new pack cannot desync the
   two views. An engineer pointing either tool at the Pathway site URL must see
   the same set of packs.

3. **Packs install cleanly through the target tools.** Pointing
   `npx skills add <pathway-site-url>` at the published site must install a
   pack's contents into the engineer's project in the location the tool expects
   (typically `.claude/skills/` or equivalent). Pointing APM at the same site
   using its documented discovery mechanism must install the same pack's
   contents into the location APM expects. "Installed" means the files land in
   the right place and the tool reports success — no post-install fixups
   required.

4. **Content parity with the CLI path.** A pack installed via `npx skills` or
   APM must contain the same agent profile, skills, team instructions, and
   Claude Code settings that
   `fit-pathway agent <discipline> --track=<track> --output=<dir>` produces for
   the same combination. If the CLI path gains or changes a file, the pack path
   must reflect the change after the next build.

5. **Served from the existing static site.** The new manifests and pack archives
   must be emitted into the same output directory as
   `install.sh`/`bundle.tar.gz` and deploy to the same origin. No new hosting
   target, no new deploy pipeline. URLs referenced inside the manifests must
   resolve relative to `framework.distribution.siteUrl`, the same setting
   `install.sh` already uses.

6. **Build remains a single command.** `fit-pathway build` must produce the
   packs and manifests alongside the existing outputs when
   `framework.distribution.siteUrl` is configured. A separate command or flag is
   acceptable only if the default `build` still emits the packs — the aim is
   that existing deploys light up the new surface without any workflow change.

7. **Versioned, reproducible packs.** Each pack and each manifest entry must
   carry the Pathway version that produced it (the same version `install.sh`
   pins). Two builds of the same framework data at the same Pathway version must
   produce byte-identical packs, so caches and CDN behaviour remain sane.

8. **The existing install.sh path continues to work unchanged.** Engineers who
   want the full `fit-pathway` CLI on their machine must still get it from
   `curl | bash`. This spec adds a surface; it does not remove one. No change to
   `install.template.sh`, `bundle.tar.gz`, or the CLI.

### Success criteria

1. After `fit-pathway build` runs against the Pathway starter data with a
   configured `siteUrl`, the output directory contains: a registry/index file
   consumable by both `npx skills` and APM, and one pack archive per valid
   discipline/track combination returned by `fit-pathway agent --list`.

2. Running `npx skills add <deployed-site-url>` against the deployed site
   discovers the packs, lets the engineer pick one, and installs it into the
   expected skills directory of the current project. The installed files match
   the output of `fit-pathway agent <discipline> --track=<track> --output=<dir>`
   for the same combination.

3. Running APM against the deployed site lists the same set of packs and
   installs the selected pack's contents into the location APM expects. The
   installed files match the CLI output for the same combination. The exact APM
   command and discovery mechanism are resolved during planning against APM's
   current public documentation; this spec only requires that whatever
   single-URL discovery APM supports at planning time must work here without
   asking the engineer to configure anything beyond the Pathway site URL.

4. `curl -fsSL <deployed-site-url>/install.sh | bash` still installs
   `@forwardimpact/pathway` and downloads `bundle.tar.gz` with the same
   behaviour as before this spec.

5. Bumping the Pathway version in `products/pathway/package.json` and re-running
   `fit-pathway build` produces pack archives and manifest entries that
   reference the new version. The same version and input data produce
   byte-identical outputs on a repeat build.

6. Adding a new discipline/track combination to the framework data and
   re-running `fit-pathway build` adds a new pack and manifest entry without any
   manual step in between.

## Out of Scope

- **Submitting Pathway to a central registry.** If either tool maintains a
  central index, listing Pathway there is a separate effort. This spec only
  requires that a site-URL-based install works.
- **New agent/skill content.** The packs contain whatever `fit-pathway agent`
  already produces. This spec does not change derivation, add new stages, or
  alter skill shape.
- **A Pathway-specific package manager.** Pathway is not building its own
  installer CLI. It only hosts the artefacts other tools consume.
- **Per-engineer customisation at install time.** Packs are pre-generated at
  build time. Engineers who want custom combinations still use the existing
  `fit-pathway agent` CLI path.
- **Authentication or private distribution.** The existing site is a public
  static deploy. Private hosting, access tokens, or per-user licensing are not
  in scope.
- **Deprecation of `install.sh`.** Confirmed: the new surface supplements, does
  not replace, the current curl|bash path.
- **Packs for non-agent Pathway outputs** (e.g. job descriptions, interview
  questions). Only agent/skill packs are in scope.
- **Changes to the underlying framework data or to `fit-map`.** Only the Pathway
  build command and its output directory are affected.

## References

- `products/pathway/src/commands/build.js` — current build pipeline and
  bundle/install.sh generation. Reads `framework.distribution.siteUrl` at
  `build.js:205` to decide whether to render distribution artefacts.
- `products/pathway/src/commands/update.js` — secondary reader of
  `framework.distribution.siteUrl` for update flows. Note:
  `distribution.siteUrl` is a per-installation opt-in that consuming
  organisations add to their own `framework.yaml`; it is not shipped in
  `products/pathway/starter/framework.yaml`.
- `products/pathway/src/commands/agent.js` — existing derivation of agent
  profiles, skills, team instructions, and Claude Code settings per
  discipline/track combination.
- `products/pathway/src/commands/agent-io.js` — file layout the packs must
  preserve (`.claude/agents/`, `.claude/skills/`, `.claude/CLAUDE.md`,
  `.claude/settings.json`).
- `products/pathway/templates/install.template.sh` — current curl|bash installer
  template. Unchanged by this spec.
- Spec 230 (pathway-init-npm) — prior work on Pathway npm installability.
- Spec 300 (npm-user-experience) — prior work on external-user install paths.
