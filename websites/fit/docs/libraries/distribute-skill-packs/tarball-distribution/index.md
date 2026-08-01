---
title: Build Tarball and Git-Repo Packs
description: Build distributable packs in three formats from one set of skill and agent combinations. The formats are a flat tarball, an APM tarball, and a static bare git repo. Output is byte-identical across runs.
---

`fit-pack stage` writes a single pack into a checked-out repository's working
tree. You may instead want distributable **artifacts**. Examples are tarballs to
attach to a release, or a static git repository a package manager can clone over
plain HTTP. `@forwardimpact/libpack` builds them programmatically with
`PackBuilder`. One call takes a list of pack combinations and emits every format
at once. The build is deterministic. An unchanged input produces a
byte-identical output. So artifacts are reproducible and safe to cache.

This guide covers how to build the tarball and bare-git-repo formats. For the
discovery-index format that lets agents find skills over the web, see
[Publish a Skill Discovery Index](/docs/libraries/distribute-skill-packs/discovery-index/).
For the single-repository working-tree path, see
[Distribute Skill Packs](/docs/libraries/distribute-skill-packs/).

## Prerequisites

- Node.js 22+
- `git`, `tar`, and `gzip` on the path. `PackBuilder` shells out to all three
  to produce the git repo and the compressed tarballs.
- Pack **combinations** prepared in memory. Each is a
  `{ name, description, content }` object, where `content` holds the skills,
  agents, and shared files to stage. You assemble these from your own source.
  `PackBuilder` consumes them. It does not read a source directory itself.

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
pack in its full directory shape. `packs/apm/<name>.tar.gz` carries the same
content rearranged into the `.apm/skills/` and `.apm/agents/` convention a
package manager reads. Ship the raw tarball when a consumer wants the files as
authored. Ship the APM tarball when they install through APM but prefer a
downloaded archive over a clone.

`packs/apm/<name>/` is a **static bare git repository**. It is not a working
tree. It holds the `objects/` and `refs/` of a repository with a single tagged
commit. Serve it over plain HTTP. A consumer can then `git clone` it, or
`apm install` it, and you run no git server.

## Build the packs

Compose `PackBuilder` from the stager and the three emitters. Then call
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

`build()` returns `{ packs }`. It holds the name and description of each pack it
wrote. You can list what `build()` produced, or feed it into release notes.

## Why the output is deterministic

A pack you build twice from the same input is byte-identical. So the artifacts
are cacheable. A re-release shows a real diff. It does not show churn. Two
mechanisms enforce it:

- **Reset timestamps.** Before it archives the files, `PackBuilder` sets every
  file's modification time to the Unix epoch. So the tarball's headers do not
  carry the wall-clock time of the build.
- **Sorted entries and stable git identity.** `PackBuilder` archives files in
  sorted order, and the git repository's commit uses a fixed author, committer,
  and date. So the commit hash depends only on the content. It does not depend
  on when or where you built it.

`PackBuilder` uses `gzip -n`, so the compressed stream omits the original
filename and timestamp. That keeps even the `.tar.gz` byte-stable.

## Serve the git repo over HTTP

The bare repository under `packs/apm/<name>/` is laid out for **dumb HTTP**. A
static file host is enough for a normal clone. Dumb HTTP cannot negotiate a
shallow clone. So `PackBuilder` also writes a small `smart-http/` directory of
pre-computed responses. Tools that clone with `--depth=1` (APM does) then still
succeed against a static host. You route three paths to those files:

| Request | Serve |
| ------- | ----- |
| `GET …/info/refs?service=git-upload-pack` | `smart-http/info-refs` |
| `POST …/git-upload-pack` (body has no `done`) | `smart-http/upload-pack-shallow` |
| `POST …/git-upload-pack` (body has `done`) | `smart-http/upload-pack-result` |

Serve any other path straight from the repository directory as a static file.
With those three routes in place, both a full clone and a shallow clone work
without a live git backend.

## Verify

You have reached the outcome of this guide when:

- `PackBuilder.build()` writes `packs/raw/<name>.tar.gz`,
  `packs/apm/<name>.tar.gz`, and `packs/apm/<name>/` for every combination.
- A re-run of `build()` with the same combinations and version produces
  byte-identical tarballs.
- A `git clone` of `packs/apm/<name>/` checks out the pack at the tagged
  version. This includes `--depth=1` against a static host with the three
  `smart-http` routes.

## What's next

<div class="grid">

<!-- part:card:.. -->

<!-- part:card:../discovery-index -->

</div>
