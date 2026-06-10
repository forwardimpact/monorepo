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

## Atomicity

`put(key, data)` is a same-target atomic file-replace on the local backend:
a process termination at any point during the call leaves the target file
at either its prior content or the new content — never an intermediate
prefix. The mechanism is a same-directory tmp sibling plus POSIX
`rename(2)` — see `LocalStorage.put` in `src/local.js`. The S3 and Supabase
backends inherit the same shape from their service `PutObject` semantics.

**Reserved infix:** `.libstorage-tmp.` — consumers must not produce keys
containing this literal. The local backend uses `<target>.libstorage-tmp.<nonce>`
as the per-call tmp sibling and `list` / `findByPrefix` / `findByExtension`
filter the sentinel out of their results so a process-killed tmp survivor is
invisible to in-process consumers.

Covered:

- Same-target atomicity for `LocalStorage.put` (POSIX `rename(2)`).
- Concurrent same-key `put` calls — each uses a unique tmp; last rename
  wins, matching the prior last-writer-wins outcome.
- In-process listings exclude tmp survivors (no consumer needs to know
  about the sentinel).

Not covered:

- `fsync` durability — a power loss after the kernel acknowledged the
  rename but before the page cache flushed may still lose the write.
- Cross-process concurrent-writer correctness — two processes racing on
  the same key still produce a last-writer-wins outcome.
- Operator-owned disk reclamation of orphan tmp files left by a process
  kill mid-`put` — the filter hides them from the API; on-disk bytes
  remain until removed by the owning operator.
