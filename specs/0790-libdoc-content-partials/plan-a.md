# Plan-A — Spec 0790: Libdoc Content Partials

Spec: [spec.md](spec.md) · Design: [design-a.md](design-a.md)

## Approach

Extract file discovery and frontmatter collection into `page-tree.js`
(`scanPages`), add `partials.js` (`resolvePartials` + `defaultRegistry`), then
slim `builder.js` to orchestrate the pipeline. Rename all `Docs`/`Site`
vocabulary to `Page`/`Pages` per the design's naming goal — no
backward-compatibility shims. After the library ships, migrate the 17 hub pages
from hand-written cards to `<!-- part:card:path -->` markers.

Libraries used: none (new modules are internal to libdoc).

## Parts

| Part | Scope | Dependencies |
|---|---|---|
| [plan-a-01.md](plan-a-01.md) | Library rearchitecture + tests | None |
| [plan-a-02.md](plan-a-02.md) | Hub page migration | Part 1 |

## Risks

- **Concurrent worktrees reference `DocsBuilder`/`DocsServer`.** The rename
  will conflict with branches that import the old names. Those branches must
  rebase after this lands — there is no compatibility shim by design.

## Execution

Sequential: Part 1 then Part 2. Both route to `staff-engineer`. Part 2 is
mechanically large (17 pages, ~90 card replacements) but independent once the
builder supports partials.
