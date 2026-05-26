# 700 — Git-Installable Pack Repos

## Problem

Pathway distributes each pack through three static-file channels emitted by
`fit-pathway build`:

| Channel    | Artifact                                     |
| ---------- | -------------------------------------------- |
| Raw        | `packs/{name}.raw.tar.gz`                    |
| APM        | `packs/{name}.apm.tar.gz`                    |
| npx-skills | `packs/{name}/.well-known/skills/index.json` |

Install commands per channel are derived in `agent-builder-install.js` (single
source of truth).

Both APM and npx-skills consumers ultimately speak a git-shaped install model
when they reach beyond static hosting:

- **APM.** `apm install <url>` is APM's canonical install path. It resolves
  packages through `git ls-remote` and has no tarball-URL code path. Spec 0520
  routed Pathway around this through `apm unpack`, which works but obligates
  customers to a non-canonical two-step command and excludes Pathway packs from
  any APM workflow that composes `apm install` with version pinning, lockfiles,
  or registry resolution.
- **npx-skills.** The pack-served channel uses a custom HTTP discovery protocol
  (`.well-known/skills/index.json`). The companion mirror channel
  (`forwardimpact/skills`, referenced from `CLAUDE.md`) installs from a real git
  repository — `npx skills add forwardimpact/skills`. The two paths solve the
  same problem with different primitives, and only the mirror form composes with
  anything else that speaks `git clone`.

Spec 0520 deferred native git support on fragility grounds: serving a bare repo
over dumb HTTP from static hosting was judged "depends on CDN behavior and git's
smart-to-dumb HTTP fallback" and "complex (requires shelling out to git in the
build pipeline)". Subsequent investigation shows the static surface is in fact
bounded and well-defined: a single-commit, repacked bare repo is five files plus
a fixed skeleton, served by any HTTP file host. The dumb HTTP protocol is
stable, content-type-agnostic, and does not fall back to or from smart HTTP —
clients negotiate based on URL alone.

The fragility risk has not materialized; the workaround cost has. Customers
deploying Pathway as a static site cannot use `apm install`, and the two-channel
split for skills (custom HTTP discovery vs. real git mirror) is a durable
maintenance burden.

## Why

### One primitive serves both consumer ecosystems

`git clone <url>` is the lowest common denominator across APM, npx-skills (in
its mirror form), and any future tool that consumes packs. A static bare git
repo per pack is consumable by every git-aware tool without per-tool adaptation.
Both pack channels gain a canonical install URL from the same build-time
mechanism.

### The static surface is small and stable

A frozen single-commit bare repo requires only `HEAD`, `info/refs`,
`objects/info/packs`, one `.pack`, one `.idx`, plus the standard bare-repo
skeleton. No CGI, no daemon, no smart HTTP. Any static host (Vercel, S3, GitHub
Pages, an organization's internal CDN) serves it correctly. The cost to add this
output to Pathway's build is bounded; the cost to maintain parallel non-git
channels is recurring.

### Reproducibility primitives already exist

Pack staging is already deterministic (epoch timestamps, sorted file lists,
`gzip -n`). The same discipline extends to bare-repo emission: a fixed commit
author/date/email plus sorted tree entries yield a stable commit SHA across
rebuilds, so identical pack content produces an identical clone URL identity.

### Latest-only matches today's distribution semantics

Every existing channel overwrites the pack on each build. There is no preserved
version history today. A latest-only bare repo loses nothing that exists now and
unlocks `apm install <url>` immediately. Multi-version distribution is a
separable concern with separable mechanisms (per-version URL paths, external
archives) and is not blocked by this spec.

## What

Add a generic build-time primitive that converts any staged directory tree into
a static bare git repository served as part of the Pathway site. Apply the
primitive to both the APM bundle staging tree and the skills-pack staging tree,
so each pack gains a `git clone`-able URL alongside its existing tarball and
discovery-index outputs.

### Requirements

1. **Generic bare-repo emitter.** The build provides a single mechanism that
   takes a staged directory tree plus a version label and produces a static bare
   git repo whose root is publishable as static files. The mechanism is not
   specific to APM or skills — it is a building block both pack channels reuse.

2. **Per-pack git URL — APM.** For each pack, the build emits a static bare repo
   whose working tree contains the same files as the corresponding
   `{name}.apm.tar.gz` archive (currently `.claude/skills/`, `.claude/agents/`,
   optional `.claude/CLAUDE.md`, and `apm.lock.yaml` at the root, per
   `build-packs-apm.js`). The repo is reachable at `packs/{name}.apm.git/` under
   the site root and installable via `apm install <site>/packs/{name}.apm.git`.

3. **Per-pack git URL — skills.** For each pack, the build emits a static bare
   repo whose working tree contains the same skill files exposed through the
   npx-skills channel for that pack. The repo is reachable at
   `packs/{name}.skills.git/` under the site root and consumable by any
   git-aware skill installer pointed at it.

4. **Latest only, single commit.** Each build emits a fresh repository
   containing exactly one commit on the default branch. No prior history is
   carried across builds. The commit is tagged with the Pathway package version
   so consumers may pin to that tag for the duration the site serves that build.

5. **Deterministic identity.** Two builds of the same input at the same Pathway
   version produce a byte-identical bare repo, including identical commit SHA,
   tree SHA, and packfile contents.

6. **Static hosting only.** The emitted repo must clone correctly over plain
   HTTP/HTTPS from any file-serving host without CGI, smart HTTP, or git daemon
   support. The build pipeline produces files; deployment is unchanged from
   existing channels.

7. **Coexistence with existing channels.** Raw tarballs, APM tarballs, and the
   `.well-known/skills/` discovery index continue to be emitted with their
   current content. The git repos are additive. The agent builder UI surfaces
   the canonical git install command alongside the existing `curl … | tar`,
   `apm unpack`, and `npx skills add` commands — specifically
   `apm install <site>/packs/{name}.apm.git` for the APM channel and
   `git clone <site>/packs/{name}.skills.git` for the skills channel. No
   existing command is removed.

### Scope

**Affected capabilities:**

- Pack generation pipeline — adds a bare-repo output per pack per channel
- Agent builder install UI — surfaces a git install command alongside the
  existing tarball/skills commands
- Build determinism contract — extends from tarball byte-equality to also cover
  bare-repo byte-equality
- Pack distribution library — pack generation logic extracted to
  `libraries/libpack` (selected via design-c)

Git emission inherits the existing `framework.distribution.siteUrl` gate that
controls all per-pack output today: when `siteUrl` is unset the build produces
no per-pack artifacts of any kind, and that behavior is unchanged.

**Not affected:**

- Existing tarball and discovery-index outputs (content unchanged)
- Pack staging logic (the directory tree fed to each channel is unchanged)
- Hosting, CDN, or deployment configuration
- The `forwardimpact/skills` GitHub mirror sync workflow

### Success criteria

1. `git clone https://<site>/packs/{name}.apm.git` succeeds against a static
   file host serving the build output and yields a working tree matching the APM
   bundle layout.

2. `apm install https://<site>/packs/{name}.apm.git` succeeds, and the resulting
   `.claude/` tree in the consumer's project is byte-identical to the `.claude/`
   tree produced by `apm unpack` of the same build's `{name}.apm.tar.gz`.

3. `git clone https://<site>/packs/{name}.skills.git` succeeds and yields a
   working tree matching the skills-pack layout.

4. Two builds of identical framework data at the same Pathway version produce
   byte-identical bare-repo file trees, including identical commit SHAs and
   packfile bytes.

5. The Pathway version is reachable as a git tag in each emitted repo
   (`git ls-remote --tags <url>` lists `v{version}`).

6. Each emitted repo conforms to the dumb-HTTP layout: it clones cleanly over
   plain HTTP/HTTPS from a static file host with no smart-HTTP endpoints
   present. Verified by pointing `git clone` at a local static server hosting
   the build output.

7. Existing channels continue to emit byte-identical output to the pre-change
   build for the same input.

## Out of Scope

- **Version history.** Each rebuild discards the prior commit.
  `apm install <url>@<old-version>` resolves only if the currently-served build
  is that version. Multi-version distribution (per-version URL paths, external
  archives keyed by Pathway release) is a separable concern.

- **Smart HTTP / native git server.** Dumb HTTP over static files only. No CGI,
  no `git-http-backend`, no service hosting.

- **Authentication or private repos.** All emitted repos are public and match
  the public-static-file model of the rest of the Pathway site.

- **Changes to npx-skills client tooling.** Whether and how the `npx skills` CLI
  consumes a git URL is the upstream tool's concern. The build emits the URL;
  client adoption is independent.

- **CDN cache invalidation tuning.** Deployment-layer concern. The spec defines
  what bytes the build emits; how a host serves them (cache headers,
  immutability hints, ETag policy) is the deployer's choice.

## References

- Spec 0520 — APM-Compatible Pack Distribution (parent; deferred native
  `apm install` as out-of-scope on fragility grounds this spec revisits)
- Spec 0320 — Pathway Ecosystem Distribution (established the three-channel
  model)
- [Git HTTP protocol — dumb HTTP](https://git-scm.com/docs/http-protocol) — the
  static-file contract this spec relies on
- [`git-update-server-info`](https://git-scm.com/docs/git-update-server-info) —
  the command that produces `info/refs` and `objects/info/packs`
- `products/pathway/src/commands/build-packs.js` — current pack pipeline
- `products/pathway/src/commands/build-packs-apm.js` — APM bundle staging whose
  output the APM bare repo would commit
- `products/pathway/src/pages/agent-builder-install.js` — install command
  derivation that gains a git option
- `CLAUDE.md` — distribution model invariants (npm + npx skills mirror)
