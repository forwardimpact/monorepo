# Spec 1480 — libstorage put guarantees write-tmp + rename atomicity

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Platform Builders | [Build Agent-Capable Systems](../../JTBD.md#platform-builders-build-agent-capable-systems) | `libstorage` is the shared storage primitive consumed by `libindex`, `services/bridge`, and any future agent-capable system that needs a persistent key→value contract. One consumer (`libindex.compact()`) already documents in JSDoc that the call is "atomic file-replace via storage.put"; a service consumer (`services/bridge`) carries an inline comment noting it would need to wrap the call in a tmp-file + atomic rename to survive multi-instance. The contract callers read and the runtime they get diverge today, and each new consumer either re-discovers the gap or trusts the doc string and inherits the silent-corruption risk. |
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The bridge's `pendingDispatches` index is the durable record of which agent runs were dispatched to which surfaces. A crash mid-`compact()` today can leave the index file half-written, and a subsequent service restart loads a corrupted or truncated JSONL file as the source of truth. The shape — silent loss or partial state — is the exact failure mode the agent team relies on the platform to absorb. |

## Problem

`LocalStorage.put` writes the serialized payload directly over the target
key with a single `writeFile` call:

```js
// libraries/libstorage/src/local.js:58
await this.#fs.writeFile(fullPath, serializedData);
```

A crash, process kill, or system failure between the file being truncated
and the write completing leaves the target file in an indeterminate state
— shorter than the prior value and shorter than the new value. The next
process to call `get(key)` reads that intermediate state and parses it as
if it were the authoritative record.

The shape lands in two places today:

| Caller | Documented contract assumption | Today's runtime |
|---|---|---|
| `libraries/libindex/src/base.js:215-228` `compact()` JSDoc declares: "Uses `storage.put` (atomic file-replace) so a process restart cannot observe a half-written index." | The contract reads as a structural guarantee. | The guarantee is not provided by the library. A restart between `writeFile` opening the target for truncation and completing the write observes a half-written index. |
| `services/bridge/index.js:234-239` inline comment on the `compact()` call notes that compaction safety relies on single-instance + event-loop serialisation, and that a multi-instance future would "replace these with a tmp-file + atomic rename inside libstorage". | Single-instance + serialisation removes the concurrent-writer concern, but not the partial-write-on-crash concern. | A crash during `compact()` from a single-instance bridge can still corrupt the index. The service-side comment names the exact remediation this spec adopts and notes that it belongs in libstorage. |

Recovery today is by hand or by ad-hoc startup repair logic in each
consumer. Each consumer that grows around the gap pays the same cost.

### Why not patch each caller

The accompanying SE handoff surfaced two directions:

- **(a) Each consumer wraps `put` in its own atomic-write shape.**
- **(b) `LocalStorage.put` itself becomes the same-target atomic file-replace
  the docstring already advertises.**

This spec commits to **(b)**; the comparison table lives in § Decisions.

## Scope

### In scope

| Component | What changes |
|---|---|
| `LocalStorage.put` on the local backend. | The call becomes a same-target atomic file-replace: a process or system crash at any point in the call leaves the target file readable at exactly one of {prior value, new value} — never at a half-written intermediate state. On any failure, the target is left at whatever value preceded the call and the call surfaces the error. The directory-creation precondition is preserved. |
| Documented contract surfaces that today describe the guarantee aspirationally — `libindex.compact()` JSDoc, the `services/bridge` inline workaround comment, the `StorageInterface` contract in `libraries/libstorage/src/index.js`, and the libstorage README. | The contract surfaces are updated so the documented guarantee matches the runtime guarantee and a future reader can trace the contract to this spec. Surfaces that today describe a deferred workaround (e.g. the bridge's "would need a tmp-file + atomic rename inside libstorage" note) no longer carry that deferral. |

### Out of scope

- **Atomicity of `append()`** on the local backend. `append` is a different
  shape (open-for-append, not truncate-then-write) and its consumers
  reason about partial-line failures differently. A separate spec can
  revisit append durability if a consumer surfaces a gap.
- **Concurrent-writer correctness across processes.** A POSIX rename is
  atomic, but two processes racing on the same key still produce a
  last-writer-wins outcome. That is the same shape as today; this spec
  does not introduce locking.
- **S3 and Supabase backends.** Their service-provided semantics already
  match the guarantee this spec adopts on the local backend; their `put`
  implementations are not changed.
- **Retroactive recovery of any half-written files** currently on disk in
  consumer data directories. Existing artefacts are recovered ad-hoc by
  the owning service or agent; this spec prevents new ones.
- **Cross-filesystem rename semantics.** The spec assumes the tmp sibling
  is in the same directory as the target, which the directory-prefixed
  `path(key)` shape already guarantees. Callers that pass absolute paths
  outside the storage prefix inherit the same constraint they have today.
- **Refactoring the consumer call sites** beyond removing now-stale
  workaround comments / docstrings. Consumer behaviour is unchanged; only
  the guarantee they read from the library catches up to the contract
  they already wrote against.

## Decisions

**(b) atomic-in-libstorage chosen over (a) per-consumer wrapping.**

| Concern | (b) Atomic in libstorage | (a) Per-consumer wrapping |
|---|---|---|
| Closes the gap between the contract `libindex.compact()` documents today and the runtime it gets | Yes — the docstring becomes accurate by construction. | No — the docstring remains aspirational unless every consumer also wraps the call. |
| Repeats across consumers | The plumbing lives once. | Every new consumer re-implements its own atomic-write shape and crash-window reasoning. |
| Consistency across storage backends | Local storage matches the semantics S3 and Supabase callers already get from those services. | Each caller decides whether to wrap, and the cross-backend shape drifts. |
| Reviewable surface | Narrow — one method, one contract change. | Wider — each consumer's wrapper is its own review. |

(a) is what `services/bridge` already gestures at in its inline comment;
the SE handoff confirms `libstorage` is the right home.

**`libindex.compact()` docstring becomes accurate, not removed.** The
consumer's existing wording is the desired contract; this spec aligns the
runtime to it.

**Concurrent-`put`-on-same-key invariant — left to the plan.** Two
concurrent `put` calls on the same key within the same process must each
leave the target file at exactly one of the calls' input values. Today's
last-writer-wins outcome is preserved; the plan picks any shape that
upholds the no-half-written-file invariant in § Success Criteria.

## Success Criteria

| Claim | Verification |
|---|---|
| For every prefix of a `LocalStorage.put(key, newValue)` call interrupted by process termination, a fresh process reads `key` as exactly one of {prior value, new value} — never an intermediate state. | Drive a fixture that terminates the `put` at every reachable point in its execution and, in a fresh process, calls `get(key)`; observe the returned value equals either the prior content or the new serialized form, byte-for-byte. The fixture covers both an existing prior value and a previously-absent key. |
| A `LocalStorage.put` call that fails surfaces the error and leaves the target at its prior content. | Drive `put` against a fixture where the persistent-state update is forced to fail; observe the call's promise rejects, the file at `key`'s path is byte-equal to its prior content, and a subsequent `get(key)` returns the prior value without error. |
| A concurrent `get(key)` during a `LocalStorage.put(key, newValue)` observes exactly one of {prior value, new value} — never a partial form. | Drive a fixture that interleaves `put(key, newValue)` and `get(key)` calls; observe every `get` response equals either the prior or the new serialized form. |
| `libindex.compact()` survives a process restart at any point during the call. | Drive `compact()` against a fixture that injects a fault at each point in the underlying `put`'s execution, then restart the index; observe the loaded record set equals either the pre-compact persisted state or the post-compact state, valid JSONL is returned by `get` on the index key, and a follow-up `compact()` completes cleanly. |
| No orphan intermediate artefacts from a failed `put` are observable to subsequent `LocalStorage` calls or to the consumer's listing surface. | Drive `put` against a fixture where the call fails partway, then drive `list()` / `findByPrefix(prefix)` against the same backend; observe the listing equals the listing before the failed call. |
| The contract surfaces in scope (`libindex.compact()` JSDoc, the libstorage `StorageInterface` doc, the libstorage README, and the `services/bridge` inline comment) describe the runtime guarantee this spec adopts. | Read each surface; observe the documented guarantee matches the runtime guarantee, the bridge comment no longer carries a deferred-workaround clause, and a future reader can trace the contract to this spec. |

— Product Manager 🌱
