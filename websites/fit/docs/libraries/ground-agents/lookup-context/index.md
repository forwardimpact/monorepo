---
title: Look Up Context Fast
description: Retrieve exactly the context you need from a JSONL-backed index — prefix, limit, and token-budget filters without loading everything into memory.
---

You need to find resources in a growing index -- not by semantic similarity or
graph traversal, but by structural properties like type prefix or identifier
pattern. Loading the entire dataset into your application is wasteful when you
only need a filtered subset. `@forwardimpact/libindex` provides a JSONL-backed
index with lazy loading and built-in filters that keep memory use proportional
to results, not to corpus size.

For the full workflow of building a grounded context pipeline, see
[Ground Agents in Context](/docs/libraries/ground-agents/).

## Prerequisites

- Node.js 22+
- `@forwardimpact/libindex` installed:

```sh
npm install @forwardimpact/libindex
```

## Create an index

An `IndexBase` instance needs a storage backend and an optional index key
(defaults to `index.jsonl`):

```js
import { IndexBase } from "@forwardimpact/libindex";
import { createStorage } from "@forwardimpact/libstorage";

const storage = createStorage("my-index");
const index = new IndexBase(storage);
```

The index file does not need to exist yet. On first access, `IndexBase` checks
for the file and initializes an empty in-memory map if the file is missing.

## Add items

Each item requires an `id` string and an `identifier` object. The `id` is the
map key; the `identifier` carries the typed resource metadata:

```js
import { resource } from "@forwardimpact/libtype";

const identifier = new resource.Identifier({
  type: "common.Message",
  name: "a1b2c3",
  parent: "",
});
identifier.tokens = 42;

await index.add({
  id: String(identifier),
  identifier,
});
```

Each `add` call appends one JSON line to the storage file and updates the
in-memory map. The index is immediately queryable after the write.

## Query with filters

The `queryItems` method scans the in-memory index and applies three filters in
sequence: prefix, limit, and token budget.

### Filter by prefix

Return only identifiers whose string representation starts with a given prefix:

```js
const messages = await index.queryItems({ prefix: "common.Message" });
console.log(messages.length);
```

```text
12
```

### Limit the result count

Cap the number of returned identifiers:

```js
const first5 = await index.queryItems({ prefix: "common.Message", limit: 5 });
console.log(first5.length);
```

```text
5
```

### Cap by token budget

When the downstream consumer has a context window to respect, use `max_tokens`
to stop accumulating results once the total token count exceeds the budget.
Every identifier must carry a `tokens` field -- the filter throws if one is
missing:

```js
const budgeted = await index.queryItems({
  prefix: "common.Message",
  max_tokens: 200,
});

const totalTokens = budgeted.reduce((sum, id) => sum + id.tokens, 0);
console.log(`${budgeted.length} items, ${totalTokens} tokens`);
```

```text
4 items, 187 tokens
```

The filter walks items in index order, adding each identifier's token count
until the next item would exceed the budget. It does not optimize for the
maximum number of items -- it preserves insertion order.

### Combine filters

All three filters compose. The index applies them in order: prefix first, then
limit, then token budget:

```js
const results = await index.queryItems({
  prefix: "common.Message",
  limit: 10,
  max_tokens: 500,
});
```

This returns at most 10 `common.Message` identifiers, stopping earlier if the
cumulative token count reaches 500.

## Check existence and retrieve by ID

Use `has` to check whether an item exists without loading its content, and
`get` to retrieve identifiers by their IDs:

```js
const exists = await index.has("common.Message.a1b2c3");
console.log(exists);  // true

const found = await index.get(["common.Message.a1b2c3", "common.Message.d4e5f6"]);
console.log(found.length);  // 2
```

Missing IDs are silently skipped -- the result array may be shorter than the
input.

## Use buffered writes for high volume

When adding many items in a tight loop, the default `IndexBase` writes one
JSON line per `add` call. `BufferedIndex` batches writes and flushes
periodically or when the buffer fills:

```js
import { BufferedIndex } from "@forwardimpact/libindex";
import { createStorage } from "@forwardimpact/libstorage";
import { createDefaultClock } from "@forwardimpact/libutil/runtime";

const storage = createStorage("bulk-index");
const index = new BufferedIndex(
  storage,
  "index.jsonl",
  {
    flush_interval: 5000,   // flush every 5 seconds
    max_buffer_size: 1000,  // or when 1000 items accumulate
  },
  { clock: createDefaultClock() },
);

for (const item of largeDataset) {
  await index.add(item);  // buffered, not written yet
}

await index.shutdown();   // flush remaining items and clear timer
```

`BufferedIndex` requires a `clock` so the flush timer can be injected and
controlled in tests; `createDefaultClock()` supplies one backed by real timers.
The third argument is the buffer config -- `flush_interval` (default `5000` ms)
sets how long the index waits before draining a partial buffer, and
`max_buffer_size` (default `1000`) forces an immediate flush once that many
items accumulate.

Items are queryable immediately after `add` -- they enter the in-memory map at
once -- but the storage write is deferred until the next flush. Always call
`shutdown()` before the process exits to avoid losing buffered data.

Both `IndexBase` and `BufferedIndex` defer loading until the first read. If the
storage file does not exist, the index initializes empty rather than throwing.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../query-graph -->

</div>
