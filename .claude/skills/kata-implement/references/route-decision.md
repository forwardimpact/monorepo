# Route-Decision Context

A boot-routed `kata-implement` activation takes one of a closed set of
routes. Each metric row for `implementations_shipped` carries the route it
took. The row also carries the routes that were eligible-but-not-taken. With
that context a reader partitions the zero-row population into two classes. An
attempt-zero means an implementation route fired and produced no PR. A
route-conservation-zero means an implementation route was eligible and the
routing predicate chose another route.

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

Record the row through the metrics-recording CLI. Pass the route context as
typed flags. Never hand-write the CSV:

```text
gemba-xmr record --skill kata-implement --metric implementations_shipped \
  --value <n> --route <id> --routes-eligible <comma-separated-ids>
```

The CLI writes the route context as a machine-readable prefix on the row's
note (`route_taken=<id>; routes_eligible=[<ids>];`). The CLI rejects a missing
or unknown route. A downstream reader partitions the population with
`gemba-xmr analyze … --route <id>` or `--routes-eligible-includes <id>`.

The route set is closed. A new route is a deliberate change. A check compares
the id → route table above with the recorder's source declaration. The two
cannot drift.
