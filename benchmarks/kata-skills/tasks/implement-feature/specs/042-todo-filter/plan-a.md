# Plan 042-a — `todo list --filter`

This plan executes [design-a.md](./design-a.md) for [spec.md](./spec.md).

## Approach

Add a pure `filterTodos` selector to the store. Then route `list` output through
it when `--filter` is present. The CLI stays a thin shell. The stored shape is
untouched.

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

Parse `--filter`. Narrow the loaded todos before you print them. The output is
unchanged when the option is absent.

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
prints only the `apple` line. `todo list` prints both.

## Step 3 — Document the option in usage

Add the option to the `list` line of the `USAGE` string.

- Modified: `bin/todo.js`

```text
  todo list [--filter <substring>]   List todos (optionally narrowed)
```

Verification: `todo` with no args prints usage that contains `--filter`.

Libraries used: none.

## Risks

- `parseArgs` with `strict: false` silently ignores unknown options. So a
  mistyped `--filter` lists everything and raises no error. This is acceptable
  for this CLI. Keep it in mind when you read test failures.

## Execution

Use a single engineering agent. Run the steps in order. Step 2 imports the
symbol that Step 1 adds.
