---
title: "Render Templates with Project Overrides"
description: "Ship default templates with a package and let each project override any one of them — two-tier Mustache resolution that keeps generated output consistent across surfaces."
---

When a tool generates files — an agent profile, a config, a report — the output
shape should be consistent everywhere the tool runs. But every project wants to
adjust a detail: a header, a footer, a single section. Copying the whole template
to change one line means the project misses every later improvement to the
default. `@forwardimpact/libtemplate` resolves this with two tiers: a package
ships default templates, and a project overrides any single one by dropping a
file of the same name into its own templates folder. Everything not overridden
falls through to the default.

## Prerequisites

- Node.js 22+
- Install libtemplate and the shared runtime helper:

```sh
npm install @forwardimpact/libtemplate @forwardimpact/libutil
```

Templates are [Mustache](https://mustache.github.io/), so they stay logic-free:
the data decides what renders, not the template.

## How two-tier resolution works

A loader is bound to one defaults directory — the templates that ship with your
package. Each `render` call may also name a project data directory. When both are
present, the loader checks the project first and the package second:

| Order | Location                      | Role                  |
| ----- | ----------------------------- | --------------------- |
| 1     | `{dataDir}/templates/{name}`  | Project override      |
| 2     | `{defaultsDir}/{name}`        | Package default       |

The first file that exists wins. A project overrides one template by name without
touching the others, and a missing template raises an error that lists every path
checked, so a typo in a filename is easy to diagnose.

## 1. Create the loader

Build a loader once, bound to your package's templates folder. The loader needs a
runtime — the same ambient filesystem bag the rest of the stack uses — which keeps
the loader testable with an in-memory filesystem.

```js
// src/render.js
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createTemplateLoader } from "@forwardimpact/libtemplate";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

const here = dirname(fileURLToPath(import.meta.url));
const defaultsDir = join(here, "..", "templates");

const loader = createTemplateLoader(defaultsDir, createDefaultRuntime());
```

Ship your default templates in that `templates/` folder. A file named
`agent.template.md` is referenced by that exact name.

## 2. Render a template

`render` loads a template, fills it with Mustache, and returns the result. Pass a
project data directory as the third argument to enable overrides.

```js
// templates/agent.template.md
# {{name}}

{{role}}

export function renderAgent(profile, projectDir) {
  return loader.render("agent.template.md", profile, projectDir);
}
```

```js
renderAgent({ name: "Reviewer", role: "Grades diffs." }, "/path/to/project");
```

```text
# Reviewer

Grades diffs.
```

If `/path/to/project/templates/agent.template.md` exists, the loader renders that
file instead of the package default — same data, project's wording. Omit the
project directory and the default always renders.

## 3. Compose with partials

A template can include shared fragments with Mustache partials (`{{> header}}`).
Each partial resolves through the same two tiers, so a project can override a
single fragment — say the header — while keeping the default body. List the
partial filenames so the loader knows which fragments to resolve:

```js
loader.renderWithPartials(
  "agent.template.md",
  profile,
  ["header.partial.md", "footer.partial.md"],
  projectDir,
);
```

Each named partial is looked up project-first, package-second, exactly like the
main template. A project that drops in its own `footer.partial.md` changes every
template that includes it, with no change to the package.

## Why this fits the shared-surface stack

The same rendered output is what a CLI writes to disk and what a web surface
serves. Because the template is data-driven and the override is by-name, the
output stays consistent across surfaces while each project keeps the small
adjustments it needs. For rendering markdown to a terminal or to HTML at display
time, pair this with the formatters in the
[shared-surface guide](/docs/libraries/every-surface/).

## Verify

- [ ] A `render` call with no project directory returns the package default.
- [ ] Dropping a same-named file under `{projectDir}/templates/` changes only
      that template's output.
- [ ] A missing template name raises an error listing every path checked.
- [ ] A `renderWithPartials` call resolves each named partial project-first.

## What's next

<div class="grid">

<!-- part:card:.. -->

<!-- part:card:../interactive-repl -->

</div>
