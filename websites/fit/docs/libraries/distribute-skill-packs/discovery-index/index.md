---
title: Publish a Skill Discovery Index
description: Emit a .well-known/skills/ discovery index so an agent can find and load skills over the web. You get a per-pack index plus a deduplicated index across every pack.
---

A tarball or a git repository is something a person installs. A **discovery
index** is something an agent reads. `@forwardimpact/libpack` emits a
`.well-known/skills/` index. The index is a standard location and a small JSON
manifest. An agent that fetches your host can list the skills available and
load any of them. It needs no package manager, and it clones nothing.

This guide covers how to emit the per-pack index and the aggregate index across
every pack. It builds on the programmatic pack build in
[Build Tarball and Git-Repo Packs](/docs/libraries/distribute-skill-packs/tarball-distribution/).
For the working-tree install path, see
[Distribute Skill Packs](/docs/libraries/distribute-skill-packs/).

## Prerequisites

- Node.js 22+
- A built pack, or the `PackBuilder` composition from the tarball guide.
  `PackBuilder.build()` emits the discovery index automatically alongside the
  tarballs and the git repo. You can also drive `DiscEmitter` on its own.

## What it produces

For each pack, the discovery emitter writes a self-contained index tree:

```text
<out>/packs/skills/<name>/
  .well-known/
    skills/
      index.json          # the discovery manifest
      <skill-name>/        # a copy of each skill, ready to fetch
```

`index.json` is the manifest an agent reads first. It carries a schema URL and
one entry per skill. Each entry holds the skill's name, its one-line
description, and the list of files that make it up:

```json
{
  "$schema": "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  "skills": [
    {
      "name": "demo-one",
      "description": "First demo skill",
      "files": ["SKILL.md"]
    }
  ]
}
```

The description and the file list come straight from each skill's `SKILL.md`.
The description comes from its front matter. The files come from the staged
directory. So the manifest never drifts from what you publish. Serve
`<out>/packs/skills/<name>/` from a static host. An agent can then `GET`
`/.well-known/skills/index.json`, pick a skill, and fetch its files from the
adjacent directory.

## The aggregate index

When you publish several packs, an agent should not have to know which pack a
skill lives in. So `PackBuilder.build()` also writes one **aggregate** index
that spans every pack:

```text
<out>/packs/skills/
  .well-known/skills/index.json   # every skill, across all packs
```

The emitter **deduplicates the aggregate by skill name**. If the same skill
appears in two packs, the aggregate lists it once. It takes the copy from the
first pack that contained it. A consumer points at one `.well-known/skills/`
location. The consumer sees the union of every skill you publish, with no
duplicates.

## Emit it on its own

`PackBuilder.build()` emits both indices for you. You can also produce a single
pack's index directly, for example after you edit a skill. Drive `DiscEmitter`:

```js
import { DiscEmitter } from "@forwardimpact/libpack";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

const disc = new DiscEmitter({ runtime: createDefaultRuntime() });

// skillsSrcDir holds one directory per skill, each with a SKILL.md.
const entries = await disc.emit(skillsSrcDir, "./dist/packs/skills/kata");
```

`emit()` returns the entries it wrote. That array is the same one that appears
under `skills` in `index.json`. So you can assert that the emitter indexed the
expected skills.

## Deterministic output

Like the tarball and git formats, the discovery index is byte-stable. The
emitter serializes the manifest with its object keys sorted recursively. It
lists skills in sorted order. So a rebuild of an unchanged pack produces an
identical `index.json`. A change to the manifest is always a real change to the
published skills.

## Verify

You have reached the outcome of this guide when:

- Each pack has a `<out>/packs/skills/<name>/.well-known/skills/index.json`
  that lists its skills with description and files.
- The aggregate `<out>/packs/skills/.well-known/skills/index.json` lists every
  skill across all packs, and each name appears once.
- `GET /.well-known/skills/index.json` against your static host returns the
  manifest, and the files named in each entry resolve next to it.

## What's next

<div class="grid">

<!-- part:card:.. -->

<!-- part:card:../tarball-distribution -->

</div>
