# libstorage

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Pluggable file storage — local, S3, or Supabase behind a single interface.

<!-- END:description -->

## Getting Started

```js
import { createStorage } from '@forwardimpact/libstorage';

const storage = createStorage('mybucket');
await storage.put('key.json', { hello: 'world' });
const data = await storage.get('key.json');
```

## `fit-storage` is an internal operator CLI

The library's published surface is the `createStorage` factory and the
`StorageInterface` it returns. The `fit-storage` CLI (`upload`, `download`,
`list`, `create-bucket`, `wait`) is an **internal deployment tool** that syncs a
local `data/` directory to and from a remote bucket. It has no launcher package.
It is not a public `npx fit-*` CLI. The three-artifact linking rule
(`libraries/CLAUDE.md` § CLIs and progressive documentation) does not apply to
it. It deliberately has no `SKILL.md` and no `documentation` array. The
[Ground Agents in Context](https://www.forwardimpact.team/docs/libraries/ground-agents/index.md)
guide documents the library as the persistence substrate.

## Atomicity

`put(key, data)` is a same-target atomic file-replace on the local backend.
If the process stops at any point during the call, the target file keeps
either its prior content or the new content. It never keeps an intermediate
prefix. The mechanism is a same-directory tmp sibling plus POSIX
`rename(2)`. See `LocalStorage.put` in `src/local.js`. The S3 and Supabase
backends inherit the same shape from their service `PutObject` semantics.

**Reserved infix:** `.libstorage-tmp.` — consumers must not produce keys
that contain this literal. The local backend uses
`<target>.libstorage-tmp.<nonce>` as the per-call tmp sibling. `list`,
`findByPrefix`, and `findByExtension` filter the sentinel out of their results.
A tmp survivor from a killed process stays invisible to in-process consumers.

Covered:

- Same-target atomicity for `LocalStorage.put` (POSIX `rename(2)`).
- Concurrent same-key `put` calls — each call uses a unique tmp. The last
  rename wins. This matches the prior last-writer-wins outcome.
- The in-process list functions exclude tmp survivors (no consumer needs to
  know about the sentinel).

Not covered:

- `fsync` durability — the kernel acknowledges the rename before the page
  cache flushes. A power loss in that window can still lose the write.
- Cross-process concurrent-writer correctness — two processes that race on
  the same key still produce a last-writer-wins outcome.
- Operator-owned disk reclamation of orphan tmp files left by a process
  kill mid-`put` — the filter hides them from the API. The on-disk bytes
  remain until the owning operator removes them.
