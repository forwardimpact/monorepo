# libutil

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Cross-cutting utilities: retry, hashing, token counting, and project discovery.

<!-- END:description -->

## Getting Started

```js
import { countTokens, Finder, createRetry } from '@forwardimpact/libutil';
```

## Internal CLIs

`fit-tiktoken` (token counting) and `fit-download-bundle` (fetch a generated-code
bundle from remote storage) are internal helper CLIs. They are not agent-facing
tools and intentionally ship no skill or user guide; the token-counting
capability is consumed programmatically via `countTokens`.
