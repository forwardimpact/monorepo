---
name: fit-visualize
description: >
  Query recorded OpenTelemetry spans with JMESPath and render them as Mermaid
  sequence diagrams. Use when you need to read spans back from the span index
  and filter by trace or resource id. Use when you want to see the call flow
  with no tracing UI.
---

# Visualize Recorded Spans

`fit-visualize` reads spans from the span index. It filters them with a
JMESPath expression piped on stdin. It prints a Mermaid sequence diagram you
can paste into any Markdown renderer. Use it to see what a service did once
spans flow.

## When to Use

- Render every span as a diagram — `npx fit-visualize "[]"`
- Filter spans by name — `echo "[?name=='ProcessStream']" | npx fit-visualize`
- Scope to one trace or resource — `--trace <id>` / `--resource <id>`

## Usage

```sh
# All spans, as a Mermaid sequence diagram (one-shot positional query)
npx fit-visualize "[]"

# Equivalent piped form
echo "[]" | npx fit-visualize

# Filter by span name
echo "[?name=='ProcessStream']" | npx fit-visualize

# Scope to a single trace
echo "[]" | npx fit-visualize --trace 0f53069dbc62d

# Filter by gRPC kind and scope to a resource
echo "[?kind==\`2\`]" | npx fit-visualize --resource common.Conversation.abc123
```

The JMESPath expression arrives as a one-shot positional argument or on stdin.
The two forms are equivalent. `fit-visualize` applies the expression to the
spans before it renders them. `--trace` and `--resource` narrow the set first.
The output is a fenced `mermaid` block, ready to paste into Markdown.

`fit-visualize` reads spans from the `spans` storage location. Record spans
first. See the guide below.

## Documentation

- [Add Observability](https://www.forwardimpact.team/docs/libraries/service-lifecycle/add-observability/index.md)
  — Structured logs and spans with no framework setup. It also covers how to
  query and visualize recorded spans with `fit-visualize`.
- [Manage Service Lifecycle from One Interface](https://www.forwardimpact.team/docs/libraries/service-lifecycle/index.md)
  — The full lifecycle setup for services, from supervision to observability.
