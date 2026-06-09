# Spec 042 — `todo list --filter`

**Hire:** Empowered Engineers: Prepare for the Day Ahead

## Problem

The `todo list` command prints every todo in the store. Once the list grows past
a screenful, the engineer must scan all of it each morning to find the few items
relevant to what they are working on. The only workaround today is piping the
output into an external tool, which means the CLI does not serve the job on its
own. There is no way to narrow the list from within `todo`.

## Scope

In scope:

- A new `--filter <substring>` option on the `list` command.
- Selecting which stored todos are shown, by matching their text against the
  substring.
- The behaviour when the option is absent (the list is unchanged) and when the
  substring matches nothing (an empty result).

Non-goals:

- Filtering by completion state, id, or date.
- Persisting, saving, or deleting todos based on the filter.
- Changing `add` or `done`, or the stored shape of a todo.
- Regular-expression or fuzzy matching.

## Success

- Running `list` with no option prints the same todos as before this change.
- Running `list --filter <substring>` prints only todos whose text contains the
  substring, in their existing order.
- Matching ignores case, so a substring matches regardless of how either side is
  capitalised.
- A substring that matches no todo prints nothing and exits successfully.
