# Plan 042-a — `todo list --filter`

Executes [design-a.md](./design-a.md) for [spec.md](./spec.md).

## Approach

Add a pure `filterTodos` selector to the store, then route `list` output through
it when `--filter` is supplied; the CLI stays a thin shell and the stored shape
is untouched.

## Step 1 — Add `filterTodos` to the store

Add a pure, case-insensitive substring selector beside the other store helpers.

- Modified: `src/store.js`

```js
/** Return todos whose text contains substring, case-insensitively. */
export function filterTodos(todos, substring) {
  const needle = String(substring ?? "").toLowerCase();
  return todos.filter((t) => t.text.toLowerCase().includes(needle));
}
```

Verification:
`node -e "import('./src/store.js').then(m=>console.log(m.filterTodos([{text:'Buy milk'}],'milk').length))"`
prints `1`.

## Step 2 — Apply the filter in the `list` command

Parse `--filter` and narrow the loaded todos before printing; unchanged when the
option is absent.

- Modified: `bin/todo.js`

```js
import { /* …existing… */ filterTodos } from "../src/store.js";

const { values, positionals } = parseArgs({
  args: argv,
  options: { filter: { type: "string" } },
  allowPositionals: true,
  strict: false,
});
```

In the `list` case, replace the loop source with the filtered set:

```js
case "list": {
  const shown =
    values.filter === undefined ? todos : filterTodos(todos, values.filter);
  for (const todo of shown) console.log(formatTodo(todo));
  break;
}
```

Verification: with two todos `apple` and `banana`, `todo list --filter app`
prints only the `apple` line; `todo list` prints both.

## Step 3 — Document the option in usage

Add the option to the `list` line of the `USAGE` string.

- Modified: `bin/todo.js`

```text
  todo list [--filter <substring>]   List todos (optionally narrowed)
```

Verification: `todo` with no args prints usage containing `--filter`.

Libraries used: none.

## Risks

- `parseArgs` with `strict: false` silently ignores unknown options, so a
  mistyped `--filter` would list everything rather than erroring — acceptable
  for this CLI but worth knowing when reading test failures.

## Execution

Single engineering agent, steps in order — Step 2 imports the symbol added in
Step 1.
