---
title: Build Tarball and Git-Repo Packs
description: Build distributable packs in three formats — a flat tarball, an APM tarball, and a static bare git repo — from one set of skill and agent combinations, with byte-identical output across runs.
---

`fit-pack stage` writes a single pack into a checked-out repository's working
tree. When you instead want to produce distributable **artifacts** — tarballs
to attach to a release, or a static git repository a package manager can clone
over plain HTTP — `@forwardimpact/libpack` builds them programmatically with
`PackBuilder`. One call takes a list of pack combinations and emits every
format at once, deterministically: an unchanged input produces a byte-identical
output, so artifacts are reproducible and safe to cache.

This guide covers building the tarball and bare-git-repo formats. For the
discovery-index format that lets agents find skills over the web, see
[Publish a Skill Discovery Index](/docs/libraries/distribute-skill-packs/discovery-index/).
For the single-repository working-tree path, see
[Distribute Skill Packs](/docs/libraries/distribute-skill-packs/).

## Prerequisites

- Node.js 22+
- `git`, `tar`, and `gzip` on the path — `PackBuilder` shells out to all three
  to produce the git repo and the compressed tarballs.
- Pack **combinations** prepared in memory: each is a `{ name, description,
  content }` object, where `content` holds the skills, agents, and shared files
  to stage. You assemble these from your own source — `PackBuilder` consumes
  them; it does not read a source directory itself.

## What it builds

`PackBuilder.build()` writes three output trees under the directory you give it,
one entry per combination:

```text
<out>/
  packs/
    raw/<name>.tar.gz      # the full pack, flat layout, gzipped
    apm/<name>.tar.gz      # the same pack in APM's .apm/ layout, gzipped
    apm/<name>/            # a static bare git repository of the APM layout
    skills/<name>/         # the discovery index (see the discovery-index guide)
```

The two tarballs differ only in layout. `packs/raw/<name>.tar.gz` carries the
pack in its full directory shape; `packs/apm/<name>.tar.gz` carries the same
content rearranged into the `.apm/skills/` and `.apm/agents/` convention a
package manager reads. Ship the raw tarball when a consumer wants the files as
authored; ship the APM tarball when they install through APM but prefer a
downloaded archive over a clone.

`packs/apm/<name>/` is a **static bare git repository** — not a working tree, but
the `objects/` and `refs/` of a repository with a single tagged commit. Serve it
over plain HTTP and a consumer can `git clone` it, or `apm install` it, without
you running a git server.

## Build the packs

Compose `PackBuilder` from the stager and the three emitters, then call
`build()` with your combinations:

```js
import {
  PackBuilder,
  PackStager,
  TarEmitter,
  GitEmitter,
  DiscEmitter,
} from "@forwardimpact/libpack";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

const runtime = createDefaultRuntime();

const builder = new PackBuilder({
  runtime,
  stager: new PackStager({ runtime }),
  emitters: {
    tar: new TarEmitter({ runtime }),
    git: new GitEmitter({ runtime }),
    disc: new DiscEmitter({ runtime }),
  },
});

const { packs } = await builder.build({
  combinations,
  outputDir: "./dist",
  version: "1.2.3",
});
```

`build()` returns `{ packs }` — the name and description of each pack it wrote,
so you can list what was produced or feed it into release notes.

## Why the output is deterministic

A pack you build twice from the same input is byte-identical, which is what makes
the artifacts cacheable and a re-release a real diff rather than churn. Two
mechanisms enforce it:

- **Reset timestamps.** Before archiving, every file's modification time is set
  to the Unix epoch, so the tarball's headers do not carry the wall-clock time of
  the build.
- **Sorted entries and stable git identity.** Files are archived in sorted order,
  and the git repository's commit uses a fixed author, committer, and date. The
  commit hash therefore depends only on the content, not on when or where you
  built it.

`gzip -n` is used so the compressed stream omits the original filename and
timestamp, keeping even the `.tar.gz` byte-stable.

## Serve the git repo over HTTP

The bare repository under `packs/apm/<name>/` is laid out for **dumb HTTP**
serving — a static file host is enough for a normal clone. Because dumb HTTP
cannot negotiate a shallow clone, `PackBuilder` also writes a small
`smart-http/` directory of pre-computed responses so that tools cloning with
`--depth=1` (APM does) still succeed against a static host. You route three
paths to those files:

| Request | Serve |
| ------- | ----- |
| `GET …/info/refs?service=git-upload-pack` | `smart-http/info-refs` |
| `POST …/git-upload-pack` (body has no `done`) | `smart-http/upload-pack-shallow` |
| `POST …/git-upload-pack` (body has `done`) | `smart-http/upload-pack-result` |

Any other path is served straight from the repository directory as a static
file. With those three routes in place, both a full clone and a shallow clone
work without a live git backend.

## Verify

You have reached the outcome of this guide when:

- `PackBuilder.build()` writes `packs/raw/<name>.tar.gz`,
  `packs/apm/<name>.tar.gz`, and `packs/apm/<name>/` for every combination.
- Re-running `build()` with the same combinations and version produces
  byte-identical tarballs.
- A `git clone` of `packs/apm/<name>/` — including `--depth=1` against a static
  host with the three `smart-http` routes — checks out the pack at the tagged
  version.

## What's next

<div class="grid">

<!-- part:card:.. -->

<!-- part:card:../discovery-index -->

</div>
