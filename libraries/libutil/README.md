# libutil

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Cross-cutting utilities: retry, hashing, token counting, and project discovery.

<!-- END:description -->

## Getting Started

```js
import { countTokens, Finder, createRetry } from '@forwardimpact/libutil';
```

## Internal CLIs

`fit-tiktoken` (token counting) is an internal helper CLI. It is not an
agent-facing tool and intentionally ships no skill or user guide; the
token-counting capability is consumed programmatically via `countTokens`.

The reusable bundle-fetch helpers (`createBundleDownloader`, `execLine`) stay
exported here; the CLI that fetches a generated-code bundle from remote storage
is now `fit-codegen download`.
