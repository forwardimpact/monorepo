---
title: Publish a Skill Discovery Index
description: Emit a .well-known/skills/ discovery index so an agent can find and load skills over the web — a per-pack index plus a deduplicated index spanning every pack.
---

A tarball or a git repository is something a person installs. A **discovery
index** is something an agent reads. `@forwardimpact/libpack` emits a
`.well-known/skills/` index — a standard location and a small JSON manifest —
so an agent fetching your host can list the skills available and load any of
them, without a package manager and without cloning anything.

This guide covers emitting the per-pack index and the aggregate index across
every pack. It builds on the programmatic pack build in
[Build Tarball and Git-Repo Packs](/docs/libraries/distribute-skill-packs/tarball-distribution/);
for the working-tree install path, see
[Distribute Skill Packs](/docs/libraries/distribute-skill-packs/).

## Prerequisites

- Node.js 18+
- A built pack, or the `PackBuilder` composition from the tarball guide.
  `PackBuilder.build()` emits the discovery index automatically alongside the
  tarballs and the git repo; you can also drive `DiscEmitter` on its own.

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
one entry per skill — the skill's name, its one-line description, and the list of
files that make it up:

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

The description and the file list come straight from each skill's `SKILL.md` —
the description from its front matter, the files from the staged directory — so
the manifest never drifts from what is actually published. Serve
`<out>/packs/skills/<name>/` from a static host and an agent can `GET`
`/.well-known/skills/index.json`, pick a skill, and fetch its files from the
adjacent directory.

## The aggregate index

When you publish several packs, an agent should not have to know which pack a
skill lives in. `PackBuilder.build()` therefore also writes one **aggregate**
index that spans every pack:

```text
<out>/packs/skills/
  .well-known/skills/index.json   # every skill, across all packs
```

The aggregate is **deduplicated by skill name**: if the same skill appears in two
packs, it is listed once, taking the copy from the first pack that contained it.
A consumer points at one `.well-known/skills/` location and sees the union of
every skill you publish, with no duplicates.

## Emit it on its own

`PackBuilder.build()` emits both indices for you. To produce a single pack's
index directly — for example, regenerating it after editing a skill — drive
`DiscEmitter`:

```js
import { DiscEmitter } from "@forwardimpact/libpack";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

const disc = new DiscEmitter({ runtime: createDefaultRuntime() });

// skillsSrcDir holds one directory per skill, each with a SKILL.md.
const entries = await disc.emit(skillsSrcDir, "./dist/packs/skills/kata");
```

`emit()` returns the entries it wrote — the same array that appears under
`skills` in `index.json` — so you can assert the expected skills were indexed.

## Deterministic output

Like the tarball and git formats, the discovery index is byte-stable. The
manifest is serialized with its object keys sorted recursively, and skills are
listed in sorted order, so rebuilding an unchanged pack produces an identical
`index.json`. A change to the manifest is therefore always a real change to the
published skills.

## Verify

You have reached the outcome of this guide when:

- Each pack has a `<out>/packs/skills/<name>/.well-known/skills/index.json`
  listing its skills with description and files.
- The aggregate `<out>/packs/skills/.well-known/skills/index.json` lists every
  skill across all packs, with each name appearing once.
- `GET /.well-known/skills/index.json` against your static host returns the
  manifest, and the files named in each entry resolve next to it.

## What's next

<div class="grid">

<!-- part:card:.. -->

<!-- part:card:../tarball-distribution -->

</div>
