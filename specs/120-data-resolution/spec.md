# 120: Unified Data Path Resolution

## Problem

Three CLI products need to resolve a data directory:

- **fit-pathway** has a 7-step resolution function with a product-specific env
  var (`PATHWAY_DATA`), home directory check (`~/.fit/pathway/data`), and
  multiple CWD fallbacks including `examples/` directories.
- **fit-map** has a 4-candidate discovery function with no env var or home
  directory support.
- **fit-guide** resolves data indirectly through `libstorage` (which uses
  `Finder.findUpward` internally), but cannot resolve the pathway data
  directory for loading framework YAML files directly without the service
  infrastructure running.

Each product reimplements resolution with different priority orders, different
env vars, and different fallback candidates. There is no way for a user to set
the data directory once and have it apply to all `fit-*` commands.

A secondary problem: `fit-universe` generates synthetic data into `examples/`
while the running application reads from `data/`. This split forces fallback
logic in every CLI to check both locations and a copy step in `make data-init`.

## Goal

1. Extend the existing `Finder` class in libutil with a `findData` method that
   every `fit-*` CLI uses to resolve the base data directory, with a consistent
   resolution order.
2. Change `fit-universe` to generate directly into `data/` so there is one
   canonical data location.

## Resolution Order

1. **CLI flag** (`--data=<path>`) — explicit override, handled by callers
2. **Upward traversal** from CWD — `findUpward` looking for `data/`
3. **HOME fallback** (`~/.fit/data/`) — user-global installation

The method returns the **base** data path (e.g. `data/`). Each product appends
its own subdirectory (e.g. `pathway/`).

Upward traversal walks up to 3 parent directories. This is a behavioral change
from the old CWD-only checks — running `fit-pathway` from `products/pathway/`
will now find `data/` at the monorepo root. This is intentional: it matches how
`libstorage` already resolves paths via `Finder.findUpward` and allows CLIs to
work from any subdirectory within the monorepo.

## What Changes

| Before | After |
|--------|-------|
| `PATHWAY_DATA` env var (pathway only) | Dropped — clean break, no replacement |
| `~/.fit/pathway/data` home path | `~/.fit/data/` (products append suffix) |
| `examples/pathway/`, `examples/` fallbacks | Dropped — `fit-universe` writes to `data/` |
| `fit-universe` outputs to `examples/` | Outputs to `data/` |
| `make data-init` copies examples → data | No copy step needed |
| fit-map: no home fallback | Full resolution via Finder |
| fit-guide: indirect via libstorage only | Direct resolution via Finder for framework data |
| Three bespoke implementations | One method on Finder |

## Why

- **Consistency** — one resolution order across all products.
- **One data location** — `data/` is the single source, not `examples/` with
  fallbacks and copy steps.
- **Reuse** — Finder already handles upward path traversal for libstorage;
  data path resolution is the same pattern with a HOME fallback.
- **fit-guide needs it** — currently cannot load framework YAML files without
  service infrastructure running.
- **Fewer bugs** — one implementation to maintain instead of three diverging
  copies.

## Migration

- **`PATHWAY_DATA` env var**: Removed without replacement. Users who set this
  in `.bashrc` or CI must switch to `--data=<path>` or place data in `data/`
  or `~/.fit/data/`. No deprecation shim — clean break.
- **`examples/` as output**: `fit-universe` writes to `data/` instead. The
  `examples/universe.dsl` input file stays where it is. Existing `examples/`
  output directories become stale and should be removed after migration.
- **`make data-init` copy step**: The `examples/organizational/ → data/knowledge/`
  copy is replaced by `fit-universe` writing directly to `data/knowledge/`.
