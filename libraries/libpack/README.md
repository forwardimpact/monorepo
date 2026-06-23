# libpack

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Pack distribution — tarballs, bare git repos, and skill discovery indices

<!-- END:description -->

## Key Exports

- `PackBuilder` — orchestrates stager + emitters per combination
- `PackStager` — stages directory trees per layout (full, APM, skills)
- `TarEmitter` — deterministic `.tar.gz` from a staged directory
- `GitEmitter` — static bare git repo from a staged directory
- `DiscEmitter` — `.well-known/skills/` discovery index
- `SkillPackPublisher` — stage a skill pack into a sibling repo working tree in
  APM's canonical `.apm/` layout (drives the `fit-pack` CLI)
- `APM_SKILLS_DIR` / `APM_AGENTS_DIR` / `apmAgentFilename` — the one definition
  of APM's source layout, shared by every staging path

## CLI

`fit-pack stage` writes a skill pack into a checked-out sibling repository:

```bash
fit-pack stage --prefix kata --with-agents \
  --into skills-repo --name kata-skills --pack-version 1.2.3 \
  --description "…" --readme-title "Kata Skills" --readme-intro "…"
```

It writes `<into>/.apm/skills/<name>/`, `<into>/.apm/agents/<name>.agent.md`,
`<into>/apm.yml`, and `<into>/README.md` deterministically.

## Composition

```js
import {
  PackBuilder, PackStager,
  TarEmitter, GitEmitter, DiscEmitter,
} from "@forwardimpact/libpack";

const builder = new PackBuilder({
  stager: new PackStager(),
  emitters: {
    tar: new TarEmitter(),
    git: new GitEmitter(),
    disc: new DiscEmitter(),
  },
});

const { packs } = await builder.build({
  combinations,
  outputDir: "./dist",
  version: "1.0.0",
});
```
