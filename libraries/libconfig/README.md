# libconfig

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Environment-aware application settings — services and CLIs load configuration
without custom plumbing.

<!-- END:description -->

## Getting Started

```js
import { createConfig, createServiceConfig } from '@forwardimpact/libconfig';

const config = await createServiceConfig('myservice', { port: 3000 });
```

## Bootstrap

A product's `init` verb hands its starter material to `bootstrapProject`.
`bootstrapProject` writes `config/config.json` and `.env` under
namespace-scoped ownership semantics. Same-key-same-value writes are no-ops.
Same-key-different-value writes refuse without explicit overwrite intent. So
two products with disjoint top-level namespaces can converge against the same
target directory.

```js
import { bootstrapProject } from '@forwardimpact/libconfig';

await bootstrapProject({
  target,                              // absolute path; defaults to process.cwd()
  fragment: {                          // top-level keys are product-owned namespaces; {} or omitted is allowed
    product: {
      guide: { systemPrompt: '…' },    // fit-guide's slice under top-level `product`
    },
    service: {
      mcp:   { systemPrompt: '…' },    // fit-guide's slice under top-level `service`
    },
  },
  env: {                               // .env entries; {} or omitted is allowed
    SERVICE_SECRET: '…',
    MCP_TOKEN:      '…',
  },
  overwrites: {                        // explicit overwrite intent, partitioned per file
    config: ['product'],               // top-level namespace names (single segment)
    env:    ['MCP_TOKEN'],             // bare keys
  },
});
```

- **Entry point** — `bootstrapProject({ target, fragment, env, overwrites })`.
  It returns `void` on success. It throws a refusal `Error` whose `cause`
  carries `{ kind, path, overwriteSurface }`. It throws when a write
  conflicts and the caller did not signal overwrite intent.
- **Namespace declaration** — the top-level keys of `fragment` are the
  namespaces a product owns. Use the **nested form** (`{ product: { guide:
  … } }`). The libconfig reader resolves that shape. Every in-tree caller
  emits that shape. Cross-namespace writes (different top-level keys, or
  disjoint sub-keys under a shared top-level) never collide. Within a
  namespace, any leaf disagreement refuses with a leaf-path diagnostic.
- **Overwrite intent** — pass `overwrites.config: [topLevelKey]` (single-
  segment names) or `overwrites.env: [bareKey]` to opt in and replace a
  value that conflicts. The refusal message names both the leaf path that
  conflicts (e.g. `product.guide.systemPrompt`) and the surface. The
  overwrite-intent entry remains the **top-level** key (`product`). By
  design, when you forgive a single leaf you forgive the whole namespace.
  So pick the smallest top-level that contains the disputed leaf.
- **`.env` primitives** — `bootstrapProject` delegates per-key `.env`
  writes to `@forwardimpact/libsecret`'s `updateEnvFile`. `updateEnvFile`
  preserves comment lines, the trailing newline, and mode `0o600`.

`bootstrapProject` always materialises `target/config/config.json`. It writes
`{}` when the fragment is empty and the file is absent. A later reader then
anchors locally. It does not walk upward into an ancestor `config/`.
`bootstrapProject` creates `.env` only when you supply at least one entry. An
empty `env` against an `.env` that already exists is a no-op.
