# libutil

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Cross-cutting utilities: retry, hashing, token counting, and project discovery.

<!-- END:description -->

## Getting Started

```js
import { countTokens, Finder, createRetry } from '@forwardimpact/libutil';
```

## Internal CLIs

`fit-tiktoken` counts tokens. It is an internal helper CLI. It is not an
agent-facing tool. It deliberately ships no skill and no user guide. Code
consumes the token-count capability through `countTokens`.

The reusable `createBundleDownloader` helper stays exported here.
`fit-codegen download` now consumes it. That CLI fetches a generated-code bundle
from remote storage. The `execLine` exec helper also remains exported.
