# Spec 300: npm User Experience

## Problem Statement

External users installing `@forwardimpact/guide` from npm have a poor first-time
experience. Multiple user testing sessions have surfaced the same friction
points:

### Evidence

Issues #179, #180, #181, #182, #183 all originated from first-time user
evaluation testing. The patterns are consistent:

1. **Documentation is scattered** (#179) — Users navigate 3+ pages to find
   installation instructions, with the main product page lacking technical
   details.

2. **Conflicting package manager guidance** (#183) — Website docs use
   `npm install`, package README uses `bun install`, and `package.json`
   specifies `"engines": { "bun": ">=1.2.0" }`. Users don't know which is
   correct.

3. **CLI fails without service dependencies** (#180) — Even `--help` and
   `--version` fail when dependencies are missing, because ES module imports are
   hoisted. Users can't troubleshoot setup issues using the CLI itself.

4. **npm vs monorepo paths unclear** (#181) — Users following website docs
   expect `npm install` to work, but the package README suggests cloning the
   monorepo. No clear guidance on which path is supported.

5. **Packaging errors not caught before publish** (#182) — The broken
   `generated/` directory (issue #178) reached npm because there's no smoke test
   that validates published packages work outside the monorepo.

### User Impact

- **Time to first value**: Currently >30 minutes (should be <5 minutes)
- **Abandonment risk**: High — users hit errors before seeing any value
- **Support burden**: Issues describe the same friction repeatedly

## Scope

This spec covers the Guide product's npm user experience. Similar patterns may
exist in other products (Pathway, Map), but those are out of scope.

### In Scope

- Documentation improvements for Guide installation
- CLI changes to support `--help`/`--version` without dependencies
- Package manager support clarification (npm vs bun)
- CI smoke tests for npm packages
- npm vs workspace installation path documentation

### Out of Scope

- Service stack deployment automation (separate effort)
- Pathway/Map npm experience (separate specs)
- New features — this is about fixing the existing installation path

## Success Criteria

1. **Quick start works**: A user following the website docs can run
   `npx fit-guide --help` within 5 minutes of starting.

2. **Help without services**: `npx fit-guide --help` and
   `npx fit-guide --version` work without any service stack running or
   SERVICE_SECRET set.

3. **Clear package manager guidance**: Documentation states which package
   managers are supported and recommends one consistently.

4. **Single source of truth**: Installation instructions exist in one
   authoritative location, linked from other pages.

5. **CI catches packaging errors**: A smoke test validates that npm packages
   work in an isolated environment before marking publish as successful.

6. **Service stack requirement visible**: The requirement to run 8 microservices
   is prominently documented before users attempt installation.

## Non-Goals

- Making Guide work without the service stack (that's the product architecture)
- Docker/container-based deployment (future enhancement)
- Windows support (currently untested, out of scope)

## References

- Issue #178: Critical: @forwardimpact/librpc npm package missing generated/
  directory (fix PR #184)
- Issue #179: Documentation: Installation instructions unclear and scattered
- Issue #180: Enhancement: --help and --version should work without service
  dependencies
- Issue #181: Documentation: Clarify npm vs workspace install paths
- Issue #182: Testing: Add npm package smoke tests to CI/CD
- Issue #183: Documentation: Clarify package manager support (npm vs bun)
- Spec 230: pathway-init-npm (related npm experience work)
- Spec 240: guide-npm-package (Guide npm packaging)
