---
title: "Render Templates with Project Overrides"
description: "Ship default templates with a package and let each project override any one of them. Two-tier Mustache resolution keeps generated output consistent across surfaces."
---

A tool generates files such as an agent profile, a config, and a report. The
output shape should be consistent everywhere the tool runs. But every project
wants to adjust a detail: a header, a footer, a single section. If you copy the
whole template to change one line, the project misses every later improvement to
the default. `@forwardimpact/libtemplate` resolves this with two tiers. A
package ships default templates. A project overrides any single one. It drops a
file of the same name into its own templates folder. Everything not overridden
falls through to the default.

## Prerequisites

- Node.js 22+
- Install libtemplate and the shared runtime helper:

```sh
npm install @forwardimpact/libtemplate @forwardimpact/libutil
```

Templates are [Mustache](https://mustache.github.io/), so they stay logic-free.
The data decides what renders. The template does not.

## How two-tier resolution works

You bind a loader to one defaults directory. That directory holds the templates
that ship with your package. Each `render` call may also name a project data
directory. When both are present, the loader checks the project first and the
package second:

| Order | Location                      | Role                  |
| ----- | ----------------------------- | --------------------- |
| 1     | `{dataDir}/templates/{name}`  | Project override      |
| 2     | `{defaultsDir}/{name}`        | Package default       |

The first file that exists wins. A project overrides one template by name and
does not touch the others. If a template does not exist, the loader raises an
error that lists every path checked. So a typo in a filename is easy to
diagnose.

## 1. Create the loader

Build a loader once, bound to your package's templates folder. The loader needs
a runtime. The runtime is the same ambient filesystem bag the rest of the stack
uses. It keeps the loader testable with an in-memory filesystem.

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

Ship your default templates in that `templates/` folder. You reference a file
named `agent.template.md` by that exact name.

## 2. Render a template

`render` loads a template, fills it with Mustache, and returns the result. Pass
a project data directory as the third argument to enable overrides.

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

If `/path/to/project/templates/agent.template.md` exists, the loader renders
that file instead of the package default. The data is the same. The wording is
the project's. Omit the project directory. The default then always renders.

## 3. Compose with partials

A template can include shared fragments with Mustache partials (`{{> header}}`).
Each partial resolves through the same two tiers. So a project can override a
single fragment, for example the header, and keep the default body. List the
partial filenames so the loader knows which fragments to resolve:

```js
loader.renderWithPartials(
  "agent.template.md",
  profile,
  ["header.partial.md", "footer.partial.md"],
  projectDir,
);
```

The loader looks up each named partial project-first and package-second, exactly
like the main template. A project that drops in its own `footer.partial.md`
changes every template that includes it, with no change to the package.

## Why this fits the shared-surface stack

The same rendered output is what a CLI writes to disk and what a web surface
serves. The template is data-driven and the override is by-name. So the output
stays consistent across surfaces. Each project keeps the small adjustments it
needs. To render markdown to a terminal or to HTML at display time, pair this
with the formatters in the
[shared-surface guide](/docs/libraries/every-surface/).

## Verify

- [ ] A `render` call with no project directory returns the package default.
- [ ] A same-named file under `{projectDir}/templates/` changes only that
      template's output.
- [ ] A template name with no file raises an error that lists every path
      checked.
- [ ] A `renderWithPartials` call resolves each named partial project-first.

## What's next

<div class="grid">

<!-- part:card:.. -->

<!-- part:card:../interactive-repl -->

</div>
