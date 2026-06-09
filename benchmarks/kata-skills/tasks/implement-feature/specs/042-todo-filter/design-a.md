# Design 042-a — `todo list --filter`

Implements [spec.md](./spec.md): a `--filter <substring>` option on `todo list`
that shows only todos whose text contains the substring, case-insensitively.

## Architecture

Two components carry the change; the stored todo shape is untouched.

| Component | Role in this change |
| --- | --- |
| `src/store.js` | Gains a pure `filterTodos(todos, substring)` selector that returns the matching subset. Selection logic lives here, alongside the other pure store functions, so it is unit-testable without spawning the CLI. |
| `bin/todo.js` | Parses `--filter` from the `list` invocation and routes the loaded todos through `filterTodos` before printing. The CLI stays a thin shell. |

Data flow for `list`:

```mermaid
flowchart LR
    A[argv] -->|parseArgs| B[bin/todo.js: list]
    C[(todos.json)] -->|load| B
    B -->|filterTodos(todos, sub)| D[matching subset]
    D -->|formatTodo| E[stdout]
```

When `--filter` is absent, `bin/todo.js` prints the loaded todos directly,
preserving today's behaviour.

## Key Decisions

| Decision | Choice | Rejected alternative |
| --- | --- | --- |
| Where selection lives | A pure `filterTodos` in `src/store.js` | Inlining the `.filter()` in `bin/todo.js` — rejected because it would not be unit-testable without spawning a subprocess, breaking the store's pure-function pattern. |
| Case sensitivity | Case-insensitive (lower-case both sides before comparing) | Case-sensitive matching — rejected because the spec requires a substring to match regardless of capitalisation, and morning scanning should not depend on exact case. |
| Match target | The todo `text` only | Matching `id` or the rendered line — rejected because the spec scopes matching to todo text, and matching the rendered `[ ] 1` prefix would let a digit substring match unrelated ids. |
| No-match result | Print nothing, exit 0 | Printing a "no matches" message or non-zero exit — rejected because an empty list is a valid result, not an error, and downstream piping expects clean empty output. |

## Constraints

- `filterTodos` is pure: it returns a new array and does not mutate or persist.
- Order is preserved — the subset keeps the todos' existing sequence.
- No change to `add`, `done`, `load`, `save`, or the on-disk JSON shape.
