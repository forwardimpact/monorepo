# The rule kit

`rules` is either a static array of rule objects, or a `(ruleKit) => array`
factory that builds them from the helpers below.

## Rule object

```js
{
  id: "no-foo.import",           // stable identifier, shows in findings
  scope: "src-file",             // which subject group this rule judges
  severity: "fail",              // any finding fails the run
  when: (s, ctx) => !s.parseError,   // optional guard; falsy skips the subject
  check: (s, ctx) =>             // null = clean; an item, or an array of items
    s.usesFoo ? { detail: s.foo } : null,
  message: (s, item, ctx) =>     // one-line finding text
    `imports foo [${item.detail}]`,
  hint: "import bar instead",    // string, or (s, item, ctx) => string
}
```

- `check` returns `null` when clean, or a truthy **item** that becomes the
  finding. It may also return an **array of items**. One subject then yields
  many findings (e.g. one per line in violation). `message`/`hint` run once per
  item and receive `(subject, item, ctx)`.
- The finding's **location** is `path: subject.path ?? null` and
  `lineNo: item.lineNo ?? subject.lineNo ?? null`. A subject with no `path`
  renders as `(no path)`. So carry `path`/`lineNo` on the subject. You can
  instead set `lineNo` on the returned item to point at a specific line.
- `ctx` is the object `build` returned as `ctx`. The engine passes it unchanged
  to every rule. The engine groups rules by scope and iterates subjects in
  stable order. So `ctx` doubles as **shared mutable state** for cross-subject
  checks. Seed a `Map` in `ctx` and have `check` record-then-compare to flag
  duplicates or a missing counterpart.
- Keep one concern per rule. Two failure modes on one scope are two rules with
  two ids. Two ids are what make a finding attributable.

## Helpers (when `rules` is a factory)

```js
rules: ({ parseError, failAll, enumDriftRules }) => [ … ]
```

- `parseError(scope, { id?, hint? })` — fails any subject that carries a
  `parseError` string. It pairs with `scanAst`, which sets `parseError` on
  unparseable files. The default `id` is `<scope>.parse-error`. Always include
  it when a scope is AST-derived. A syntax error then becomes a finding, and
  the engine does not drop the file silently.
- `failAll(scope, { id, message, hint?, when? })` — fails every subject in the
  scope (its `check` always reports). Use it when the build step already decided
  each subject is a violation: every `grep` match, or a `restatementDrift`
  subject you gate with `when: (s) => !s.ok`. `message`/`hint` still receive
  `(subject, item, ctx)`.
- `enumDriftRules` — the enumeration-drift rule set. It pairs with the build
  kit's `enumDrift`. Expose it verbatim with
  `rules: (kit) => kit.enumDriftRules`.

## Output

Findings render in the same ESLint-style format as the other subcommands
(`error  <message>  <id>` then `→ <hint>`). `--json` gives
`{ result, failures, warnings }`. Severity `fail` is the norm. Any finding
fails the run. There is no "warn that passes". If it should not block, it is
not an invariant.
