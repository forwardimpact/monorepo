# The build kit

The engine binds a kit per run to the repo `root`, the module's own `dir` (for
co-located config), and the `runtime` bag. The module declares policy; the kit
owns the mechanism. Destructure what you need:

```js
build({ scan, scanAst, grep, config, root }) { … }
```

## File collection

- `scan({ dirs, match, skip?, under?, read? })` — collect files as
  `{ path, rel, text? }`. `match(name)` selects by filename; `skip` prunes
  directories; `under: "src"` restricts to the per-package `src`/`test` shape;
  `read: false` skips reading file text when you only need paths.
- `scanAst({ dirs, match, extract, locations?, … })` — read and parse each
  file, merging `extract(ast)` into the subject. A parse failure yields
  `{ path, rel, parseError }` — pair with the `parseError` rule helper.
- `parse(src, path, opts?)`, `walk(ast, visit)` — the lower-level AST seam when
  you need to traverse yourself.

## Search and agreement

- `grep({ pattern | patterns, paths?, globs?, caseSensitive?, onlyMatching?,
  dedupe? })` — ripgrep matches as `{ path, lineNo, text, reason? }`, with
  per-entry `exclude` and built-in de-duplication.
- `restatementDrift({ entries, equal })` — the shared "single source restated
  across consumers" scan and compare (a URL, a version, any scalar that must
  agree in many places).

## Reading and listing

- `readText(path)`, `readJson(path)` — read a file; `readJson` returns the
  parsed object or a falsy value on failure.
- `config(name, fallback?)` — read co-located JSON or YAML next to the module
  (deny-lists, allow-lists). Returns `fallback` when absent.
- `listDir(path, { dirsOnly? })` — list a directory's entries.
- `lineAt(text, offset)` — line number for a character offset.
- `glob(pattern)` — compile a glob to a `RegExp` for matching `rel` paths.

## Rules

- Never import `fs`, `node:child_process`, or any ambient runtime dependency.
  Everything routes through the kit so the module stays portable across repos.
- Return plain data from `build`. Decisions belong in the rules, not here —
  except where the build step is the natural place to compute a violation set
  (then pair with `failAll`).
- Keep co-located config (`*.yml`, `*.json`) beside the module so the rule and
  its data version together.
