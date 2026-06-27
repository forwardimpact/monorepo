# libtelemetry

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Structured logging and trace spans — observable operations so problems surface
before they escalate.

<!-- END:description -->

## Getting Started

```js
import { createLogger, createObserver } from '@forwardimpact/libtelemetry';

const logger = createLogger('myservice');
```

## Trace visualization

`fit-visualize` reads recorded spans from the trace index and renders them as
Mermaid sequence diagrams. Pipe a [JMESPath](https://jmespath.org/) expression
on stdin to select spans; scope with `--trace` or `--resource`:

```sh
echo "[?name=='ProcessStream']" | fit-visualize
echo "[]" | fit-visualize --trace 0f53069dbc62d
echo "[]" | fit-visualize --resource common.Conversation.abc123
```

The expression filters span fields (`name`, `kind`, attributes); the flags scope
the query to one trace or resource. With `--resource`, matching traces combine
into one diagram titled by resource ID; otherwise each trace renders separately.
When nothing matches, the command prints
`No spans found matching the filter criteria.`

## Documentation

- [Add Observability](https://www.forwardimpact.team/docs/libraries/service-lifecycle/add-observability/index.md) — structured logs and traces with no framework setup, including querying and visualizing recorded traces with `fit-visualize`.
- [Manage Service Lifecycle from One Interface](https://www.forwardimpact.team/docs/libraries/service-lifecycle/index.md) — the full lifecycle setup for services, from supervision to observability.
