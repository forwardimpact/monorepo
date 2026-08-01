# Design 042-a — `todo list --filter`

This design implements [spec.md](./spec.md). It adds a `--filter <substring>`
option on `todo list`. The option shows only the todos whose text contains the
substring. The match ignores case.

## Architecture

Two components carry the change. The stored todo shape is untouched.

| Component | Role in this change |
| --- | --- |
| `src/store.js` | Gains a pure `filterTodos(todos, substring)` selector that returns the subset that matches. The selection logic lives here, beside the other pure store functions. A unit test can check it with no CLI subprocess. |
| `bin/todo.js` | Parses `--filter` from the `list` invocation. Routes the loaded todos through `filterTodos` before it prints them. The CLI stays a thin shell. |

Data flow for `list`:

```mermaid
flowchart LR
    A[argv] -->|parseArgs| B[bin/todo.js: list]
    C[(todos.json)] -->|load| B
    B -->|filterTodos(todos, sub)| D[matching subset]
    D -->|formatTodo| E[stdout]
```

When `--filter` is absent, `bin/todo.js` prints the loaded todos directly. This
preserves today's behaviour.

## Key Decisions

| Decision | Choice | Rejected alternative |
| --- | --- | --- |
| Where selection lives | A pure `filterTodos` in `src/store.js` | An inline `.filter()` in `bin/todo.js`. Rejected because a unit test could not check it without a subprocess. That also breaks the store's pure-function pattern. |
| Case sensitivity | Case-insensitive (lower-case both sides before the comparison) | A case-sensitive match. Rejected because the spec requires a substring to match at any capitalisation. The morning scan should not depend on exact case. |
| Match target | The todo `text` only | A match on `id` or on the rendered line. Rejected because the spec scopes the match to todo text. A match on the rendered `[ ] 1` prefix would let a digit substring hit unrelated ids. |
| No-match result | Print nothing, exit 0 | A "no matches" message or a non-zero exit. Rejected because an empty list is a valid result. An empty list is not an error. A downstream pipe expects clean empty output. |

## Constraints

- `filterTodos` is pure. It returns a new array. It does not mutate or persist.
- `filterTodos` preserves the order. The subset keeps the todos' existing
  sequence.
- No change to `add`, `done`, `load`, `save`, or the on-disk JSON shape.
