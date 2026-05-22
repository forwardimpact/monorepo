# libbridge

Channel-agnostic primitives shared by `services/ghbridge` and `services/msbridge`.

## Invariants

- **No channel SDKs.** Never import `botbuilder`, `@octokit/*`, or any other
  channel-specific SDK from this package. Channel adapters own the SDKs.
- **No GraphQL or REST strings.** Never compose `addDiscussionComment` or
  `addReaction` mutations, or any channel-specific URL beyond
  `https://api.github.com/repos/${repo}/actions/workflows/...` (the workflow
  dispatch endpoint, which is GitHub-Actions-shaped not channel-shaped).
- **Caller-injected storage.** `DiscussionContextStore` takes a
  `StorageInterface` from the host service — no implicit `LocalStorage`
  construction inside this package.
- **Caller-injected clock.** `evaluateTrigger(trigger, observed, now)` takes
  `now` as a parameter; never call `Date.now()` from trigger evaluation.
