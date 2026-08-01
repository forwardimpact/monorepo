# Spec 042 — `todo list --filter`

**Hire:** Empowered Engineers: Prepare for the Day Ahead

## Problem

The `todo list` command prints every todo in the store. Once the list grows past
a screenful, the engineer must scan all of it each morning. The engineer scans
to find the few items relevant to the current work. The only workaround today is
to pipe the output into an external tool. The CLI therefore does not serve the
job on its own. There is no way to narrow the list from within `todo`.

## Scope

In scope:

- A new `--filter <substring>` option on the `list` command.
- The rule that selects which stored todos to show. It matches todo text
  against the substring.
- The behaviour when the option is absent (the list is unchanged) and when the
  substring matches nothing (an empty result).

Non-goals:

- Filters by completion state, id, or date.
- Changes that persist, save, or delete todos based on the filter.
- Changes to `add`, `done`, or the stored shape of a todo.
- Regular-expression or fuzzy matches.

## Success

- The `list` command with no option prints the same todos as before this change.
- `list --filter <substring>` prints only todos whose text contains the
  substring, in their existing order.
- The match ignores case, so a substring matches at any capitalisation on either
  side.
- When a substring matches no todo, the command prints nothing and exits
  successfully.
