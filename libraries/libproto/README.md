# @forwardimpact/libproto

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Shared protobuf schemas — one editable source for the service contracts every
product imports.

<!-- END:description -->

## Purpose

`libproto` carries the canonical `.proto` files that more than one published
package needs to read:

- `proto/tool.proto` — tool-call message types (`ToolFunction`, `ToolCall`,
  `ToolCallResult`, `ToolCallMessage`, `QueryFilter`).
- `proto/common.proto` — shared message types (`Empty`, `Usage`, `Message`,
  `Choice`, `Embedding`, `Embeddings`, `Conversation`). Imports `tool.proto`
  and `resource.proto`.
- `proto/resource.proto` — the `resource.Identifier` referenced by tool calls
  and conversation messages.

A consumer declares `@forwardimpact/libproto` as a direct runtime dependency
if and only if the consumer itself ships a `.proto` that imports a shared
file. Today that means the four service packages `@forwardimpact/svcgraph`,
`@forwardimpact/svcmap`, `@forwardimpact/svcvector`, and
`@forwardimpact/svcpathway`.

## How consumers read the schemas

There is no JavaScript export surface — `import "@forwardimpact/libproto"`
yields an empty namespace object on purpose. Consumers reach the schemas via
codegen: `npx fit-codegen generate --all` scans
`node_modules/@forwardimpact/*/proto/` for `.proto` files at install time and
treats every directory it finds as an include path.

## Files

- `proto/tool.proto`
- `proto/common.proto`
- `proto/resource.proto`
- `src/index.js` — empty ESM module so `main` resolution stays clean across
  Node and bun.
