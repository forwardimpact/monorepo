# Publish @forwardimpact/guide on npm

## Why

### The expected install path fails

Guide is a core product in the Forward Impact suite. The website describes it
alongside Map, Pathway, Basecamp, Landmark, and Summit. The product page at
`/guide/` explains what Guide does and how it fits into the suite. An engineer
or agent reading this documentation will naturally attempt:

```
bun install @forwardimpact/guide
```

This returns a 404. The package exists in the monorepo at
`products/guide/package.json` as `@forwardimpact/guide` version 0.1.4, but it is
marked `"private": true` and has never been published to npm.

Meanwhile, `@forwardimpact/pathway` and `@forwardimpact/map` install
successfully. The inconsistency is confusing — Guide appears to be a first-class
product but cannot be installed like one.

### Bad first impression for new users

Spec 220 (test-guide-product-setup) specifically tests the experience of a new
engineer discovering Guide through the website and attempting to install it.
That test exercises the path: read the docs, install packages from npm,
configure framework data. The install step fails because the package does not
exist on npm.

This is the first interaction many engineers will have with the product. A 404
on `npm install` signals that the project is incomplete, abandoned, or
internal-only — none of which are true.

### Agents cannot follow setup instructions

The distribution model described in CLAUDE.md states that organizations install
products in their own environments and coding agents drive the CLIs. An agent
reading the Guide SKILL.md or website documentation has no way to install Guide
programmatically. The `fit-guide` binary referenced in documentation is
unreachable without cloning the monorepo.

## What

Publish `@forwardimpact/guide` to npm so that `bun install @forwardimpact/guide`
succeeds and `bunx fit-guide` produces useful output.

### Current state

- `products/guide/package.json` defines `@forwardimpact/guide` at version 0.1.4
  with `"private": true`
- The package declares a `fit-guide` binary pointing to `./bin/fit-guide.js`
- Dependencies include `librpc`, `libconfig`, `libtelemetry`, `libtype`,
  `libstorage`, `librepl`, and `libutil` — all gRPC service infrastructure
- Guide requires running backend services (agent, llm, memory, graph, vector,
  tool, trace, web) to function fully
- Map and Pathway are already published and work as standalone npm installs

### The packaging problem

Guide is architecturally different from Map and Pathway. Those products are
self-contained: Map validates YAML files locally, Pathway derives and formats
job definitions from data files. Guide requires a service stack — it is a client
that connects to gRPC services for LLM orchestration, memory, knowledge graphs,
and vector search.

This means the packaging decision is not simply "remove `private: true`." The
package must be useful to someone who installs it, even if the full service
stack is not running.

### Options

**Option A: Helpful meta-package.** Publish a lightweight package that:

- Depends on `@forwardimpact/pathway` and `@forwardimpact/map`
- Provides a `fit-guide` binary that checks for service availability
- When services are not running, prints clear setup instructions: what services
  are needed, how to start them, and links to documentation
- When services are available, delegates to the full Guide functionality

This gives engineers a working install, a helpful CLI, and a clear path forward.
The package is small and its dependencies are already published.

**Option B: Full product publish.** Remove `"private": true` and publish the
existing Guide package as-is. This requires that all seven library dependencies
are published and that the package is functional (or at least fails gracefully)
without the service stack. The `fit-guide` binary would need error handling for
missing services.

**Option C: Documentation stub.** Publish a minimal package whose sole purpose
is to prevent the 404. The `fit-guide` binary prints a message explaining that
Guide requires the monorepo service stack, links to the documentation, and
exits. No real functionality — just a signpost.

### Package metadata

Regardless of which option is chosen, the published package should include:

- **name**: `@forwardimpact/guide`
- **description**: Clear description matching the product page ("How do I find
  my bearing?")
- **keywords**: Terms that make the package discoverable via npm search
  (engineering framework, career development, AI agent, skill assessment)
- **README**: Explains what Guide is, what it requires, and how to get started
- **bin**: `fit-guide` binary that produces useful output
- **repository**, **homepage**, **bugs**: Links to the monorepo and website

## Out of Scope

- Making the full Guide service stack installable via npm (that would require
  containerization or a managed service — a much larger effort)
- Changes to Guide's internal architecture or service dependencies
- Changes to the website product page or documentation content (addressed by
  spec 170)
- Publishing any library packages not already on npm (those have their own
  release process)

## Success Criteria

1. `bun install @forwardimpact/guide` succeeds — the package resolves on npm
   without errors.

2. `bunx fit-guide` produces helpful output — either setup instructions
   explaining what is needed, or actual functionality if services are available.

3. `bunx fit-guide --help` shows available commands and options.

4. The package README clearly explains what Guide is, what infrastructure it
   requires, and how to proceed from installation to a working setup.

5. The package appears in npm search results for relevant terms (engineering
   framework, career development, AI agent).

6. The spec 220 test (test-guide-product-setup) can progress past the install
   step — `bun install @forwardimpact/guide` no longer returns a 404.
