# The build kit

The engine binds one kit per run to the repo `root`, the module's own `dir`
(co-located config), and the `runtime` bag that fs and ripgrep route through.
The module declares policy; the kit owns the mechanism. Destructure what you
need:

```js
build({ scan, scanAst, walk, grep, config, root }) { … }
```

Two standing rules:

- Never import `fs`, `node:child_process`, the package itself, or any ambient
  dependency. A module loads via npx in consumer repos where none resolve.
- Return plain data from `build`. The rules decide pass or fail. The one
  exception is when the build step is the natural place to compute the violation
  set; then pair it with `failAll`.

## File collection

`scan({ dirs, match, skip?, under?, read? })` → `[{ path, rel, text? }]`

- `dirs` — repo-relative root directories to walk.
- `match(name)` — filename predicate selecting which files become subjects.
- `skip` — directory *names* pruned during recursion (`["node_modules",
  "dist", "test"]`). Names, not globs.
- `under: "src"` — restrict each `dirs` entry to the per-package
  `<dir>/<child>/src/**` shape. This is how you scan `src` but not its `test`
  sibling.
- `read: false` — return paths only, with no `text`.

`scanAst({ ...scan, extract, locations? })` → reads, parses, and merges
`extract(ast)` into each subject.

- A file that fails to parse becomes `{ path, rel, parseError }` instead. Always
  guard that scope with the `parseError` rule so a syntax error surfaces as a
  finding rather than a silently dropped file.
- `locations: true` attaches `node.loc`. Use `loc.start.line` for a finding's
  `lineNo`.

`parse(src, path, opts?)` and `walk(ast, visit)` are the lower-level seam. The
AST is **acorn** (`ecmaVersion: latest`, `sourceType: module`). `walk` is
depth-first over every typed node, skipping `loc`/`start`/`end`. Accumulate into
a closure:

```js
extract: (ast) => {
  const hits = [];
  walk(ast, (n) => { if (isBad(n)) hits.push(n.start); });
  return { hits };
}
```

## Search and agreement

`grep({ pattern | patterns, paths?, globs?, caseSensitive?, onlyMatching?,
dedupe? })` → `[{ path, lineNo, text, reason? }]`. Every match is a violation;
pair it with `failAll`.

- Matching is **case-insensitive unless `caseSensitive`** is set.
- `patterns` entries are strings, or objects `{ pattern, reason?, globs?,
  caseSensitive?, onlyMatching?, exclude? }`. Per-entry options override the call
  defaults, and `globs` merge.
- `exclude` — a RegExp tested against the raw `rel:lineNo:text` line, to drop
  false positives.
- `dedupe` — `false`, `true` (key on the raw line), or a key function over
  `{ path, rel, lineNo, text, raw, reason }`.

`restatementDrift({ entries, equal })` → the "one source restated across
consumers" scan (URLs, versions, any scalar).

- Each `entry` is `{ key, expected, consumers: [{ path, pattern }] }`.
- It matches each consumer line by line — native, not ripgrep, so colons in URLs
  survive — and emits one subject per match:
  `{ key, path, lineNo, restated, expected, ok }`.
- `restated` is capture group 1 (else the whole match), trimmed. `ok` is
  `equal(restated, expected, key)`. Gate a `failAll` on `when: (s) => !s.ok`.

## Enumeration drift

`enumDrift.build(registry)` and `enumDrift.seed(registry)` assert (or seed) that
every consumer's fenced `<!-- enum:TOPIC:PROPERTY -->` block matches its source
set. Pass the parsed registry (`config(topicsFile)`); expose the rule set with
`rules: (kit) => kit.enumDriftRules`.

A registry is `{ topics: [{ id, source, consumers }] }`:

- `source` is one of:
  - `{ type: "fs-glob", pattern, id: dirname|basename|basename-noext, exclude? }`
  - `{ type: "md-table", file, section, column, filter }`
- each consumer is `{ path, property: "count" | "list" | "both" }`.

Adding a topic of an existing source kind is a one-line registry edit, no code.

## Reading, config, listing

- `readText(path)` → text, or `null` when missing.
- `readJson(path)` → parsed object, or `null` when missing or invalid.
  (Both take a repo-relative or absolute path.)
- `config(name, fallback?)` → JSON/YAML read **beside the module** (resolved
  against `dir`, parsed by extension). Returns `fallback` (default `null`) when
  absent, empty, or unparseable. Keep deny/allow lists here so the rule and its
  data version together.
- `listDir(path, { dirsOnly?, filesOnly? })` → entry names, `[]` when missing.
- `lineAt(text, offset)` → the 1-based line for a char offset (pair with a
  `walk`-collected `node.start`).
- `glob(pattern)` → an anchored `RegExp` for matching `rel` (`**` spans
  segments, `*` a non-slash run).
