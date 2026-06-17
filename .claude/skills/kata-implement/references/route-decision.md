# Route-Decision Context

A `kata-implement` activation, when boot-routed, takes one of a closed set
of routes. Each metric row recorded for `implementations_shipped` carries
the route it took and the routes that were eligible-but-not-taken, so the
zero-row population can be partitioned into attempt-zeros (an
implementation route fired and produced no PR) and route-conservation-zeros
(an implementation route was eligible and the routing predicate chose
another route).

## Routes

| id | route |
| --- | --- |
| 1 | design self-pick |
| 2 | plan-draft |
| 3 | plan-approved-no-impl |
| 4 | fix fallback |

`route_taken=none` records an activation that fired no implementation route
(for example a facilitated meeting leg).

## Recording rule

Record the row through the metrics-recording CLI with the route context as
typed flags — never hand-write the CSV:

```
npx fit-xmr record --skill kata-implement --metric implementations_shipped \
  --value <n> --route <id> --routes-eligible <comma-separated-ids>
```

The CLI writes the route context as a machine-readable prefix on the row's
note (`route_taken=<id>; routes_eligible=[<ids>];`) and rejects a missing or
unknown route. A downstream reader partitions the population with
`npx fit-xmr analyze … --route <id>` or `--routes-eligible-includes <id>`.

The route set is closed; adding a route is a deliberate change. The id →
route table above is checked against the recorder's source declaration, so
the two cannot drift.
