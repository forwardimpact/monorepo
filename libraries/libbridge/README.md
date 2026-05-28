# libbridge

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Threaded-channel bridge primitives — relay messages between human channels
(GitHub Discussions, Microsoft Teams) and the Kata agent team.

<!-- END:description -->

## Getting Started

```js
import {
  createBridgeServer,
  CallbackRegistry,
  RateLimiter,
  ProgressTicker,
  appendHistory,
  buildPrompt,
  dispatchWorkflow,
  evaluateTrigger,
} from "@forwardimpact/libbridge";
```
