# libbridge

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Channel-to-agent-team bridge — relay messages between human channels (GitHub
Discussions, Microsoft Teams) and the agent team, with thread state,
multi-tenant routing, rate limits, and resume scheduling handled once.

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
