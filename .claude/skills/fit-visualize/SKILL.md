---
name: fit-visualize
description: >
  Query recorded traces with JMESPath and render them as Mermaid sequence
  diagrams. Use when you need to read back spans from the trace index, filter by
  trace or resource id, and see the call flow without wiring up a tracing UI.
---

# Visualize Recorded Traces

`fit-visualize` reads spans from the trace index, filters them with a JMESPath
expression piped on stdin, and prints a Mermaid sequence diagram you can paste
into any Markdown renderer. Use it to see what a service did after traces are
flowing.

## When to Use

- Render every span as a diagram — `echo "[]" | npx fit-visualize`
- Filter spans by name — `echo "[?name=='ProcessStream']" | npx fit-visualize`
- Scope to one trace or resource — `--trace <id>` / `--resource <id>`

## Usage

```sh
# All spans, as a Mermaid sequence diagram
echo "[]" | npx fit-visualize

# Filter by span name
echo "[?name=='ProcessStream']" | npx fit-visualize

# Scope to a single trace
echo "[]" | npx fit-visualize --trace 0f53069dbc62d

# Filter by gRPC kind and scope to a resource
echo "[?kind==\`2\`]" | npx fit-visualize --resource common.Conversation.abc123
```

The JMESPath expression is read from stdin and applied to the spans before
rendering. `--trace` and `--resource` narrow the set first. Output is a fenced
`mermaid` block, ready to paste into Markdown.

The trace index is read from the `traces` storage location. Record spans first —
see the guide below.

## Documentation

- [Add Observability](https://www.forwardimpact.team/docs/libraries/service-lifecycle/add-observability/index.md)
  — Structured logs and traces with no framework setup, including querying and
  visualizing recorded traces with `fit-visualize`.
- [Manage Service Lifecycle from One Interface](https://www.forwardimpact.team/docs/libraries/service-lifecycle/index.md)
  — The full lifecycle setup for services, from supervision to observability.
