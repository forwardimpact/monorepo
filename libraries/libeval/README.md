# libeval

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Agent evaluation framework — prove whether agent changes improved outcomes with
reproducible evidence.

<!-- END:description -->

## Getting Started

```js
import { createTraceCollector, createTraceQuery, createAgentRunner } from '@forwardimpact/libeval';
```

## Trace redaction

`fit-eval run`, `fit-eval supervise`, and `fit-eval facilitate` redact
secrets in trace artifacts before they reach disk. Two layers compose:

- **Env-var allowlist**, defaulting to `ANTHROPIC_API_KEY`, `GH_TOKEN`,
  `GITHUB_TOKEN`. The runtime values of these vars are replaced with
  `[REDACTED:env:NAME]` wherever they appear in tool inputs, tool
  outputs, assistant text, or orchestrator summaries. Override the list
  with `LIBEVAL_REDACTION_ENV_VARS=NAME1,NAME2,…` (replaces, not extends).
- **Credential-shape patterns**, covering Anthropic API keys (`sk-ant-`),
  GitHub PATs (`ghp_`), installation tokens (`ghs_`), OAuth tokens
  (`gho_`), and fine-grained PATs (`github_pat_`). Pattern hits become
  `[REDACTED:pattern:KIND]`.

Redaction is on by default. To disable, set `LIBEVAL_REDACTION_DISABLED=1`
— a stderr warning fires once per run. Never set this in CI on a public
repository: workflow artifacts there are downloadable through the
retention window.
